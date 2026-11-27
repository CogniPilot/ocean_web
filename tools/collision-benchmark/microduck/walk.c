// Gait-relative foot kinematics are prescribed. The centre of mass responds to both feet.
#include <math.h>
#include <omp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <mujoco/mujoco.h>
#include "model.h"

enum { lanes = 64, horizon = 3500, samples = 201, ticks = 4000, repeats = 7 };
static const double dt = .001;
static double mass;
typedef struct {
  double p[3], R[9];
} Pose;
typedef struct {
  double p[3];
  Pose sole[2];
} Frame;
typedef struct {
  double p[3], v[3], x[2][18];
} Tick;
typedef struct {
  double p[3], v[3], wrench[2][6];
} State;
static Tick gait[ticks];
static State trace[lanes][horizon];
static mjModel *model;
static mjData *data[lanes];

static double readNumber(FILE *input) {
  double n;
  if (fscanf(input, "%lf", &n) != 1 || !isfinite(n)) {
    fputs("Invalid gait fixture\n", stderr);
    exit(1);
  }
  return n;
}
static void prepare(FILE *input) {
  Frame frames[samples];
  if (readNumber(input) != samples)
    exit(1);
  mass = readNumber(input);
  for (int i = 0; i < samples; i++) {
    if (fabs(readNumber(input) - .02 * i) > 1e-8)
      exit(1);
    for (int k = 0; k < 3; k++)
      frames[i].p[k] = readNumber(input);
    for (int j = 0; j < 2; j++) {
      for (int k = 0; k < 3; k++)
        frames[i].sole[j].p[k] = readNumber(input);
      for (int k = 0; k < 9; k++)
        frames[i].sole[j].R[k] = readNumber(input);
    }
  }
  for (int i = 0; i < ticks; i++) {
    Frame *a = frames + i / 20, *b = a + 1;
    double t = (i % 20) * dt;
    Tick *g = gait + i;
    for (int k = 0; k < 3; k++) {
      g->v[k] = (b->p[k] - a->p[k]) / .02;
      g->p[k] = a->p[k] + t * g->v[k];
    }
    for (int j = 0; j < 2; j++) {
      double qa[4], qb[4], R[9], *x = g->x[j];
      Pose *pa = a->sole + j, *pb = b->sole + j;
      mju_mat2Quat(qa, pa->R);
      mju_mat2Quat(qb, pb->R);
      mju_subQuat(x + 12, qb, qa);
      for (int k = 0; k < 3; k++) {
        x[12 + k] /= .02;
        x[15 + k] = (pb->p[k] - pa->p[k]) / .02;
        x[k] = pa->p[k] + t * x[15 + k];
      }
      mju_quatIntegrate(qa, x + 12, t);
      mju_quat2Mat(R, qa);
      mju_transpose(x + 3, R, 3, 3);
    }
  }
}

#include "contact.h"

