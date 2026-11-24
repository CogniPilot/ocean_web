/* Native domain traversal for the compiled Modelica lattice operator.
   Populations stream one link per step. Each OpenMP thread owns its FMI instance. */
#include "model.h"
#include "flow_refs.h"
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <omp.h>

static const int cx[]={0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0};
static const int cy[]={0,0,0,1,-1,0,0,1,-1,-1,1,0,0,0,0,1,-1,1,-1};
static const int cz[]={0,0,0,0,0,1,-1,0,0,0,0,1,-1,-1,1,1,-1,-1,1};
static int64_t where(int x,int y,int z,int nx,int ny){return x+nx*(y+ny*(int64_t)z);}
static void check(int status){if(status>1){fprintf(stderr,"FMI failure %d\n",status);exit(1);}}
static FILE *open_file(const char *name,const char *mode){FILE *f=fopen(name,mode);if(!f){perror(name);exit(1);}return f;}
static void *allocate(size_t n,size_t bytes){void *p=calloc(n,bytes);if(!p){perror("allocation");exit(1);}return p;}

int main(int argc,char **argv){
    if(argc!=5&&argc!=6){fprintf(stderr,"Usage: lattice MASK J RPM REVOLUTIONS [NORMAL_TENSORS]\n");return 2;}
    FILE *maskfile=open_file(argv[1],"rb");
    int info[3]; if(fread(info,sizeof(int),3,maskfile)!=3)return 1;
    const int res=info[0],width=info[1],phases=info[2];
    if(res<8||res>64||width<1||width>2*res||phases<4||phases>720)return 2;
    size_t mask_size=(size_t)width*width*width*phases;
    uint8_t *mask=allocate(mask_size,1);
    if(fread(mask,1,mask_size,maskfile)!=mask_size)return 1;
    fclose(maskfile);
    float *tensors=NULL;
    if(argc==6){
        FILE *file=open_file(argv[5],"rb");
        int shape[3];
        if(fread(shape,sizeof(int),3,file)!=3||memcmp(info,shape,sizeof(info))!=0)return 2;
        tensors=allocate(mask_size*6,sizeof(float));
        if(fread(tensors,sizeof(float),mask_size*6,file)!=mask_size*6)return 1;
        fclose(file);
    }
    const double identity[6]={1,1,1,0,0,0};
    const int nx=9*res,ny=4*res,nz=4*res,cx0=3*res,cy0=2*res,cz0=2*res;
    const double J=atof(argv[2]),rpm=atof(argv[3]),revs=atof(argv[4]);
    if(J<.1||J>1.7||rpm<=0||revs<=0)return 2;
    const double pi=acos(-1.),D=.1066,n=rpm/60,dx=D/res;
    // 0.075 lattice units at the blade tip, at most Mach 0.13 there.
    const int stepsPerRev=(int)ceil(pi*res/.075);
    const double dt=1/(stepsPerRev*n),omega=-2*pi/stepsPerRev;
    const double ua=J*n*D*dt/dx, nu=1.054e-6*dt/(dx*dx),rho=998.6;
    const size_t cells=(size_t)nx*ny*nz;
    double *current=allocate(cells*19,sizeof(double)),*next=allocate(cells*19,sizeof(double));
    float *field=allocate(cells*4,sizeof(float));
    int reflect[4][19];
    double inlet[19];
    for(int q=0;q<19;q++){
        double eu=cx[q]*ua;
        inlet[q]=(q==0?1./3:q<=6?1./18:1./36)*(1+3*eu+4.5*eu*eu-1.5*ua*ua);
        for(int m=0;m<4;m++)for(int k=0;k<19;k++)
            if(cx[k]==cx[q]&&cy[k]==((m&1)?-cy[q]:cy[q])&&cz[k]==((m&2)?-cz[q]:cz[q]))reflect[m][q]=k;
    }
    for(size_t k=0;k<cells;k++)memcpy(current+19*k,inlet,sizeof(inlet));
    FILE *history=open_file("rumoca-loads.csv","w");
    fprintf(history,"step,time_s,revolutions,thrust_N,torque_Nm,KT,KQ,max_mach,mask_phase,omega_rad_s\n");
    const int end=(int)ceil(revs*stepsPerRev);
    // Integrate annular loads over the final full-speed revolution. The last
    // bin also includes mixed cells whose centres sit outside the nominal tip.
    enum {rings=5};
    double ringAxial[rings]={0},ringMoment[rings]={0};
    double axial=0,moment=0,maxMach=0;
    #pragma omp parallel
    {
        fmi3Instance model=fmi3InstantiateCoSimulation("cell",FLOW_TOKEN,NULL,0,0,0,0,NULL,0,NULL,NULL,NULL);
        if(!model)exit(1);
        check(fmi3EnterInitializationMode(model,0,0,0,0,0));
        double input[31]={0},out[26];memcpy(input,inlet,sizeof(inlet));input[23]=nu;input[24]=.16;memcpy(input+25,identity,sizeof(identity));
        check(fmi3SetFloat64(model,input_refs,8,input,31));
        check(fmi3ExitInitializationMode(model));
        for(int step=1;step<=end;step++){
            // Ramp the rotor through its first revolution to limit acoustic startup waves.
            double s=fmin(1.,step/(double)stepsPerRev),ramp=s*s*(3-2*s);
            double turns=(step<=stepsPerRev?s*s*s-.5*s*s*s*s:step/(double)stepsPerRev-.5);
            double angle=fmod(-4*turns,1.);if(angle<0)angle++;
            double phase=angle*phases;
            int pa=(int)phase%phases,pb=(pa+1)%phases;
            #pragma omp for collapse(2) reduction(+:axial,moment) reduction(max:maxMach) reduction(+:ringAxial[:rings],ringMoment[:rings])
            for(int z=0;z<nz;z++)for(int y=0;y<ny;y++){
                for(int x=0;x<nx;x++){
                    size_t k=where(x,y,z,nx,ny);
                    if(x==0)memcpy(input,inlet,sizeof(inlet));
                    else for(int q=0;q<19;q++){
                        int i=x-cx[q],j=y-cy[q],l=z-cz[q],flip=0;
                        if(i>=nx)i=nx-1;
                        if(j<0||j>=ny){j=y;flip|=1;}
                        if(l<0||l>=nz){l=z;flip|=2;}
                        input[q]=current[19*where(i,j,l,nx,ny)+reflect[flip][q]];
                    }
                    int i=x-cx0+width/2,j=y-cy0+width/2,l=z-cz0+width/2;
                    input[19]=0;
                    if(tensors)memcpy(input+25,identity,sizeof(identity));
                    if(i>=0&&i<width&&j>=0&&j<width&&l>=0&&l<width){
                        size_t h=where(i,j,l,width,width),vol=(size_t)width*width*width;
                        size_t ia=pa*vol+h,ib=pb*vol+h;
                        double frac=phase-floor(phase),wa=(1-frac)*mask[ia],wb=frac*mask[ib];
                        input[19]=(wa+wb)/255.;
                        if(tensors&&input[19]>0){
                            for(int v=0;v<6;v++)input[25+v]=(wa*tensors[6*ia+v]+wb*tensors[6*ib+v])/(wa+wb);
                        }
                    }
                    input[20]=y+.5-cy0;input[21]=z+.5-cz0;input[22]=ramp*omega;
                    check(fmi3SetFloat64(model,input_refs,8,input,31));
                    check(fmi3GetFloat64(model,output_refs,4,out,26));
                    memcpy(next+19*k,out,sizeof(inlet));
                    const double shaftMoment=input[20]*out[21]-input[21]*out[20];
                    axial+=out[19];moment+=shaftMoment;
                    if(step>end-stepsPerRev && input[19]>0){
                        const int ring=(int)fmin(rings-1,2*rings*hypot(input[20],input[21])/res);
                        ringAxial[ring]+=out[19];ringMoment[ring]+=shaftMoment;
                    }
                    double v2=out[22]*out[22]+out[23]*out[23]+out[24]*out[24];maxMach=fmax(maxMach,sqrt(3*v2));
                    if(step==end){
                        for(int v=0;v<3;v++)field[4*k+v]=(float)(out[22+v]*dx/dt);
                        field[4*k+3]=(float)(out[25]*rho*(dx/dt)*(dx/dt));
                    }
                }
            }
            #pragma omp single
            {
                double scale=rho*pow(dx,4)/(dt*dt);
                double thrust=-axial*scale,torque=moment*scale*dx;
                fprintf(history,"%d,%.9g,%.8g,%.9g,%.9g,%.8g,%.8g,%.5g,%.12g,%.12g\n",step,step*dt,turns,thrust,torque,
                    thrust/(rho*n*n*pow(D,4)),torque/(rho*n*n*pow(D,5)),maxMach,phase,ramp*omega/dt);
                if(step%20==0)fflush(history);
                if(!isfinite(thrust)||!isfinite(torque)||maxMach>0.4){fprintf(stderr,"unstable step %d\n",step);exit(1);}
                axial=moment=maxMach=0;double *old=current;current=next;next=old;
            }
        }
        fmi3FreeInstance(model);
    }
    fclose(history);
    if(end>=2*stepsPerRev){
        FILE *annuli=open_file("rumoca-annuli.csv","w");
        fprintf(annuli,"inner_r_over_R,KT,KQ\n");
        const double coefficient=pow(dx/D,4)/(dt*dt*n*n*stepsPerRev);
        for(int ring=0;ring<rings;ring++)
            fprintf(annuli,"%.2f,%.10g,%.10g\n",(double)ring/rings,
                    -coefficient*ringAxial[ring],coefficient*dx/D*ringMoment[ring]);
        fclose(annuli);
    }
    FILE *f=open_file("rumoca-volume.bin","wb");
    if(fwrite(field,4,4*cells,f)!=4*cells)return 1;
    fclose(f);
    f=open_file("rumoca-volume.json","w");
    fprintf(f,"{\"dims\":[%d,%d,%d],\"wallTreatment\":\"%s\",\"spacing_m\":%.12g,\"firstCenter_m\":[%.12g,%.12g,%.12g],\"dt_s\":%.12g,\"steps\":%d,\"stepsPerRev\":%d,\"J\":%.8g,\"rpm\":%.8g}\n",
        nx,ny,nz,tensors?"normal-slip":"volume-no-slip",dx,(.5-cx0)*dx,(.5-cy0)*dx,(.5-cz0)*dx,dt,end,stepsPerRev,J,rpm);
    fclose(f);return 0;
}
