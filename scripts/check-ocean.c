#include "Plant_functions.h"
#include <math.h>
#include <stdio.h>
extern int start(void),step(double,double),read_state(void);
extern double *out_buffer(void),*in_buffer(void);
int main(void){
 if(start()||read_state())return 1;
 threadData_t td={0};
 modelica_real xyz[]={6,10,0};
 real_array pos,p={0},b={0},c={0};
 real_array_create(&pos,xyz,1,(_index_t)3);
 real_array a=omc_Wreck_SpectralSea_field(&td,3,11,.45,45000,13.7,0,pos,&p);
 real_array calm=omc_Wreck_SpectralSea_field(&td,3,0,.45,45000,13.7,0,pos,&c);
 xyz[2]=-13.7;omc_Wreck_SpectralSea_field(&td,3,11,.45,45000,13.7,0,pos,&b);
 double sums=0,sumc=0,mean=0;double *av=a.data,*cv=calm.data,*pv=p.data,*bv=b.data;
 for(int k=0;k<1024;k++){mean+=av[k];sums+=av[k]*av[k];sumc+=cv[k]*cv[k];}
 printf("FFT node error %.3g; surface pressure head error %.3g; bed vertical %.3g; mean %.3g; RMS %.3f / calm %.3f\n",av[5*32+3]-pv[0],pv[4]-pv[0],bv[3],mean/1024,sqrt(sums/1024),sqrt(sumc/1024));
 if(fabs(av[5*32+3]-pv[0])>1e-9||fabs(pv[4]-pv[0])>1e-9||fabs(bv[3])>1e-9||fabs(mean)>1e-8||sums<=sumc)return 2;
 double *in=in_buffer();in[59]=-5;in[58]=103400;in[87]=9.80665;in[91]=11;in[92]=.45;
 for(int i=0;i<100;i++)if(step(.01*i,.01))return 3;
 return read_state() || !isfinite(out_buffer()[2]);
}
