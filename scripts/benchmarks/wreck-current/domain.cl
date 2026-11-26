// Pull streaming on a Cartesian ENU grid rotated about the vertical. Each
// reciprocal blocked link reflects its outgoing population at the half link.
__constant int X[19]={0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0};
__constant int Y[19]={0,0,0,1,-1,0,0,1,-1,-1,1,0,0,0,0,1,-1,1,-1};
__constant int Z[19]={0,0,0,0,0,1,-1,0,0,0,0,1,-1,-1,1,1,-1,-1,1};
__constant int opp[19]={0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15,18,17};
__kernel void advance(__global const double *src, __global double *dst,
        __global const uint *blocked, __constant const int *reflect, __global float4 *field,
        int nx,int ny,int nz,double inlet,double nu,double smag,int capture) {
    int cell=get_global_id(0), cells=nx*ny*nz;
    if(cell>=cells) return;
    int x=cell%nx,y=cell/nx%ny,z=cell/(nx*ny);
    uint links=blocked[cell];
    double a[19], out[26], wall[6]={1,1,1,0,0,0}, zero=0.;
    for(int q=0;q<19;q++){
        int sx=clamp(x-X[q],0,nx-1),sy=y-Y[q],sz=z-Z[q],flip=0;
        if ((links & (1u<<q)) || sz<0) {
            a[q]=src[opp[q]*cells+cell];
        } else {
            if(sy<0||sy>=ny){sy=y;flip=1;}
            if(sz>=nz){sz=z;flip+=2;}
            a[q]=src[reflect[19*flip+q]*cells+(sz*ny+sy)*nx+sx];
        }
    }
    if(x==0||x==nx-1){
        // Prescribed x velocity upstream, outgoing acoustic characteristic downstream.
        int sign=x==0?1:-1;
        double rest=0,back=0,ty=0,tz=0;
        for(int q=0;q<19;q++) {
            if(X[q]==0){rest+=a[q];ty+=Y[q]*a[q];tz+=Z[q]*a[q];}
            else if(X[q]==-sign)back+=a[q];
        }
        double sum=rest+2*back, cs=1/sqrt(3.), b=1+inlet-cs;
        double rho=x==0 ? sum/(1-inlet) : 2*sum/(b+sqrt(b*b+4*cs*sum));
        double ux=x==0 ? inlet : sum/rho-1.;
        for(int q=0;q<19;q++)if(X[q]==sign)
            a[q]=a[opp[q]]+6*(q<=6?1./18:1./36)*rho*sign*ux-.5*(Y[q]*ty+Z[q]*tz);
    }
    int status=COLLISION((const double*[]){a,&zero,&zero,&zero,&zero,&nu,&smag,wall},out,0);
    for(int q=0;q<19;q++)dst[q*cells+cell]=out[q];
    if(capture)field[cell]=status?(float4)(NAN):convert_float4((double4)(out[22],out[23],out[24],1+3*out[25]));
}
