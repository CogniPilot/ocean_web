// Compile with the reduced fixture's generated C. Inputs to its JVP are
// interleaved (A, dA, b, db); the paired outputs are (x, dx).
#define _POSIX_C_SOURCE 200809L
#include "rmc_functions.c"
#include "cases.h"
enum { nseed=14, reps=25, nblocks=7 };
extern void *torque_fmu(const double *,const double *);
extern int torque_solve(void *,const double *,double *);
extern void torque_free(void *);
typedef struct { void *fmu; Case pose; double M[nq*nq], rhs[nq], seed[nq]; } Sample;
static Sample samples[nstate];
static const double zero[nq*nq]={0};
static double result[2*nq], work[nq*nq];
static volatile double checksum;
static void evaluate(int method,const mjModel *m,Sample *s) {
  if (method==0) {
    const double *args[]={s->M,zero,s->rhs,s->seed};
    if (AD_KERNEL(args,result,NULL)) { fputs("Rumoca JVP failed\n",stderr); exit(1); }
  } else if (method==1) {
    memcpy(work,s->M,sizeof(work));
    if(mju_cholFactor(work,nq,0)!=nq) exit(1);
    mju_cholSolve(result,work,s->rhs,nq);
    mju_cholSolve(result+nq,work,s->seed,nq);
  } else if (method==2) {
    mj_solveM(m,s->pose.mj,result,s->rhs,1);
    mj_solveM(m,s->pose.mj,result+nq,s->seed,1);
  } else if (torque_solve(s->fmu,s->seed,result)) {
    fputs("FMI adjoint returned failure\n",stderr); exit(1);
  }
}
static double objective(const mjModel *m,Sample *s) {
  mj_forward(m,s->pose.mj);
  double loss=0;
  for(int j=0;j<nq;j++) loss+=s->seed[j]*s->pose.mj->qacc[j];
  return loss;
}
static double measure(int method,const mjModel *m) {
  double sum=0,start=mono();
  const int count=method==3?1:reps;
  for (int r=0;r<count;r++) for(int i=0;i<nstate;i++) {
    evaluate(method,m,samples+i); sum+=result[(i+r)%nq]+result[nq+(i+r)%nq];
  }
  double time=mono()-start; checksum=sum; return 1e6*time/(count*nstate);
}
int main(int argc,char **argv) {
  if(argc!=2) return 2;
  char error[1024]; mjModel *m=mj_loadXML(argv[1],NULL,error,sizeof(error));
  if(!m){fputs(error,stderr);return 2;}
  if(m->nv!=nq||sizeof(mjtNum)!=sizeof(double)) return 2;
  double worst=0,fd_worst=0,primal_worst=0;
  for(int i=0;i<nstate;i++) {
    Sample *s=samples+i; make_case(&s->pose,m,i); mjData *d=s->pose.mj; mj_forward(m,d);
    mj_fullM(m,d,s->M); memcpy(s->rhs,d->qfrc_smooth,sizeof(s->rhs));
    s->fmu=torque_fmu(s->M,s->rhs); if(!s->fmu){fputs("Could not initialize derivative FMU\n",stderr);return 1;}
    for(int j=6;j<nq;j++) s->seed[j]=cos(.31*i+.4*j);
    evaluate(0,m,s);
    double ref[nq]; memcpy(ref,result+nq,sizeof(ref));
    for(int j=0;j<nq;j++) primal_worst=fmax(primal_worst,fabs(result[j]-d->qacc[j]));
    for(int method=1;method<4;method++) {
      evaluate(method,m,s);
      for(int j=0;j<nq;j++) worst=fmax(worst,fabs(ref[j]-result[nq+j]));
    }
    for(int j=6;j<nq;j++) {
      double initial=d->qfrc_applied[j], h=1e-4;
      d->qfrc_applied[j]=initial+h; double plus=objective(m,s);
      d->qfrc_applied[j]=initial-h; double minus=objective(m,s);
      d->qfrc_applied[j]=initial;
      double fd=(plus-minus)/(2*h);
      if(!isfinite(ref[j])||!isfinite(fd)) return 1;
      fd_worst=fmax(fd_worst,fabs(fd-ref[j]));
    }
    mj_forward(m,d);
  }
  if (primal_worst>1e-9||worst>1e-10||fd_worst>1e-7) {
    fprintf(stderr,"primal %.9g, analytic %.9g, FD %.9g\n",primal_worst,worst,fd_worst);return 1;
  }
  printf("{\"cases\":%d,\"hinge_gradients\":%d,\"max_primal_error\":%.10g,\"max_analytic_error\":%.10g,\"max_fd_error\":%.10g,\"samples_us\":[",nstate,nstate*nseed,primal_worst,worst,fd_worst);
  for(int b=-1;b<nblocks;b++) {
    double us[4];
    for(int k=0;k<4;k++){int method=(b+k+4)%4;us[method]=measure(method,m);}
    if(b>=0)printf("%s{\"rumoca_jvp\":%.6f,\"mujoco_dense\":%.6f,\"mujoco_cached\":%.6f,\"fmi_adjoint\":%.6f}",b?",":"",us[0],us[1],us[2],us[3]);
  }
  printf("],\"checksum\":%.12g}\n",checksum);
  for(int i=0;i<nstate;i++) {torque_free(samples[i].fmu);mj_deleteData(samples[i].pose.mj);}
  mj_deleteModel(m);
  return 0;
}
