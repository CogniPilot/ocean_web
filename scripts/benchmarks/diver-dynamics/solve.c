// Isolated generated solveSPD only. Prescribe x, construct A and compare against x.
#define _POSIX_C_SOURCE 200809L
#include "rmc_functions.c"
#include <time.h>
enum { dimension=20, cases=24, repeat=100, blocks=7 };
static double matrix[cases][dimension*dimension], rhs[cases][dimension], output[dimension];
static double reference[cases][dimension];
static void build(int sample) {
  double basis[dimension][dimension];
  for (int j=0;j<dimension;j++) {
    reference[sample][j]=sin(.16*sample+.31*j);
    for (int k=0;k<dimension;k++) basis[j][k]=.35*sin(.11*sample+.24*j+.72*k)+.2*cos(.09*(j+1)*(k+1));
  }
  for (int i=0;i<dimension;i++) for (int j=0;j<dimension;j++) {
    double value=i==j?1.0+.05*i:0.0;
    for (int k=0;k<dimension;k++) value+=basis[i][k]*basis[j][k];
    matrix[sample][i*dimension+j]=value;
    rhs[sample][i]+=value*reference[sample][j];
  }
}
static void solve(int i) {
  const double *args[]={matrix[i],rhs[i]};
  if (SPD_KERNEL(args,output,NULL)) {fputs("Generated solve failed\n",stderr); exit(1);}
}
static double now(void) {
  struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t);
  return t.tv_sec+1e-9*t.tv_nsec;
}
int main(void) {
  double peak=0;
  for (int i=0;i<cases;i++) {
    build(i); solve(i);
    for (int j=0;j<dimension;j++) {
      double error=fabs(output[j]-reference[i][j]);
      if (!isfinite(error)||error>1e-10) return 1;
      peak=fmax(peak,error);
    }
  }
  double checksums[blocks];
  printf("{\"dimension\":%d,\"matrices\":%d,\"max_solution_error\":%.10g,\"samples_us\":[",dimension,cases,peak);
  for (int block=-1;block<blocks;block++) {
    double sum=0,start=now();
    for (int r=0;r<repeat;r++) for (int i=0;i<cases;i++) {
      solve(i);sum+=output[(i+r)%dimension];
    }
    double us=1e6*(now()-start)/(repeat*cases);
    if (block>=0) {checksums[block]=sum; printf("%s%.6f",block?",":"",us);}
  }
  for(int i=1;i<blocks;i++) if(checksums[0]!=checksums[i]) return 1;
  printf("],\"checksum\":%.10g}\n",checksums[0]);
  return 0;
}
