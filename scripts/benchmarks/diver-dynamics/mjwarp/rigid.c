// Profile the same generated, typed floatingTreeDynamics function as the FMU.
// One solver lane and a cooperating copy warp per world, as in production.
#include "rmc_functions.c"
#include "entry.h"
#include "shared.h"
void rmc_copy_worker(unsigned thread);
void rmc_copy_workers_finish(void);
void rigid_batch(const double *records, double *result, int *status) {
  unsigned t=__nvvm_read_ptx_sreg_tid_x();
  if(t<32) { rmc_copy_worker(t); return; }
  unsigned w=__nvvm_read_ptx_sreg_ctaid_x();
  const double *base=records+w*(packed+nv);
  const void *in[ninput];
  for(int k=0;k<ninput;k++){ in[k]=base; base+=widths[k]; }
  bool checks[4]={0};
  int r=RIGID_FORWARD(in,(void*[]){NULL,NULL,result+w*nv,&checks[0],&checks[1],&checks[2],&checks[3]},NULL);
  status[w]=r || !checks[0] || !checks[1] || !checks[2] || !checks[3];
  rmc_copy_workers_finish();
}
