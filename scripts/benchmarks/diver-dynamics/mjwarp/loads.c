// Construct 64 moving submerged configurations. Replay identical body wrenches in
// MuJoCo and compare 24 accelerations with the compiled Modelica forward dynamics.
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <mujoco/mujoco.h>
#include "model.h"
#include "entry.h"
#include "shared.h"

static FILE *rigid;
static int recorded;
void record_rigid_case(const void* const in[], const double* acc) {
  for (int k=0;k<ninput;k++)
    if (fwrite(in[k],8,widths[k],rigid)!=widths[k]) abort();
  if (fwrite(acc,8,nv,rigid)!=nv) abort();
  ++recorded;
}

static const int flex[] = {0,1,3,4,5,6,7,9,10,12,13,14,15,16};
static const int twist[] = {2,8,11,17};
// One-based slots of the production model's massive links in MuJoCo body order.
static const int physical[] = {1,3,4,6,7,8,10,11,13,14,15};
static const double identity[9] = {1,0,0,0,1,0,0,0,1};

int main(int argc, char **argv) {
  if (argc != 4) return 1;
  char error[512];
  mjModel *m = mj_loadXML(argv[1], NULL, error, sizeof(error));
  if (!m) { fprintf(stderr,"%s\n",error); return 1; }
  if (m->nq != 25 || m->nv != 24 || m->nbody != 12) return 1;
  mjData *d = mj_makeData(m);
  FILE *f = fopen(argv[2],"wb");
  rigid = fopen(argv[3],"wb");
  if (!f || !rigid) return 1;
  double max_error = 0;
  for (int lane=0; lane<64; ++lane) {
    double rot[9], zero[9]={0}, vol=.003, eff[18], want[24], out[403];
    double q[14], v[14], tau[14], aq[4], av[4], at[4], cur[3], force[3], moment[3];
    mj_resetData(m,d);
    double angle=.013*(lane+1), axis[3]={.4,.2,.8};
    mju_normalize3(axis);
    mju_axisAngle2Quat(d->qpos+3,axis,angle);
    mju_quat2Mat(rot,d->qpos+3);
    for(int k=0;k<24;k++) d->qvel[k]=.43*sin(.27*k+.43*lane);
    for(int k=0;k<18;k++) {
      d->qpos[k+7]=.17*sin(.41*k+.31*lane);
      eff[k]=1.8*cos(.32*k+.24*lane);
      d->qfrc_applied[k+6]=eff[k];
    }
    for(int k=0;k<14;k++) { q[k]=d->qpos[7+flex[k]]; v[k]=d->qvel[6+flex[k]]; tau[k]=eff[flex[k]]; }
    for(int k=0;k<4;k++) { aq[k]=d->qpos[7+twist[k]]; av[k]=d->qvel[6+twist[k]]; at[k]=eff[twist[k]]; }
    for(int k=0;k<3;k++) {
      cur[k]=.12*sin(.35*lane+k);
      force[k]=4*cos(.18*lane+k);
      moment[k]=.9*sin(.23*lane+k);
    }
    const double *in[]={d->qpos,rot,identity,d->qvel,d->qvel+3,q,v,tau,aq,av,at,moment,force,
                        cur,zero,&vol,&vol,zero,zero,zero,zero,zero,zero,zero,zero,zero};
    if(TREE_FORWARD(in,out,NULL)) return 1;
    for(int k=392;k<403;k++) if(out[k]!=1) return 1;
    mju_mulMatVec3(d->qfrc_applied,rot,force);
    memcpy(d->qfrc_applied+3,moment,3*sizeof(double));
    mj_kinematics(m,d);
    for(int b=1;b<m->nbody;b++) {
      int link=physical[b-1];
      const double *fluid=out+6*(link-1)+40;
      double arm[3], shift[3], *w=d->xfrc_applied+6*b;
      // Modelica reports moment about the link origin. MuJoCo applies its
      // Cartesian wrench at the centre of mass. Dry weight acts there too.
      mju_sub3(arm,d->xipos+3*b,d->xpos+3*b);
      mju_cross(shift,arm,fluid);
      for(int k=0;k<3;k++) { w[k]=fluid[k]; w[k+3]=fluid[k+3]-shift[k]; }
      w[2]-=9.80665*m->body_mass[b]/(1+17.0/88);
    }
    memcpy(want,out+3,3*sizeof(double));
    memcpy(want+3,out,3*sizeof(double));
    for(int k=0;k<14;k++) want[6+flex[k]]=out[6+k];
    for(int k=0;k<4;k++) want[6+twist[k]]=out[387+k];
    mj_forward(m,d);
    for(int k=0;k<24;k++) {
      if(!isfinite(want[k]) || !isfinite(d->qacc[k])) return 1;
      max_error=fmax(max_error,fabs(want[k]-d->qacc[k]));
    }
    // Both timed engines start with resolved generalized efforts.
    for(int b=1;b<m->nbody;b++) {
      double *w=d->xfrc_applied+6*b;
      mj_applyFT(m,d,w,w+3,d->xipos+3*b,b,d->qfrc_applied);
    }
    mju_zero(d->xfrc_applied,6*m->nbody);
    mj_forward(m,d);
    for(int k=0;k<24;k++) {
      if(!isfinite(d->qacc[k])) return 1;
      max_error=fmax(max_error,fabs(want[k]-d->qacc[k]));
    }
    if(fwrite(d->qpos,sizeof(double),25,f)!=25 || fwrite(d->qvel,sizeof(double),24,f)!=24 ||
       fwrite(d->qfrc_applied,sizeof(double),24,f)!=24 || fwrite(d->xfrc_applied,sizeof(double),72,f)!=72 ||
       fwrite(want,sizeof(double),24,f)!=24) return 1;
  }
  if(fclose(f) || fclose(rigid) || recorded!=64) return 1;
  printf("64 submerged cases, 1536 acceleration components, native max abs error %.12g\n",max_error);
  mj_deleteData(d); mj_deleteModel(m);
  return max_error>1e-8;
}
