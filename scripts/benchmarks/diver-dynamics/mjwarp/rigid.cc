#include <cuda.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <stdexcept>
#include <vector>
#include "shared.h"
static void check(CUresult status) {
  if (status==CUDA_SUCCESS) return;
  const char *text=nullptr;
  cuGetErrorString(status,&text);
  throw std::runtime_error(text?text:"CUDA failure");
}
static CUdeviceptr allocate(size_t bytes) {
  CUdeviceptr result;
  check(cuMemAlloc(&result,bytes)); return result;
}
int main(int argc,char **argv) {
  if(argc!=3) return 1;
  constexpr int worlds=64;
  constexpr size_t stride=1024*1024;
  std::vector<double> records(worlds*(packed+nv)),out(worlds*nv);
  std::ifstream f(argv[2],std::ios::binary);
  f.read(reinterpret_cast<char*>(records.data()),records.size()*sizeof(double));
  if(!f || f.peek()!=EOF) return 1;
  check(cuInit(0));
  CUdevice dev; CUcontext ctx; CUmodule mod; CUfunction kernel;
  check(cuDeviceGet(&dev,0)); check(cuDevicePrimaryCtxRetain(&ctx,dev)); check(cuCtxSetCurrent(ctx));
  check(cuCtxSetLimit(CU_LIMIT_STACK_SIZE,16384));
  check(cuModuleLoad(&mod,argv[1])); check(cuModuleGetFunction(&kernel,mod,"rigid_batch"));
  CUdeviceptr arena=allocate(worlds*stride), globals;
  check(cuMemsetD8(arena,0,worlds*stride));
  check(cuModuleGetGlobal(&globals,nullptr,mod,"rmc_scratch")); check(cuMemcpyHtoD(globals,&arena,sizeof(arena)));
  check(cuModuleGetGlobal(&globals,nullptr,mod,"rmc_stride")); check(cuMemcpyHtoD(globals,&stride,sizeof(stride)));
  CUdeviceptr input=allocate(records.size()*sizeof(double)), result=allocate(out.size()*sizeof(double)), status=allocate(worlds*sizeof(int));
  check(cuMemcpyHtoD(input,records.data(),records.size()*sizeof(double)));
  void *args[]={&input,&result,&status};
  auto launch=[&](){check(cuLaunchKernel(kernel,worlds,1,1,33,1,1,0,nullptr,args,nullptr));};
  launch(); check(cuCtxSynchronize());
  std::vector<int> statuses(worlds);
  check(cuMemcpyDtoH(statuses.data(),status,worlds*sizeof(int)));
  check(cuMemcpyDtoH(out.data(),result,out.size()*sizeof(double)));
  double worst=0;
  for(int w=0;w<worlds;w++){
    if(statuses[w]) throw std::runtime_error("failed solver assertion");
    for(int j=0;j<nv;j++){
      double diff=std::abs(records[w*(packed+nv)+packed+j]-out[w*nv+j]);
      if(!std::isfinite(diff)) throw std::runtime_error("nonfinite acceleration");
      worst=std::max(worst,diff);
    }
  }
  printf("GPU solver acceleration max_abs %.9g\n",worst);
  if(worst>1e-8) return 1;
  std::vector<double> ms;
  for(int r=0;r<7;r++){
    auto t=std::chrono::steady_clock::now();
    for(int i=0;i<240;i++) launch();
    check(cuCtxSynchronize());
    ms.push_back(1e3*std::chrono::duration<double>(std::chrono::steady_clock::now()-t).count()/240);
  }
  std::sort(ms.begin(),ms.end());
  printf("64-world prescribed-load forward dynamics, ms/batch min %.5f median %.5f max %.5f\n",ms[0],ms[3],ms[6]);
  check(cuModuleUnload(mod));check(cuMemFree(arena));check(cuMemFree(input));check(cuMemFree(result));check(cuMemFree(status));
  check(cuDevicePrimaryCtxRelease(dev));
}
