/* Steady incompressible flow on an orthogonal finite-volume mesh.
   Face-normal velocities carry volume flux. Cell momenta use conservative
   donor-cell advection and central diffusion. The pressure correction uses
   precisely the same open face areas and pseudo-time steps as the predictor. */
#include <float.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

enum { NX=74, NY=68, NZ=26, N=NX*NY*NZ, WALL=-1, OPEN=-2 };
typedef struct {
    int neighbor[6], index;
    double area[3], width[3], volume, dt, diag;
    double coeff[6], conductance[6], inverseCholesky;
} Cell;
typedef struct {
    double east[NX+1], north[NY+1], up[NZ+1], mask[N], incident[3];
    double result[3][N], delta, divergence, speed, totalVolume, time, meanStep;
    double *face, *low, *momentum, *center, *pressure, *rhs, *r, *z, *direction, *ap;
    Cell *cells;
    int wet, iteration, pressureIterations, initialized, converged;
} Harbor;
static const int dims[3]={NX,NY,NZ}, strides[3]={1,NX,NX*NY};
static int inlet(const Harbor *s,int side) {
    return (side%2?1:-1)*s->incident[side/2] <= 1e-12;
}
static double faceValue(const Harbor *s,int i,int side) {
    int d=side/2, j=s->cells[i].neighbor[side];
    if(j==WALL)return 0;
    if(side%2)return s->face[i*3+d];
    return j>=0?s->face[j*3+d]:s->low[i*3+d];
}
static double faceStep(const Harbor *s,int i,int j) {
    return j>=0 ? fmin(s->cells[i].dt,s->cells[j].dt) : s->cells[i].dt;
}
static void freeMesh(Harbor *s) {
    free(s->cells); free(s->face); free(s->low); free(s->momentum); free(s->center);
    free(s->pressure); free(s->rhs); free(s->r); free(s->z); free(s->direction); free(s->ap);
    s->initialized=0;
}
static int initializeMesh(Harbor *s) {
    const double *axis[3]={s->east,s->north,s->up};
    s->speed=hypot(s->incident[0],s->incident[1]);
    if(!isfinite(s->speed) || s->speed>5 || fabs(s->incident[2])>1e-12)return 0;
    /* Constant effective viscosity is a closure at the resolved metre scale. */
    double viscosity=.000001+0.28*s->speed;
    for(int d=0;d<3;d++) for(int k=0;k<dims[d];k++)
        if(!isfinite(axis[d][k]) || !isfinite(axis[d][k+1]) || axis[d][k+1]<=axis[d][k])return 0;
    int *ids=malloc(sizeof(int)*N);
    if(!ids)return 0;
    for(int i=0;i<N;i++) {
        if(!isfinite(s->mask[i]) || floor(s->mask[i])!=s->mask[i] || s->mask[i]<0 || s->mask[i]>127){free(ids);return 0;}
        ids[i]=((int)s->mask[i]&64)?-1:s->wet++;
    }
    int n=s->wet;
    if(!n){free(ids);return 0;}
    s->cells=calloc(n,sizeof(Cell));
    s->face=calloc(n*3,sizeof(double));s->low=calloc(n*3,sizeof(double));
    s->momentum=calloc(n*3,sizeof(double));s->center=calloc(n*3,sizeof(double));
    s->pressure=calloc(n,sizeof(double));s->rhs=calloc(n,sizeof(double));
    s->r=calloc(n,sizeof(double));s->z=calloc(n,sizeof(double));s->direction=calloc(n,sizeof(double));s->ap=calloc(n,sizeof(double));
    if(!s->cells||!s->face||!s->low||!s->momentum||!s->center||!s->pressure||!s->rhs||!s->r||!s->z||!s->direction||!s->ap){free(ids);return 0;}
    int valid=1;
    for(int l=0;l<N;l++)if(ids[l]>=0) {
        int i=ids[l];Cell *c=s->cells+i;
        c->index=l; c->volume=1;
        double rate=0;
        for(int d=0;d<3;d++) {
            int k=(l/strides[d])%dims[d]; double w=axis[d][k+1]-axis[d][k];
            c->width[d]=w;c->volume*=w;
            /* isotropic safety margin for deflected local velocities */
            rate+=(fabs(s->incident[d])+.35*s->speed+.0001)/w+2*viscosity/(w*w);
            for(int h=0;h<=1;h++) {
                int side=d*2+h, sign=h?1:-1, other=k+sign;
                int blocked=((int)s->mask[l]>>side)&1;
                if(other>=0 && other<dims[d]) {
                    int next=l+sign*strides[d];
                    if((ids[next]<0 && !blocked) ||
                       (ids[next]>=0 && blocked!=(((int)s->mask[next]>>(side^1))&1)))valid=0;
                    c->neighbor[side]=blocked?WALL:ids[next];
                }else {
                    if(d==2 && !blocked)valid=0;
                    c->neighbor[side]=blocked?WALL:OPEN;
                }
            }
            s->face[3*i+d]=c->neighbor[2*d+1]==WALL?0:s->incident[d];
            s->low[3*i+d]=c->neighbor[2*d]==OPEN?s->incident[d]:0;
        }
        c->dt=.70/rate;
        s->meanStep+=c->dt*c->volume;
        s->totalVolume+=c->volume;
    }
    free(ids); if(!valid)return 0;
    s->meanStep/=s->totalVolume;
    for(int i=0;i<n;i++) {
        Cell *c=s->cells+i;
        for(int side=0;side<6;side++){
            int d=side/2,j=c->neighbor[side];
            c->area[d]=c->volume/c->width[d];
            double distance=.5*(c->width[d]+(j>=0?s->cells[j].width[d]:0));
            c->conductance[side]=viscosity*c->area[d]/distance;
            c->coeff[side]=j==WALL||(j==OPEN && inlet(s,side))?0:c->area[d]*faceStep(s,i,j)/distance;
            c->diag+=c->coeff[side];
        }
        if(c->diag==0)c->diag=1; // isolated flooded voxel
    }
    /* Modified incomplete Cholesky for the seven-point symmetric Poisson matrix.
       Retain 95% of the dropped row sum; fall back locally at isolated pockets. */
    for(int i=0;i<n;i++){
        Cell *c=s->cells+i;
        double pivot=c->diag;
        for(int d=0;d<3;d++){
            int j=c->neighbor[2*d];if(j<0)continue;
            Cell *before=s->cells+j;
            double dropped=0;
            for(int other=0;other<3;other++)if(other!=d && before->neighbor[2*other+1]>=0)
                dropped+=before->coeff[2*other+1];
            double a=c->coeff[2*d];
            pivot-=a*(a+.95*dropped)*before->inverseCholesky*before->inverseCholesky;
        }
        c->inverseCholesky=1/sqrt(pivot>.25*c->diag?pivot:c->diag);
    }
    s->initialized=1;return 1;
}
static void rebuildCenter(Harbor *s) {
    for(int i=0;i<s->wet;i++)for(int d=0;d<3;d++)
        s->center[3*i+d]=.5*(faceValue(s,i,2*d)+faceValue(s,i,2*d+1));
}
static void apply(const Harbor *s,const double *x,double *y) {
    for(int i=0;i<s->wet;i++) {
        const Cell *c=s->cells+i;double sum=c->diag*x[i];
        for(int h=0;h<6;h++)if(c->neighbor[h]>=0)sum-=c->coeff[h]*x[c->neighbor[h]];
        y[i]=sum;
    }
}
static double precondition(Harbor *s) {
    for(int i=0;i<s->wet;i++){
        const Cell *c=s->cells+i;double sum=s->r[i];
        for(int d=0;d<3;d++){
            int j=c->neighbor[2*d];
            if(j>=0)sum+=c->coeff[2*d]*s->cells[j].inverseCholesky*s->z[j];
        }
        s->z[i]=sum*c->inverseCholesky;
    }
    double rz=0;
    for(int i=s->wet-1;i>=0;i--){
        const Cell *c=s->cells+i;double sum=0;
        for(int d=0;d<3;d++){
            int j=c->neighbor[2*d+1];if(j>=0)sum+=c->coeff[2*d+1]*s->z[j];
        }
        s->z[i]=(s->z[i]+sum*c->inverseCholesky)*c->inverseCholesky;
        rz+=s->r[i]*s->z[i];
    }
    return rz;
}
static void project(Harbor *s) {
    int n=s->wet;
    apply(s,s->pressure,s->ap);
    double rz=0,residual2=0,bnorm=0;
    for(int i=0;i<n;i++) {
        s->r[i]=s->rhs[i]-s->ap[i];
        residual2+=s->r[i]*s->r[i];bnorm+=s->rhs[i]*s->rhs[i];
    }
    rz=precondition(s);memcpy(s->direction,s->z,n*sizeof(double));
    double target=fmax(1e-27,bnorm*1e-12);
    for(int it=0;it<450 && residual2>target;it++) {
        apply(s,s->direction,s->ap);
        double pap=0;
        for(int i=0;i<n;i++)pap+=s->direction[i]*s->ap[i];
        if(pap<=1e-30)break;
        double alpha=rz/pap,newrz=0;residual2=0;
        for(int i=0;i<n;i++){
            s->pressure[i]+=alpha*s->direction[i];s->r[i]-=alpha*s->ap[i];
            residual2+=s->r[i]*s->r[i];
        }
        newrz=precondition(s);double beta=newrz/rz;rz=newrz;
        for(int i=0;i<n;i++)s->direction[i]=s->z[i]+beta*s->direction[i];
        s->pressureIterations++;
    }
    for(int i=0;i<n;i++) {
        Cell *c=s->cells+i;
        for(int d=0;d<3;d++){
            int h=d*2+1,j=c->neighbor[h];double p2=j>=0?s->pressure[j]:0;
            s->face[3*i+d]+=c->coeff[h]*(s->pressure[i]-p2)/c->area[d];
            if(c->neighbor[h-1]==OPEN)s->low[3*i+d]-=c->coeff[h-1]*s->pressure[i]/c->area[d];
        }
    }
}
static int sweep(Harbor *s) {
    int n=s->wet;
    rebuildCenter(s);
    for(int i=0;i<n;i++){
        Cell *c=s->cells+i;const double *u=s->center+3*i;double force[3]={0};
        for(int side=0;side<6;side++) {
            int d=side/2,j=c->neighbor[side], sign=side%2?1:-1;
            double flux=sign*faceValue(s,i,side)*c->area[d];
            if(j==WALL) {
                /* Tangential rough-wall stress. The rigid sea surface is free-slip. */
                if(d==2 && side%2 && c->index/strides[2]==NZ-1)continue;
                double usq=u[0]*u[0]+u[1]*u[1]+u[2]*u[2]-u[d]*u[d];
                double drag=.005*sqrt(fmax(usq,0))*c->area[d];
                for(int k=0;k<3;k++)if(k!=d)force[k]-=drag*u[k];
            }else{
                const double *v=j>=0?s->center+3*j:(inlet(s,side)?s->incident:u);
                for(int k=0;k<3;k++) {
                    force[k]-=flux*(flux>=0?u[k]:v[k]);
                    force[k]+=c->conductance[side]*(v[k]-u[k]);
                }
            }
        }
        for(int d=0;d<3;d++)s->momentum[3*i+d]=force[d]/c->volume;
    }
    for(int i=0;i<n;i++) {
        Cell *c=s->cells+i;
        for(int d=0;d<3;d++) {
            int h=2*d+1,j=c->neighbor[h];
            double a=s->momentum[3*i+d];
            if(j>=0){
                double w=c->width[d]/(c->width[d]+s->cells[j].width[d]);
                s->face[3*i+d]+=faceStep(s,i,j)*(a+w*(s->momentum[3*j+d]-a));
            }else if(j==OPEN && !inlet(s,h))s->face[3*i+d]+=c->dt*a;
            if(c->neighbor[h-1]==OPEN && !inlet(s,h-1))s->low[3*i+d]+=c->dt*a;
        }
    }
    for(int i=0;i<n;i++){
        Cell *c=s->cells+i;double sum=0;
        for(int d=0;d<3;d++)sum+=c->area[d]*(faceValue(s,i,d*2+1)-faceValue(s,i,d*2));
        s->rhs[i]=-sum;
    }
    project(s);
    double change=0,div=0;
    for(int i=0;i<n;i++){
        Cell *c=s->cells+i;double sum=0;
        for(int d=0;d<3;d++){
            double hi=faceValue(s,i,2*d+1),lo=faceValue(s,i,2*d);
            double newU=.5*(lo+hi),delta=newU-s->center[3*i+d];
            change+=delta*delta;sum+=(hi-lo)/c->width[d];s->result[d][c->index]=newU;
        }
        div+=sum*sum;
    }
    s->delta=sqrt(change/n)/fmax(1e-9,s->speed);
    s->divergence=sqrt(div/n);
    s->iteration++;
    s->converged=(s->iteration>=8 || s->speed==0) && s->delta<1e-4 && s->divergence<1e-6;
    return isfinite(s->delta) && isfinite(s->divergence);
}
