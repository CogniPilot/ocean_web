// Compile once per SDK. Both executables accept the same geometry replay.
#include <algorithm>
#include <array>
#include <chrono>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>

#ifdef USE_RUMOCA
extern "C" {
#include "model.h"
}
struct PosedMesh {
  std::vector<double> heights;
  explicit PosedMesh(const std::vector<std::array<double,3>>& xyz) {
    if (xyz.size()!=807) throw std::runtime_error("recompile Modelica for the new diver skin vertex count");
    for (const auto& p : xyz) heights.push_back(p[2]);
  }
  double gap(double height) {
    const double* inputs[]={heights.data(), &height};
    double result;
    if (rumoca_scalar_pure_0(inputs,&result,nullptr)) throw std::runtime_error("Rumoca query failed");
    return result;
  }
};
#elif defined(USE_COAL)
#include <coal/distance.h>
#include <coal/shape/geometric_shapes.h>
struct PosedMesh {
  std::unique_ptr<coal::ConvexBase> hull;
  coal::Halfspace floor{coal::Vec3s::UnitZ(), 0};
  explicit PosedMesh(const std::vector<std::array<double,3>>& xyz) {
    auto points = std::make_shared<std::vector<coal::Vec3s>>();
    for (const auto& p : xyz) points->emplace_back(p[0],p[1],p[2]);
    hull.reset(coal::ConvexBase::convexHull(points,points->size(),true));
  }
  double gap(double height) {
    coal::DistanceRequest request;
    request.enable_signed_distance = true;
    coal::DistanceResult result;
    coal::distance(&floor,coal::Transform3s(),hull.get(),coal::Transform3s(coal::Vec3s(0,0,height)),request,result);
    return result.min_distance;
  }
};
#else
#include <mujoco/mujoco.h>
struct PosedMesh {
  std::unique_ptr<mjModel, decltype(&mj_deleteModel)> model{nullptr,mj_deleteModel};
  std::unique_ptr<mjData, decltype(&mj_deleteData)> data{nullptr,mj_deleteData};
  double center;
  explicit PosedMesh(const std::vector<std::array<double,3>>& xyz) {
    std::ostringstream xml;
    xml << std::setprecision(17) << "<mujoco><asset><mesh name='diver' vertex='";
    for (const auto& p : xyz) xml << p[0] << ' ' << p[1] << ' ' << p[2] << ' ';
    xml << "'/></asset><worldbody><geom type='plane' size='5 5 1'/><body><freejoint/>"
           "<geom type='mesh' mesh='diver'/></body></worldbody></mujoco>";
    char error[1024] = {};
    std::unique_ptr<mjSpec,decltype(&mj_deleteSpec)> spec(mj_parseXMLString(xml.str().c_str(),nullptr,error,sizeof error),mj_deleteSpec);
    if (!spec) throw std::runtime_error(error);
    model.reset(mj_compile(spec.get(),nullptr));
    if (!model) throw std::runtime_error(mjs_getError(spec.get()));
    data.reset(mj_makeData(model.get()));
    mj_kinematics(model.get(),data.get());
    center = data->geom_xpos[5];  // Compiled meshes can have an offset from their body.
  }
  double gap(double height) {
    data->geom_xpos[5] = center + height;
    return mj_geomDistance(model.get(),data.get(),0,1,2.0,nullptr);
  }
};
#endif
struct Query { size_t mesh; double offset; };
int main(int argc, char** argv) try {
  if (argc != 2) throw std::runtime_error("expected a fixture path");
  std::ifstream file(argv[1]); file.exceptions(std::ios::badbit | std::ios::failbit);
  size_t pose_count, query_count; file >> pose_count >> query_count;
  std::vector<std::unique_ptr<PosedMesh>> meshes;
  for (size_t i=0; i<pose_count; ++i) {
    size_t count; file >> count;
    std::vector<std::array<double,3>> points(count);
    for (auto& p : points) file >> p[0] >> p[1] >> p[2];
    meshes.push_back(std::make_unique<PosedMesh>(points));
  }
  std::vector<Query> queries(query_count);
  for (auto& q : queries) file >> q.mesh >> q.offset;
  std::vector<double> times;
  for (int pass=0; pass<9; ++pass) {
    const auto start=std::chrono::steady_clock::now();
    double sum=0;
    for (int i=0; i<128; ++i)
      for (const auto& q : queries) sum += meshes[q.mesh]->gap(q.offset);
    volatile double sink=sum; (void)sink;
    const auto elapsed=std::chrono::duration<double,std::nano>(std::chrono::steady_clock::now()-start);
    if (pass>=2) times.push_back(elapsed.count()/(128*query_count));
  }
  std::sort(times.begin(),times.end());
  std::cerr << times[times.size()/2] << '\n';
  std::cout << std::setprecision(17);
  for (const auto& q : queries) std::cout << meshes[q.mesh]->gap(q.offset) << '\n';
} catch (const std::exception& e) {std::cerr << e.what() << '\n'; return 1;}
