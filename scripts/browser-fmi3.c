#include "model.h"
static fmi3Instance instance;
// Calls are synchronous. Each lane selects its own FMI state; scratch is shared.
fmi3Instance current_instance(void) {return instance;}
void select_instance(fmi3Instance selected) {instance=selected;}
void release_instance(fmi3Instance selected) {
    if(instance==selected) instance=NULL;
    fmi3FreeInstance(selected);
}
static double values[16384];
static fmi3ValueReference references[128];
double *buffer(void) {return values;}
fmi3ValueReference *reference_buffer(void) {return references;}
int read_batch(unsigned count,unsigned n) {
    if (count > sizeof(references)/sizeof(*references) || n > sizeof(values)/sizeof(*values)) return fmi3Error;
    return fmi3GetFloat64(instance,references,count,values,n);
}
int create_instance(const char *token) {
    instance=fmi3InstantiateCoSimulation("pelagic",token,NULL,false,false,false,false,NULL,0,NULL,NULL,NULL);
    return instance ? fmi3EnterInitializationMode(instance,false,0,0,false,0) : fmi3Error;
}
int initialize(void) {return fmi3ExitInitializationMode(instance);}
int set_real(unsigned vr,double v) {return fmi3SetFloat64(instance,&vr,1,&v,1);}
int set_reals(unsigned vr,unsigned n) {return n>16384 ? fmi3Error : fmi3SetFloat64(instance,&vr,1,values,n);}
int read_real(unsigned vr,unsigned n) {return n>16384 ? fmi3Error : fmi3GetFloat64(instance,&vr,1,values,n);}
int read_integer(unsigned vr,unsigned n) {
    if (!n || n > sizeof(values)/sizeof(*values)) return fmi3Error;
    fmi3Int64 integers[n];
    int status=fmi3GetInt64(instance,&vr,1,integers,n);
    if (status <= fmi3Warning)
        for (unsigned i=0;i<n;i++) values[i]=(double)integers[i];
    return status;
}
int advance(double time,double dt) {
    bool event=false,end=false,early=false;
    double last=time;
    int status=fmi3DoStep(instance,time,dt,true,&event,&end,&early,&last);
    return end || early ? fmi3Error : status;
}
