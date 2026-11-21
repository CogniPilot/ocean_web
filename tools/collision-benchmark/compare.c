// Both native narrow phases see the same precomputed poses. No solver or browser is involved.
#include <mujoco/mujoco.h>
#include "model.h"
#include <time.h>

enum { poses = 8192, rounds = 31, repeats = 8 };
static double centers[poses][3], zeros[3], world_to_box[9];
static uint32_t seed = 728391u;

static double uniform(void) {
  seed = 1664525u * seed + 1013904223u;
  return ((double)seed + 0.5) / 4294967296.0;
}

static double now(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec + 1e-9 * t.tv_nsec;
}

static int ascending(const void *a, const void *b) {
  double x = *(const double *)a, y = *(const double *)b;
  return (x > y) - (x < y);
}

int main(void) {
  if (mj_version() != 4000001 || mj_version() != mjVERSION_HEADER) {
    fprintf(stderr, "Expected MuJoCo 4.0.1 headers and library\n");
    return 1;
  }
  char error[1024] = "";
  mjSpec *spec = mj_parseXMLString("<mujoco><worldbody><geom type='sphere' size='.14'/>"
    "<geom type='box' size='.9 .5 .28' euler='21 37 53'/></worldbody></mujoco>",
    NULL, error, sizeof(error));
  mjModel *m = spec ? mj_compile(spec, NULL) : NULL;
  if (!m) { fprintf(stderr, "%s\n", spec ? mjs_getError(spec) : error); return 1; }
  mjData *d = mj_makeData(m);
  mj_forward(m, d);
  mju_transpose(world_to_box, d->geom_xmat + 9, 3, 3);
  const double *half_extent = m->geom_size + 3;
  for (int i = 0; i < poses; ++i) {
    double local[3];
    for (int j = 0; j < 3; ++j) {
      local[j] = (2 * uniform() - 1) * half_extent[j] * (i % 2 ? 1 : 2.5);
    }
    mju_mulMatVec3(centers[i], d->geom_xmat + 9, local);
  }
  mjfCollision sphere_box = mjCOLLISIONFUNC[mjGEOM_SPHERE][mjGEOM_BOX];
  mjPreContact contact;
  double point[10], max_gap = 0, max_normal = 0, max_midpoint = 0;
  const double *inputs[] = { d->geom_xpos, zeros, m->geom_size, zeros, zeros, world_to_box, half_extent };
  for (int i = 0; i < poses; ++i) {
    memcpy(d->geom_xpos, centers[i], sizeof(centers[i]));
    if (rumoca_scalar_pure_0(inputs, point, NULL) || sphere_box(m, d, &contact, 0, 1, 5) != 1) return 1;
    double gap_error = fabs(contact.dist - point[0]);
    if (!isfinite(gap_error)) return 1;
    max_gap = fmax(max_gap, gap_error);
    for (int axis = 0; axis < 3; ++axis) {
      double midpoint = .5 * (centers[i][axis] + point[4+axis] + point[7+axis]);
      double normal_error = fabs(contact.normal[axis] + point[1+axis]);
      double midpoint_error = fabs(midpoint - contact.pos[axis]);
      if (!isfinite(normal_error) || !isfinite(midpoint_error)) return 1;
      max_normal = fmax(max_normal, normal_error);
      max_midpoint = fmax(max_midpoint, midpoint_error);
    }
  }
  printf("%d poses, maximum errors: gap %.3g m, normal component %.3g, midpoint component %.3g m\n",
         poses, max_gap, max_normal, max_midpoint);
  if (fmax(max_gap, fmax(max_normal, max_midpoint)) > 1e-10) return 1;
  double timings[2][rounds], checksum[2] = {0, 0};
  for (int round = 0; round < rounds; ++round) {
    for (int pass = 0; pass < 2; ++pass) {
      int engine = (round + pass) % 2;
      double start = now(), sum = 0;
      for (int repeat = 0; repeat < repeats; ++repeat) {
        for (int i = 0; i < poses; ++i) {
          memcpy(d->geom_xpos, centers[i], sizeof(centers[i]));
          if (engine == 0) {
            if (rumoca_scalar_pure_0(inputs, point, NULL)) return 1;
            sum += point[0];
          } else {
            if (sphere_box(m, d, &contact, 0, 1, 5) != 1) return 1;
            sum += contact.dist;
          }
        }
      }
      timings[engine][round] = (now() - start) * 1e9 / (repeats * poses);
      checksum[engine] += sum;
    }
  }
  for (int engine = 0; engine < 2; ++engine) {
    qsort(timings[engine], rounds, sizeof(double), ascending);
    printf("%s: median %.1f, p95 %.1f ns/query (batch means)\n",
           engine ? "MuJoCo" : "Rumoca", timings[engine][rounds/2], timings[engine][29]);
  }
  mj_deleteData(d);
  mj_deleteModel(m);
  mj_deleteSpec(spec);
  return fabs(checksum[0] - checksum[1]) > 1e-6;
}
