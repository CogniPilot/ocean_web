#ifndef DIVER_BENCH_CASES_H
#define DIVER_BENCH_CASES_H
#include <mujoco/mujoco.h>
#include <math.h>
#include <string.h>
#include <time.h>
enum { nstate=32, nq=20 };
typedef struct { double angle[14], speed[nq], effort[nq]; mjData *mj; } Case;

static void make_case(Case *c, const mjModel *m, int k) {
  c->mj=mj_makeData(m);
  mjData *d=c->mj;
  for (int j=0; j<nq; ++j) {
    c->speed[j]=k ? .7*sin(.26*k+.7*j) : 0;
    c->effort[j]=4*cos(.17*k+.9*j);
    if (j>=6) {
      c->angle[j-6]= k ? .7*sin(.34*k+.44*j) : 0;
      d->qpos[7+j-6]=c->angle[j-6];
      d->qvel[j]=c->speed[j];
      d->qfrc_applied[j]=c->effort[j];
    }
  }
  // Nonidentity root orientations exercise world/body coordinate conversion.
  const double spin_axis[3]={.36,.48,.80};
  mju_axisAngle2Quat(d->qpos+3,spin_axis,.13*k);
  mju_rotVecQuat(d->qvel,c->speed+3,d->qpos+3);
  mju_rotVecQuat(d->qfrc_applied,c->effort+3,d->qpos+3);
  memcpy(d->qvel+3,c->speed,3*sizeof(double));
  memcpy(d->qfrc_applied+3,c->effort,3*sizeof(double));
}
static double mono(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC,&t);
  return t.tv_sec+1e-9*t.tv_nsec;
}
#endif
