#include "model.h"

static const fmi3ValueReference mass_vr=MASS_VR, effort_vr=EFFORT_VR, acceleration_vr=ACCELERATION_VR;
void *torque_fmu(const double *matrix,const double *effort) {
  fmi3Instance m=fmi3InstantiateModelExchange("torque",AD_TOKEN,NULL,false,false,NULL,NULL);
  if (!m || fmi3SetFloat64(m,&mass_vr,1,matrix,400)!=fmi3OK ||
      fmi3SetFloat64(m,&effort_vr,1,effort,20)!=fmi3OK ||
      fmi3EnterInitializationMode(m,false,0,0,false,0)!=fmi3OK ||
      fmi3ExitInitializationMode(m)!=fmi3OK || fmi3EnterContinuousTimeMode(m)!=fmi3OK) return NULL;
  return m;
}
int torque_solve(void *m,const double *seed,double *result) {
  return fmi3GetFloat64(m,&acceleration_vr,1,result,20)!=fmi3OK ||
      fmi3GetAdjointDerivative(m,&acceleration_vr,1,&effort_vr,1,seed,20,result+20,20)!=fmi3OK;
}
void torque_free(void *m) { fmi3FreeInstance(m); }
