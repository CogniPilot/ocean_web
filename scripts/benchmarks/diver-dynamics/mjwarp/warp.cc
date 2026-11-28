// Exercise the official MuJoCo Warp package through its public API.
#include <pybind11/embed.h>
#include <pybind11/numpy.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <stdexcept>
#include <vector>
namespace py = pybind11;
using namespace pybind11::literals;
static constexpr int worlds = 64;
struct Case { double pos[25], vel[24], applied[24], wrench[72], expected[24]; };
static_assert(sizeof(Case)==169*sizeof(double));

template<size_t N>
void upload(const py::object& field, const std::vector<Case>& cases, double (Case::*column)[N]) {
  py::array_t<float> values({worlds, int(N)});
  for(int w=0;w<worlds;w++)
    std::copy_n(cases[w].*column, N, values.mutable_data()+w*N);
  if(N==72) values.resize({worlds,12,6});
  field.attr("assign")(values);
}

int main(int argc,char** argv) {
  if(argc!=3 && argc!=4) return 1;
  py::scoped_interpreter interpreter;
  try {
    std::vector<Case> cases(worlds);
    std::ifstream input(argv[2],std::ios::binary);
    input.read(reinterpret_cast<char*>(cases.data()),worlds*sizeof(Case));
    if(!input || input.peek()!=EOF) throw std::runtime_error("incomplete or unexpected input");
    auto wp=py::module_::import("warp"), mj=py::module_::import("mujoco"), mjw=py::module_::import("mujoco_warp");
    wp.attr("set_device")("cuda:0");
    auto model=mj.attr("MjModel").attr("from_xml_path")(argv[1]);
    auto m=mjw.attr("put_model")(model);
    auto d=mjw.attr("put_data")(model,mj.attr("MjData")(model),"nworld"_a=worlds);
    upload(d.attr("qpos"),cases,&Case::pos);
    upload(d.attr("qvel"),cases,&Case::vel);
    upload(d.attr("qfrc_applied"),cases,&Case::applied);
    upload(d.attr("xfrc_applied"),cases,&Case::wrench);
    auto forward=mjw.attr("forward");
    forward(m,d);
    wp.attr("synchronize_device")();
    wp.attr("capture_begin")();
    forward(m,d);
    auto graph=wp.attr("capture_end")();
    if(argc==4) wp.attr("capture_debug_dot_print")(graph,argv[3]);
    auto launch=wp.attr("capture_launch");
    launch(graph);
    wp.attr("synchronize_device")();
    auto output=d.attr("qacc").attr("numpy")().cast<py::array_t<float>>();
    if(output.size()!=worlds*24) throw std::runtime_error("unexpected acceleration dimension");
    double worst=0, squared=0;
    for(int w=0;w<worlds;w++) for(int j=0;j<24;j++){
      double err=std::abs(output.data()[w*24+j]-cases[w].expected[j]);
      if(!std::isfinite(err)) throw std::runtime_error("nonfinite acceleration");
      worst=std::max(worst,err); squared+=err*err;
    }
    printf("GPU acceleration max_abs %.9g RMS %.9g\n",worst,std::sqrt(squared/(worlds*24)));
    if(worst>0.001) return 1;
    std::vector<double> samples;
    for(int r=0;r<7;r++){
      auto start=std::chrono::steady_clock::now();
      for(int i=0;i<240;i++) launch(graph);
      wp.attr("synchronize_device")();
      auto elapsed=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
      samples.push_back(1e3*elapsed/240);
    }
    std::sort(samples.begin(),samples.end());
    printf("64-world prescribed-load forward dynamics, ms/batch min %.5f median %.5f max %.5f\n",samples.front(),samples[3],samples.back());
  } catch(const std::exception& e) { fprintf(stderr,"%s\n",e.what()); return 1; }
}
