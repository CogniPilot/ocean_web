#include "fmi3Functions.h"
#include "solver.c"

#define TOKEN "61e76f4e-3bb2-4b4e-8a0e-ee927760ba6b"

const char *fmi3GetVersion(void){return "3.0";}
fmi3Instance fmi3InstantiateCoSimulation(fmi3String name,fmi3String token,fmi3String path,
 fmi3Boolean visible,fmi3Boolean logging,fmi3Boolean eventMode,fmi3Boolean earlyReturn,
 const fmi3ValueReference required[],size_t count,fmi3InstanceEnvironment env,
 fmi3LogMessageCallback logger,fmi3IntermediateUpdateCallback callback){
    if(!name||!token||strcmp(token,TOKEN)||eventMode||count)return NULL;
    return calloc(1,sizeof(Harbor));
}
void fmi3FreeInstance(fmi3Instance instance){
    if(instance){freeMesh(instance);free(instance);}
}
fmi3Status fmi3SetDebugLogging(fmi3Instance instance,fmi3Boolean loggingOn,size_t n,const fmi3String categories[]){
    return instance?fmi3OK:fmi3Error;
}
fmi3Status fmi3EnterInitializationMode(fmi3Instance instance,fmi3Boolean tolDefined,fmi3Float64 tol,
 fmi3Float64 start,fmi3Boolean stopDefined,fmi3Float64 stop){
    if(!instance||!isfinite(start))return fmi3Error;
    ((Harbor*)instance)->time=start;return fmi3OK;
}
fmi3Status fmi3ExitInitializationMode(fmi3Instance instance){
    Harbor *s=instance;return s && !s->initialized && initializeMesh(s)?fmi3OK:fmi3Error;
}
fmi3Status fmi3Terminate(fmi3Instance instance){return instance?fmi3OK:fmi3Error;}
fmi3Status fmi3Reset(fmi3Instance instance){
    if(!instance)return fmi3Error;
    freeMesh(instance);memset(instance,0,sizeof(Harbor));return fmi3OK;
}
static double *variable(Harbor *s,unsigned ref,size_t *length){
    *length=1;
    switch(ref){
        case 0:return &s->time;
        case 1:*length=NX+1;return s->east;
        case 2:*length=NY+1;return s->north;
        case 3:*length=NZ+1;return s->up;
        case 4:*length=N;return s->mask;
        case 5:*length=3;return s->incident;
        case 6:case 7:case 8:*length=N;return s->result[ref-6];
        case 9:return &s->delta;
        case 10:return &s->divergence;
        default:return NULL;
    }
}
fmi3Status fmi3SetFloat64(fmi3Instance instance,const fmi3ValueReference refs[],size_t nref,const fmi3Float64 values[],size_t n){
    Harbor *s=instance;if(!s||s->initialized)return fmi3Error;
    size_t off=0;
    for(size_t a=0;a<nref;a++){
        size_t len;double *data=variable(s,refs[a],&len);
        if(!data || refs[a]<1 || refs[a]>5 || len>n-off)return fmi3Error;
        memcpy(data,values+off,len*sizeof(double));off+=len;
    }
    return off==n?fmi3OK:fmi3Error;
}
fmi3Status fmi3GetFloat64(fmi3Instance instance,const fmi3ValueReference refs[],size_t nref,fmi3Float64 values[],size_t n){
    Harbor *s=instance;if(!s)return fmi3Error;size_t off=0;
    for(size_t a=0;a<nref;a++){
        size_t len;double *data=variable(s,refs[a],&len);
        if(!data || len>n-off)return fmi3Error;
        memcpy(values+off,data,len*sizeof(double));off+=len;
    }
    return off==n?fmi3OK:fmi3Error;
}
fmi3Status fmi3GetInt32(fmi3Instance instance,const fmi3ValueReference refs[],size_t nref,fmi3Int32 values[],size_t n){
    Harbor *s=instance;if(!s||n!=nref)return fmi3Error;
    for(size_t a=0;a<nref;a++){
        if(refs[a]==11)values[a]=s->iteration;
        else if(refs[a]==12)values[a]=s->pressureIterations;
        else return fmi3Error;
    }
    return fmi3OK;
}
fmi3Status fmi3GetBoolean(fmi3Instance instance,const fmi3ValueReference refs[],size_t nref,fmi3Boolean values[],size_t n){
    Harbor *s=instance;if(!s||n!=nref)return fmi3Error;
    for(size_t a=0;a<nref;a++){if(refs[a]!=13)return fmi3Error;values[a]=s->converged;}
    return fmi3OK;
}
fmi3Status fmi3DoStep(fmi3Instance instance,fmi3Float64 t,fmi3Float64 dt,fmi3Boolean noRollback,
 fmi3Boolean *event,fmi3Boolean *terminate,fmi3Boolean *early,fmi3Float64 *last){
    Harbor *s=instance;
    if(!s||!s->initialized||fabs(t-s->time)>1e-7||!isfinite(dt)||dt<=0||dt>100000)return fmi3Error;
    int steps=(int)(floor(t+dt+1e-10)-floor(t+1e-10));
    for(int i=0;i<steps&&!s->converged;i++)if(!sweep(s))return fmi3Error;
    s->time=t+dt;*last=s->time;*event=*terminate=*early=0;return fmi3OK;
}
