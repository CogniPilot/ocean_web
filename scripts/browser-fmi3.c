#include "model.h"
static fmi3Instance instance;
static double values[16384];
double *buffer(void) {return values;}
int create_instance(const char *token) {
    instance=fmi3InstantiateCoSimulation("pelagic",token,NULL,false,false,false,false,NULL,0,NULL,NULL,NULL);
    return instance ? fmi3EnterInitializationMode(instance,false,0,0,false,0) : fmi3Error;
}
int initialize(void) {return fmi3ExitInitializationMode(instance);}
int set_real(unsigned vr,double v) {return fmi3SetFloat64(instance,&vr,1,&v,1);}
int set_reals(unsigned vr,unsigned n) {return n>16384 ? fmi3Error : fmi3SetFloat64(instance,&vr,1,values,n);}
int read_real(unsigned vr,unsigned n) {return n>16384 ? fmi3Error : fmi3GetFloat64(instance,&vr,1,values,n);}
int read_integer(unsigned vr) {
    fmi3Int64 integer=0;
    int status=fmi3GetInt64(instance,&vr,1,&integer,1);
    values[0]=(double)integer;
    return status;
}
int advance(double time,double dt) {
    bool event=false,end=false,early=false;
    double last=time;
    int status=fmi3DoStep(instance,time,dt,true,&event,&end,&early,&last);
    return end || early ? fmi3Error : status;
}
