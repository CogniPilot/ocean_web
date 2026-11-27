#define _POSIX_C_SOURCE 200809L
#include <omp.h>
#include <mujoco/mujoco.h>
#include <stdio.h>
#include <stdlib.h>
#include "rmc_functions.c"
#include "fixture.h"
#include "cases.h"
#include "tree-accel.h"

enum { lanes = 64, steps = 100, repeats_trajectory = 7 };
static Case initial[lanes];
static mjData *workers[lanes];
static const double dt = .01;
typedef struct {
  double p[21], v[20], a[20];
} State;
static State reference[lanes][steps];
static double forces[lanes][steps][20];
static mjModel *model;

static void reset(int lane) {
  mjData *d = workers[lane], *start = initial[lane].mj;
  memcpy(d->qpos, start->qpos, 21 * sizeof(double));
  memcpy(d->qvel, start->qvel, 20 * sizeof(double));
}
static void advance(mjData *d, int engine, const double effort[20]) {
  mju_rotVecQuat(d->qfrc_applied, effort + 3, d->qpos + 3);
  memcpy(d->qfrc_applied + 3, effort, 3 * sizeof(double));
  memcpy(d->qfrc_applied + 6, effort + 6, 14 * sizeof(double));
  if (engine)
    mj_forward(model, d);
  else
    rumocaAccel(model, d, d->qacc, parent, offset, mount, axis, inertia, armature);
  for (int k = 0; k < 20; k++)
    d->qvel[k] += dt * d->qacc[k];
  mj_integratePos(model, d->qpos, d->qvel, dt);
}
static double run(int engine, int store) {
  double sum = 0;
#pragma omp parallel for reduction(+ : sum) schedule(static)
  for (int lane = 0; lane < lanes; lane++) {
    mjData *d = workers[lane];
    reset(lane);
    for (int i = 0; i < steps; i++) {
      advance(d, engine, forces[lane][i]);
      if (store) {
        State *r = &reference[lane][i];
        memcpy(r->p, d->qpos, sizeof(r->p));
        memcpy(r->v, d->qvel, sizeof(r->v));
        memcpy(r->a, d->qacc, sizeof(r->a));
      }
    }
    for (int j = 0; j < 21; j++)
      sum += d->qpos[j];
  }
  return sum;
}
static double maxError(const double *a, const double *b, int n) {
  double error = 0;
  for (int k = 0; k < n; k++) {
    if (!isfinite(a[k]) || !isfinite(b[k]))
      abort();
    error = fmax(error, fabs(a[k] - b[k]));
  }
  return error;
}
static int ascending(const void *a, const void *b) {
  double x = *(const double *)a, y = *(const double *)b;
  return (x > y) - (x < y);
}
int main(int argc, char **argv) {
  if (argc != 2 || mj_version() != 4000001 || mj_version() != mjVERSION_HEADER)
    return 1;
  char message[1024];
  model = mj_loadXML(argv[1], NULL, message, sizeof(message));
  if (!model) {
    fprintf(stderr, "%s\n", message);
    return 1;
  }
  if (model->nv != 20 || model->ngeom || model->nu || model->neq)
    return 1;
  for (int j = 0; j < lanes; j++) {
    make_case(initial + j, model, j);
    workers[j] = mj_makeData(model);
    for (int i = 0; i < steps; i++)
      for (int k = 0; k < 20; k++)
        forces[j][i][k] = initial[j].effort[k] + .7 * sin(.021 * i + .3 * k + .41 * j);
  }
  run(0, 1);
  double pos = 0, angle = 0, hinge = 0, vel = 0, accel = 0;
  for (int j = 0; j < lanes; j++) {
    reset(j);
    for (int i = 0; i < steps; i++) {
      mjData *d = workers[j];
      advance(d, 1, forces[j][i]);
      State *r = &reference[j][i];
      double orientation[3];
      mju_subQuat(orientation, d->qpos + 3, r->p + 3);
      pos = fmax(pos, maxError(d->qpos, r->p, 3));
      angle = fmax(angle, mju_norm3(orientation));
      hinge = fmax(hinge, maxError(d->qpos + 7, r->p + 7, 14));
      vel = fmax(vel, maxError(d->qvel, r->v, 20));
      accel = fmax(accel, maxError(d->qacc, r->a, 20));
    }
  }
  printf("dry diver 64 x 100, dt .01. max errors xyz_m %.8g orientation_rad %.8g hinge_rad %.8g "
         "velocity %.8g acceleration %.8g\n",
         pos, angle, hinge, vel, accel);
  if (pos > 1e-9 || angle > 1e-9 || hinge > 1e-9 || vel > 1e-8 || accel > 1e-7)
    return 1;
  double times[2][repeats_trajectory], sum[2] = {0};
  for (int r = -1; r < repeats_trajectory; r++)
    for (int pass = 0; pass < 2; pass++) {
      int e = (r + 1 + pass) % 2;
      double start = mono(), c = run(e, 0), elapsed = mono() - start;
      if (r >= 0) {
        times[e][r] = elapsed;
        sum[e] += c;
      }
    }
  for (int e = 0; e < 2; e++) {
    qsort(times[e], repeats_trajectory, sizeof(double), ascending);
    double median = times[e][repeats_trajectory / 2];
    printf("%s threads %d seconds_min_med_max %.6f %.6f %.6f aggregate_steps_per_s %.0f "
           "instance_realtime %.3f checksum %.9g\n",
           e ? "mujoco_dry_diver" : "rumoca_dry_diver", omp_get_max_threads(), times[e][0], median,
           times[e][repeats_trajectory - 1], lanes * steps / median, steps * dt / median, sum[e]);
  }
  for (int j = 0; j < lanes; j++) {
    mj_deleteData(workers[j]);
    mj_deleteData(initial[j].mj);
  }
  mj_deleteModel(model);
  return 0;
}
