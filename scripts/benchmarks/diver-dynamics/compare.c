#define _POSIX_C_SOURCE 200809L
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <mujoco/mujoco.h>
#include "rmc_functions.c"
#include "fixture.h"

#include "cases.h"
enum { repeats=100, blocks=9 };
static Case batch[nstate];
static const double gravity[3]={0,0,0};
static double acceleration[nq];
static volatile double consumed;

static double rumoca(Case *c) {
  const void *args[]={parent,offset,mount,axis,c->angle,c->speed,inertia,armature,gravity,c->effort};
  bool valid[4]={0};
  void *out[]={NULL,NULL,acceleration,valid,valid+1,valid+2,valid+3};
  if (TREE_FORWARD(args,out,NULL) || !valid[0] || !valid[1] || !valid[2] || !valid[3]) { fputs("Rumoca forward dynamics failed\n",stderr); exit(1); }
  return acceleration[6];
}
static double measure(const mjModel *m, int is_rumoca, double *checksum) {
  double sum=0, start=mono();
  for (int i=0; i<repeats; ++i) for (int k=0; k<nstate; ++k) {
    Case *c=&batch[k];
    if (is_rumoca) sum+=rumoca(c);
    else { mj_forward(m,c->mj); sum+=c->mj->qacc[6]; }
  }
  double elapsed=mono()-start;
  consumed=sum;
  *checksum=sum;
  return elapsed*1e6/(repeats*nstate);
}
int main(int argc, char **argv) {
  if (argc!=2 || sizeof(mjtNum)!=sizeof(double)) return 2;
  char error[2048];
  mjModel *m=mj_loadXML(argv[1],NULL,error,sizeof(error));
  if (!m) { fprintf(stderr,"%s\n",error); return 2; }
  if (m->nv!=nq || m->nbody!=12 || m->ngeom || m->nu || m->neq) return 2;
  double maximum=0, scale=0;
  for (int k=0; k<nstate; ++k) {
    Case *c=&batch[k]; make_case(c,m,k); rumoca(c); mj_forward(m,c->mj);
    double *a=acceleration, transport[3], converted[nq];
    mju_cross(transport,c->speed,c->speed+3);
    for (int j=0; j<3; ++j) transport[j]+=a[3+j];
    mju_rotVecQuat(converted,transport,c->mj->qpos+3);
    memcpy(converted+3,a,3*sizeof(double));
    memcpy(converted+6,a+6,14*sizeof(double));
    for (int j=0; j<nq; ++j) {
      double err=fabs(converted[j]-c->mj->qacc[j]);
      maximum=fmax(maximum,err); scale=fmax(scale,fabs(c->mj->qacc[j]));
      if (!isfinite(err) || err>1e-9) {
        fprintf(stderr,"mismatch state=%d component=%d, Rumoca %.12g MuJoCo %.12g\n",k,j,converted[j],c->mj->qacc[j]);
        return 1;
      }
    }
  }
  printf("{\"mujoco\":\"%s\",\"cases\":%d,\"values\":%d,\"max_acceleration_error\":%.10g,\"max_abs_acceleration\":%.10g,\"calls_per_block\":%d,\"samples_us\":[",mj_versionString(),nstate,nstate*nq,maximum,scale,nstate*repeats);
  double sum[2]={0};
  measure(m,0,&sum[0]); measure(m,1,&sum[1]);
  for (int i=0; i<blocks; ++i) {
    int first=i%2;
    double t[2];
    t[first]=measure(m,first,&sum[first]); t[1-first]=measure(m,1-first,&sum[1-first]);
    if (fabs(sum[0]-sum[1])>1e-7*(1+fabs(sum[0]))) return 1;
    printf("%s{\"mujoco\":%.6f,\"rumoca\":%.6f}",i?",":"",t[0],t[1]);
  }
  printf("],\"checksum\":%.12g}\n",sum[0]);
  for (int k=0; k<nstate; ++k) mj_deleteData(batch[k].mj);
  mj_deleteModel(m);
  return 0;
}