static int phase(int lane) { return lane * 7; }
static State initial(int lane) {
  State s = {0};
  memcpy(s.p, gait[phase(lane)].p, sizeof(s.p));
  memcpy(s.v, gait[phase(lane)].v, sizeof(s.v));
  s.p[2] += (lane - 31.5) * .00001;
  return s;
}
static void advance(State *s, const Tick *g, int engine, int lane) {
  for (int j = 0; j < 2; j++) {
    double x[18];
    memcpy(x, g->x[j], sizeof(x));
    mju_addTo3(x, s->p);
    mju_addTo3(x + 15, s->v);
    if (engine == 0) {
      if (WALKING_SOLE((const double *[]){x}, s->wrench[j], NULL))
        abort();
    } else
      nativeWrench(model, data[lane], x, s->wrench[j]);
  }
  for (int k = 0; k < 3; k++) {
    double a = (s->wrench[0][k] + s->wrench[1][k]) / mass - (k == 2 ? 9.80665 : 0);
    s->v[k] += dt * a;
    s->p[k] += dt * s->v[k];
  }
}
static double rollout(int engine, int store) {
  double checksum = 0;
#pragma omp parallel for reduction(+ : checksum) schedule(static)
  for (int lane = 0; lane < lanes; lane++) {
    State s = initial(lane);
    for (int i = 0; i < horizon; i++) {
      advance(&s, gait + phase(lane) + i, engine, lane);
      if (store)
        trace[lane][i] = s;
    }
    checksum += s.p[0] + s.p[1] + s.p[2] + s.v[0] + s.v[1] + s.v[2];
  }
  return checksum;
}
static double err(double a, double b) {
  if (!isfinite(a) || !isfinite(b)) {
    fputs("Nonfinite trajectory\n", stderr);
    exit(1);
  }
  return fabs(a - b);
}
static int verify(void) {
  rollout(0, 1);
  double pos = 0, vel = 0, force = 0, torque = 0, normalImpulse = 0, horizontalImpulse = 0, maxDepth = 0;
  double displacement = 0, recordedDisplacement = 0, recordedRms = 0;
  int support[4] = {0};
  double sameForce = 0, sameTorque = 0;
  for (int lane = 0; lane < lanes; lane++) {
    State s = initial(lane), start = s;
    for (int i = 0; i < horizon; i++) {
      Tick *g = gait + phase(lane) + i;
      for (int j = 0; j < 2; j++) {
        const double *x = g->x[j];
        for (int c = 0; c < 4; c++) {
          double z =
              s.p[2] + x[2] + x[5] * (c < 2 ? -.035 : .035) + x[8] * (c % 2 ? .020 : -.020) - .003;
          maxDepth = fmax(maxDepth, -z);
        }
      }
      State identical = s;
      advance(&identical, g, 0, lane);
      advance(&s, g, 1, lane);
      for (int j = 0; j < 2; j++)
        for (int k = 0; k < 3; k++) {
          sameForce = fmax(sameForce, err(s.wrench[j][k], identical.wrench[j][k]));
          sameTorque = fmax(sameTorque, err(s.wrench[j][k + 3], identical.wrench[j][k + 3]));
        }
      State *ref = &trace[lane][i];
      for (int k = 0; k < 3; k++) {
        pos = fmax(pos, err(s.p[k], ref->p[k]));
        vel = fmax(vel, err(s.v[k], ref->v[k]));
        recordedRms += pow(s.p[k] - g[1].p[k], 2);
        for (int j = 0; j < 2; j++) {
          force = fmax(force, err(s.wrench[j][k], ref->wrench[j][k]));
          torque = fmax(torque, err(s.wrench[j][k + 3], ref->wrench[j][k + 3]));
        }
      }
      support[(s.wrench[0][2] > .1) + 2 * (s.wrench[1][2] > .1)]++;
      for (int j = 0; j < 2; j++) {
        normalImpulse += dt * s.wrench[j][2];
        horizontalImpulse += dt * hypot(s.wrench[j][0], s.wrench[j][1]);
      }
    }
    displacement += hypot(s.p[0] - start.p[0], s.p[1] - start.p[1]);
    const double *end = gait[phase(lane) + horizon].p;
    recordedDisplacement += hypot(end[0] - start.p[0], end[1] - start.p[1]);
  }
  printf("mass_kg %.8f lanes %d ticks_per_lane %d dt_s %.3f\n", mass, lanes, horizon, dt);
  printf("max_abs_interengine_position_m %.9g velocity_m_s %.9g foot_force_N %.9g foot_torque_Nm %.9g\n",
         pos, vel, force, torque);
  printf("same_input_max_foot_force_N %.9g torque_Nm %.9g\n", sameForce, sameTorque);
  printf("support_ticks_none_left_right_both %d %d %d %d max_penetration_m %.8g "
         "average_vertical_force_in_bodyweights %.8g tangential_impulse_Ns_per_lane %.8g\n",
         support[0], support[1], support[2], support[3], maxDepth,
         normalImpulse / (lanes * horizon * dt * mass * 9.80665), horizontalImpulse / lanes);
  printf("mean_horizontal_displacement_m %.8g source_recording_m %.8g "
         "centre_trajectory_vs_recording_rms_m %.8g\n",
         displacement / lanes, recordedDisplacement / lanes, sqrt(recordedRms / (lanes * horizon)));
  return sameForce < 1e-9 && sameTorque < 1e-10 && pos < 1e-6 && vel < 1e-5 && force < .01 &&
         torque < .0001 && support[1] > 0 && support[2] > 0 && normalImpulse > 0 &&
         horizontalImpulse > 0 && maxDepth < .01;
}
static int ascending(const void *a, const void *b) {
  double x = *(const double *)a, y = *(const double *)b;
  return (x > y) - (x < y);
}
int main(int argc, char **argv) {
  if (argc != 2 || mj_version() != 4000001 || mj_version() != mjVERSION_HEADER)
    return 1;
  FILE *input = fopen(argv[1], "r");
  if (!input)
    return 1;
  prepare(input);
  fclose(input);
  char error[512] = {0};
  mjSpec *spec = mj_parseXMLString("<mujoco><worldbody><geom type='plane' size='1 1 .01'/>"
                                   "<geom type='sphere' size='.003'/></worldbody></mujoco>",
                                   NULL, error, sizeof(error));
  model = spec ? mj_compile(spec, NULL) : NULL;
  if (!model) {
    fprintf(stderr, "%s\n", spec ? mjs_getError(spec) : error);
    return 1;
  }
  for (int i = 0; i < lanes; i++) {
    data[i] = mj_makeData(model);
    mj_forward(model, data[i]);
  }
  if (!verify())
    return 1;
  double durations[2][repeats], checksums[2] = {0};
  for (int rep = -1; rep < repeats; rep++)
    for (int pass = 0; pass < 2; pass++) {
      int engine = (rep + 1 + pass) % 2;
      double start = omp_get_wtime(), sum = rollout(engine, 0), elapsed = omp_get_wtime() - start;
      if (rep >= 0) {
        durations[engine][rep] = elapsed;
        checksums[engine] += sum;
      }
    }
  for (int e = 0; e < 2; e++) {
    qsort(durations[e], repeats, sizeof(double), ascending);
    double median = durations[e][repeats / 2];
    printf("%s threads %d seconds_min_med_max %.6f %.6f %.6f aggregate_steps_per_s %.0f "
           "instance_realtime %.3f checksum %.9g\n",
           e ? "mujoco_narrow_phase_with_matched_force" : "rumoca_ground_wrench", omp_get_max_threads(),
           durations[e][0], median, durations[e][repeats - 1], lanes * horizon / median,
           horizon * dt / median, checksums[e]);
  }
  for (int i = 0; i < lanes; i++)
    mj_deleteData(data[i]);
  mj_deleteModel(model);
  mj_deleteSpec(spec);
  return err(checksums[0], checksums[1]) > lanes * repeats * 6e-5;
}
