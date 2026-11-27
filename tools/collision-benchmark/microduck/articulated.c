// Ground wrenches and forward accelerations are evaluated independently in both rollouts.
#define _POSIX_C_SOURCE 200809L
#include <mujoco/mujoco.h>
#include <omp.h>
#include <stdio.h>
#include <stdlib.h>
#include "rmc_functions.c"
#include "contact.h"
extern int walking_force(const double *x, double *y);
enum { lanes = 64, steps = 250, frames = 201, nv = 20, poses = 21, reps = 5 };
static const double dt = .001;
typedef struct {
  double p[3], R[9], q[14], v[14], tau[14];
} Sample;
typedef struct {
  double q[poses], v[nv], a[nv], load[2];
} State;
static Sample gait[frames];
static mjModel *m;
static mjData *workers[lanes];
static int64_t parents[15];
static double offsets[14][3], mounts[14][9], axes[14][3], armatures[14], inertias[15][36];
static State trace[lanes][steps];
static int site[2];
static void treeParameters(void) {
  for (int b = 1; b < m->nbody; b++) {
    int j = m->body_jntadr[b];
    parents[b - 1] = m->body_parentid[b];
    if (b > 1) {
      memcpy(offsets[b - 2], m->body_pos + 3 * b, 3 * sizeof(double));
      memcpy(axes[b - 2], m->jnt_axis + 3 * j, 3 * sizeof(double));
      mju_quat2Mat(mounts[b - 2], m->body_quat + 4 * b);
      armatures[b - 2] = m->dof_armature[m->jnt_dofadr[j]];
    }
    const double *c = m->body_ipos + 3 * b, *diag = m->body_inertia + 3 * b;
    double mass = m->body_mass[b], R[9], skew[9] = {0, -c[2], c[1], c[2], 0, -c[0], -c[1], c[0], 0};
    mju_quat2Mat(R, m->body_iquat + 4 * b);
    double *I = inertias[b - 1];
    for (int i = 0; i < 3; i++)
      for (int k = 0; k < 3; k++) {
        for (int h = 0; h < 3; h++)
          I[i * 6 + k] +=
              R[3 * i + h] * diag[h] * R[3 * k + h] + mass * skew[3 * i + h] * skew[3 * k + h];
        I[6 * i + 3 + k] = I[(k + 3) * 6 + i] = mass * skew[3 * i + k];
        I[(i + 3) * 6 + 3 + k] = (i == k ? mass : 0);
      }
  }
}
#include "../../../scripts/benchmarks/diver-dynamics/tree-accel.h"
static int firstFrame(int lane) { return lane * 185 / (lanes - 1); }
static void reset(mjData *d, int lane) {
  mj_resetData(m, d);
  const Sample *a = gait + firstFrame(lane), *b = a + 1;
  memcpy(d->qpos, a->p, 3 * sizeof(double));
  mju_mat2Quat(d->qpos + 3, a->R);
  memcpy(d->qpos + 7, a->q, sizeof(a->q));
  for (int i = 0; i < 3; i++)
    d->qvel[i] = (b->p[i] - a->p[i]) / .02;
  double next[4];
  mju_mat2Quat(next, b->R);
  mju_subQuat(d->qvel + 3, next, d->qpos + 3);
  for (int i = 3; i < 6; i++)
    d->qvel[i] /= .02;
  memcpy(d->qvel + 6, a->v, sizeof(a->v));
}
static void advance(mjData *d, int engine, int tick, double load[2]) {
  // Shared FK and two site Jacobians supply the links' current spatial motion and J^T wrench.
  mj_kinematics(m, d);
  mj_comPos(m, d);
  const Sample *a = gait + tick / 20, *b = a + 1;
  double t = (tick % 20) / 20.;
  mju_zero(d->qfrc_applied, nv);
  for (int i = 0; i < 14; i++)
    d->qfrc_applied[i + 6] = a->tau[i] + t * (b->tau[i] - a->tau[i]);
  for (int f = 0; f < 2; f++) {
    int id = site[f];
    double x[18], y[6], jp[3 * nv], jr[3 * nv], omega[3];
    memcpy(x, d->site_xpos + 3 * id, 3 * sizeof(double));
    mju_transpose(x + 3, d->site_xmat + 9 * id, 3, 3);
    mj_jacSite(m, d, jp, jr, id);
    mju_mulMatVec(omega, jr, d->qvel, 3, nv);
    mju_mulMatVec3(x + 12, x + 3, omega);
    mju_mulMatVec(x + 15, jp, d->qvel, 3, nv);
    if (engine)
      nativeWrench(m, d, x, y);
    else if (walking_force(x, y))
      abort();
    load[f] = y[2];
    for (int k = 0; k < nv; k++)
      for (int axis = 0; axis < 3; axis++)
        d->qfrc_applied[k] += jp[axis * nv + k] * y[axis] + jr[axis * nv + k] * y[3 + axis];
  }
  if (engine) {
    // FK and COM were already updated above. Complete the native unconstrained dynamics pipeline.
    mj_crb(m, d);
    mj_factorM(m, d);
    mj_comVel(m, d);
    mj_rne(m, d, 0, d->qfrc_bias);
    mj_fwdAcceleration(m, d);
    memcpy(d->qacc, d->qacc_smooth, nv * sizeof(double));
  } else
    rumocaAccel(m, d, d->qacc, parents, offsets, mounts, axes, inertias, armatures);
  for (int i = 0; i < nv; i++)
    d->qvel[i] += dt * d->qacc[i];
  mj_integratePos(m, d->qpos, d->qvel, dt);
}
static void capture(State *s, const mjData *d, const double load[2]) {
  memcpy(s->q, d->qpos, sizeof(s->q));
  memcpy(s->v, d->qvel, sizeof(s->v));
  memcpy(s->a, d->qacc, sizeof(s->a));
  memcpy(s->load, load, sizeof(s->load));
}
static double roll(int engine, int save) {
  double checksum = 0;
#pragma omp parallel for schedule(static) reduction(+ : checksum)
  for (int lane = 0; lane < lanes; lane++) {
    mjData *d = workers[lane];
    reset(d, lane);
    for (int i = 0; i < steps; i++) {
      double loads[2];
      advance(d, engine, 20 * firstFrame(lane) + i, loads);
      if (save)
        capture(&trace[lane][i], d, loads);
    }
    for (int k = 0; k < poses; k++)
      checksum += d->qpos[k];
  }
  return checksum;
}
static double maxDiff(const double *a, const double *b, int n) {
  double e = 0;
  for (int i = 0; i < n; i++) {
    if (!isfinite(a[i]) || !isfinite(b[i]))
      abort();
    e = fmax(e, fabs(a[i] - b[i]));
  }
  return e;
}
static int check(void) {
  double error[6] = {0}, minz = 10, mintilt = 1, travel = 0, reftravel = 0, weighted = 0;
  int support[4] = {0};
  roll(0, 1);
  for (int lane = 0; lane < lanes; lane++) {
    mjData *d = workers[lane];
    reset(d, lane);
    const Sample *start = gait + firstFrame(lane);
    for (int t = 0; t < steps; t++) {
      State *r = &trace[lane][t];
      double loads[2], orient[3], rotation[9];
      advance(d, 1, 20 * firstFrame(lane) + t, loads);
      mju_subQuat(orient, d->qpos + 3, r->q + 3);
      mju_quat2Mat(rotation, d->qpos + 3);
      error[0] = fmax(error[0], maxDiff(d->qpos, r->q, 3));
      error[1] = fmax(error[1], mju_norm3(orient));
      error[2] = fmax(error[2], maxDiff(d->qpos + 7, r->q + 7, 14));
      error[3] = fmax(error[3], maxDiff(d->qvel, r->v, nv));
      error[4] = fmax(error[4], maxDiff(d->qacc, r->a, nv));
      error[5] = fmax(error[5], maxDiff(loads, r->load, 2));
      minz = fmin(minz, d->qpos[2]);
      mintilt = fmin(mintilt, rotation[8]);
      support[(loads[0] > .1) + 2 * (loads[1] > .1)]++;
      weighted += loads[0] + loads[1];
    }
    travel += hypot(d->qpos[0] - start->p[0], d->qpos[1] - start->p[1]);
    const Sample *finish = start + steps / 20;
    double fx = .5 * (finish[0].p[0] + finish[1].p[0]), fy = .5 * (finish[0].p[1] + finish[1].p[1]);
    reftravel += hypot(fx - start->p[0], fy - start->p[1]);
  }
  printf("articulated 64 x %d, dt %.3f. max errors xyz_m %.6g angle_rad %.6g hinge_rad %.6g velocity "
         "%.6g acceleration %.6g load_N %.6g\n",
         steps, dt, error[0], error[1], error[2], error[3], error[4], error[5]);
  printf("support (none,left,right,both) %d %d %d %d, load_in_bodyweights %.6f min_trunk_height_m %.6f "
         "max_tilt_deg %.6f mean_horizontal_root_travel_m %.6f source_m %.6f\n",
         support[0], support[1], support[2], support[3],
         weighted / (steps * lanes * mj_getTotalmass(m) * 9.80665), minz,
         acos(mintilt) * 180 / 3.141592653589793, travel / lanes, reftravel / lanes);
  return error[0] < 1e-6 && error[1] < 1e-5 && error[2] < 1e-5 && error[3] < .001 && error[4] < 1 &&
         error[5] < .01 && support[1] && support[2] && minz > .05 && mintilt > .5;
}
static int ascending(const void *a, const void *b) {
  double x = *(const double *)a, y = *(const double *)b;
  return (x > y) - (x < y);
}
int main(int argc, char **argv) {
  if (argc != 3 || mj_version() != 4000001 || mj_version() != mjVERSION_HEADER)
    return 1;
  char error[1024];
  m = mj_loadXML(argv[1], NULL, error, sizeof(error));
  if (!m) {
    fprintf(stderr, "%s\n", error);
    return 1;
  }
  if (m->nv != nv || m->nq != poses || m->nbody != 16 || m->nsite != 2 || m->ngeom != 2)
    return 1;
  site[0] = mj_name2id(m, mjOBJ_SITE, "left_foot");
  site[1] = mj_name2id(m, mjOBJ_SITE, "right_foot");
  FILE *f = fopen(argv[2], "r");
  if (!f)
    return 1;
  for (int j = 0; j < frames; j++) {
    double *fields[] = {gait[j].p, gait[j].R, gait[j].q, gait[j].v, gait[j].tau};
    int count[] = {3, 9, 14, 14, 14};
    for (int h = 0; h < 5; h++)
      for (int i = 0; i < count[h]; i++)
        if (fscanf(f, "%lf", fields[h] + i) != 1)
          return 1;
  }
  fclose(f);
  treeParameters();
  for (int j = 0; j < lanes; j++)
    workers[j] = mj_makeData(m);
  if (!check())
    return 1;
  double times[2][reps], sum[2] = {0};
  for (int r = -1; r < reps; r++)
    for (int pass = 0; pass < 2; pass++) {
      int engine = (r + 1 + pass) % 2;
      double start = omp_get_wtime(), c = roll(engine, 0), elapsed = omp_get_wtime() - start;
      if (r >= 0) {
        times[engine][r] = elapsed;
        sum[engine] += c;
      }
    }
  for (int j = 0; j < 2; j++) {
    qsort(times[j], reps, sizeof(double), ascending);
    double med = times[j][reps / 2];
    printf("%s threads %d seconds_min_med_max %.6f %.6f %.6f aggregate_steps_per_s %.0f "
           "instance_realtime %.3f checksum %.9g\n",
           j ? "mujoco_articulated" : "rumoca_articulated", omp_get_max_threads(), times[j][0], med,
           times[j][reps - 1], lanes * steps / med, steps * dt / med, sum[j]);
  }
  for (int j = 0; j < lanes; j++)
    mj_deleteData(workers[j]);
  mj_deleteModel(m);
  return 0;
}
