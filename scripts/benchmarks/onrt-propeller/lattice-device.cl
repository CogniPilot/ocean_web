// The build inserts Rumoca's generated double-precision collision operator above.
__constant int X[19]={0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0};
__constant int Y[19]={0,0,0,1,-1,0,0,1,-1,-1,1,0,0,0,0,1,-1,1,-1};
__constant int Z[19]={0,0,0,0,0,1,-1,0,0,0,0,1,-1,-1,1,1,-1,-1,1};
__constant int opposite[19]={0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15,18,17};

__kernel void advance(__global const double *src,__global double *dst,__global const uchar *mask,
    __global const float *tensor,__constant const int *reflect,__global float4 *field,
    __global double4 *blockLoads,int res,int width,int phases,double phase,double ramp,
    double omega,double target,double viscosity,double speedUnit,double pressureUnit,int capture){
    int n=get_global_id(0),lane=get_local_id(0),nx=9*res,ny=4*res,cells=nx*ny*ny;
    int x=n%nx,y=n/nx%ny,z=n/(nx*ny);
    double a[19],out[26];
    for(int q=0;q<19;q++){
        int i=clamp(x-X[q],0,nx-1),j=y-Y[q],k=z-Z[q],flip=0;
        if(j<0||j>=ny){j=y;flip=1;}
        if(k<0||k>=ny){k=z;flip+=2;}
        a[q]=src[reflect[19*flip+q]*cells+(k*ny+j)*nx+i];
    }
    if(x==0||x==nx-1){
        int sign=x==0?1:-1;
        double rest=0,outgoing=0,ty=0,tz=0;
        for(int q=0;q<19;q++){
            if(X[q]==0){rest+=a[q];ty+=Y[q]*a[q];tz+=Z[q]*a[q];}
            else if(X[q]==-sign)outgoing+=a[q];
        }
        double sum=rest+2*outgoing,cs=1/sqrt(3.),b=1+ramp*target-cs;
        double density=x==0?sum/(1-ramp*target):2*sum/(b+sqrt(b*b+4*cs*sum));
        double ux=x==0?ramp*target:sum/density-1.;
        for(int q=1;q<19;q++)if(X[q]==sign)
            a[q]=a[opposite[q]]+6*(q<=6?1./18:1./36)*density*sign*ux-.5*(Y[q]*ty+Z[q]*tz);
    }
    double wall[6]={1,1,1,0,0,0},fraction=0;
    int i=x-3*res+width/2,j=y-2*res+width/2,k=z-2*res+width/2;
    if(i>=0&&i<width&&j>=0&&j<width&&k>=0&&k<width){
        int v=width*width*width,h=i+width*(j+width*k),p=(int)phase;
        int ia=(p%phases)*v+h,ib=((p+1)%phases)*v+h;
        double f=phase-p,wa=(1-f)*mask[ia],wb=f*mask[ib];
        fraction=(wa+wb)/255.;
        if(fraction>0)for(int t=0;t<6;t++)wall[t]=(wa*tensor[6*ia+t]+wb*tensor[6*ib+t])/(wa+wb);
    }
    double dy=y+.5-2*res,dz=z+.5-2*res,spin=ramp*omega,smag=.16;
    int status=COLLISION((const double*[]){a,&fraction,&dy,&dz,&spin,&viscosity,&smag,wall},out,0);
    if(x>7*res){
        double r=(x-7.*res)/(2*res-1),sigma=.12*r*r,freestream=ramp*target;
        for(int q=0;q<19;q++){
            double w=q==0?1./3:q<=6?1./18:1./36,eu=X[q]*freestream;
            out[q]+=sigma*(w*(1+3*eu+4.5*eu*eu-1.5*freestream*freestream)-out[q]);
        }
    }
    for(int q=0;q<19;q++)dst[q*cells+n]=out[q];
    if(capture)field[n]=convert_float4((double4)(out[22]*speedUnit,out[23]*speedUnit,out[24]*speedUnit,out[25]*pressureUnit));
    double v2=out[22]*out[22]+out[23]*out[23]+out[24]*out[24];
    __local double4 partial[128];
    partial[lane]=(double4)(out[19],dy*out[21]-dz*out[20],v2,(status||!isfinite(v2))?1.:0.);
    barrier(CLK_LOCAL_MEM_FENCE);
    for(int stride=64;stride;stride/=2){
        if(lane<stride){
            double4 b=partial[lane+stride];partial[lane].xy+=b.xy;
            partial[lane].zw=fmax(partial[lane].zw,b.zw);
        }
        barrier(CLK_LOCAL_MEM_FENCE);
    }
    if(lane==0)blockLoads[get_group_id(0)]=partial[0];
}
