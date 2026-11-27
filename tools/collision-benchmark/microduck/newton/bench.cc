// C++ controls the benchmark. Unmodified upstream Python modules build the Newton scene and CUDA graph.
#include <cuda.h>
#include <mujoco/mujoco.h>
#include <pybind11/embed.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <vector>
namespace py = pybind11;
using namespace pybind11::literals;
constexpr int lanes = 64, steps = 250;
using Vec = std::vector<float>;
static void ck(CUresult v) {
  if (v != CUDA_SUCCESS) {
    const char *s = nullptr;
    cuGetErrorString(v, &s);
    throw std::runtime_error(s ? s : "CUDA error");
  }
}
static auto ptr(const py::object &obj, const char *field) {
  return obj.attr(field).attr("ptr").cast<CUdeviceptr>();
}
struct DeviceBuffers {
  std::vector<CUdeviceptr> buffers;
  CUdeviceptr allocate(size_t bytes) {
    CUdeviceptr buffer;
    ck(cuMemAlloc(&buffer, bytes));
    buffers.push_back(buffer);
    return buffer;
  }
  ~DeviceBuffers() {
    for (auto buffer : buffers)
      cuMemFree(buffer);
  }
};
template <class... Args> static void launch(CUfunction f, CUstream stream, int n, Args... args) {
  void *arguments[] = {static_cast<void *>(&args)...};
  ck(cuLaunchKernel(f, (n + 127) / 128, 1, 1, 128, 1, 1, 0, stream, arguments, nullptr));
}
struct Ref {
  double torque[14], q[21], v[20], load[2];
};
struct Lane {
  double q[21], v[20];
  std::array<Ref, steps> tick;
};
static std::array<Lane, lanes> ref;
static void readRef(const char *path) {
  std::ifstream s(path, std::ios::binary);
  char magic[8] = {};
  s.read(magic, 8);
  if (!s || memcmp(magic, "DUCK250", sizeof(magic)))
    throw std::runtime_error("Wrong reference file");
  static_assert(sizeof(Lane) == sizeof(double) * (41 + steps * 57));
  s.read(reinterpret_cast<char *>(ref.data()), sizeof(ref));
  if (!s)
    throw std::runtime_error("Incomplete reference");
}
static void rootVelocity(const double *q, const double *v, const double *com, double out[6]) {
  double w[3], r[3], spin[3];
  mju_rotVecQuat(w, v + 3, q + 3);
  mju_rotVecQuat(r, com, q + 3);
  mju_cross(spin, w, r);
  for (int k = 0; k < 3; k++) {
    out[k] = v[k] + spin[k];
    out[3 + k] = w[k];
  }
}
struct Check {
  double horizontal = 0, orientation = 0, hinge = 0, load = 0, loadSquared = 0, rootSquared = 0,
         velocity = 0, firstLoad = 0, firstHinge = 0;
  int support[4] = {}, different = 0;
  double totalLoad = 0, hingeSquares = 0;
  std::vector<double> loadErrors;
  void evaluate(const Vec &result, const double *com) {
    for (int i = 0; i < steps; i++)
      for (int j = 0; j < lanes; j++) {
        auto &r = ref[j].tick[i];
        const float *x = result.data() + (i * lanes + j) * 43;
        for (int k = 0; k < 43; k++)
          if (!std::isfinite(x[k]))
            throw std::runtime_error("nonfinite Newton output");
        double qr[4] = {x[6], x[3], x[4], x[5]}, o[3], v[6];
        mju_normalize4(qr);
        mju_subQuat(o, qr, r.q + 3);
        rootVelocity(r.q, r.v, com, v);
        orientation = std::max(orientation, mju_norm3(o));
        for (int k = 0; k < 3; k++) {
          double d = x[k] - r.q[k];
          horizontal = std::max(horizontal, std::abs(d));
          rootSquared += d * d;
        }
        for (int k = 0; k < 14; k++) {
          double e = std::abs(x[7 + k] - r.q[7 + k]);
          hinge = std::max(hinge, e);
          hingeSquares += e * e;
          if (!i)
            firstHinge = std::max(firstHinge, e);
        }
        for (int k = 0; k < 20; k++)
          velocity = std::max(velocity, std::abs(x[21 + k] - (k < 6 ? v[k] : r.v[k])));
        int state = (x[41] > .1) + 2 * (x[42] > .1), refstate = (r.load[0] > .1) + 2 * (r.load[1] > .1);
        support[state]++;
        different += state != refstate;
        for (int k = 0; k < 2; k++) {
          double e = std::abs(x[41 + k] - r.load[k]);
          load = std::max(load, e);
          if (!i)
            firstLoad = std::max(firstLoad, e);
          loadErrors.push_back(e);
          loadSquared += e * e;
          totalLoad += x[41 + k];
        }
      }
    printf("Newton vs paired Rumoca: first_tick_load_max_N %.8g first_tick_hinge_max_rad %.8g "
           "root_position_max_m %.8g rms_3d_m %.8g orientation_max_rad %.8g hinge_max_rad %.8g "
           "generalized_velocity_max %.8g foot_load_max_N %.8g foot_load_rms_N %.8g\n",
           firstLoad, firstHinge, horizontal, sqrt(rootSquared / (lanes * steps)), orientation, hinge,
           velocity, load, sqrt(loadSquared / (lanes * steps * 2)));
    std::sort(loadErrors.begin(), loadErrors.end());
    printf("foot_load_abs_error_p95_N %.8g p99_N %.8g hinge_rms_rad %.8g\n",
           loadErrors[loadErrors.size() * 95 / 100], loadErrors[loadErrors.size() * 99 / 100],
           sqrt(hingeSquares / (lanes * steps * 14)));
    printf("support_ticks_none_left_right_both %d %d %d %d different_from_reference %d/%d "
           "mean_ground_load_bodyweights %.7g\n",
           support[0], support[1], support[2], support[3], different, lanes * steps,
           totalLoad / (lanes * steps * .73724318 * 9.80665));
  }
};
int main(int argc, char **argv) {
  if (argc != 6) {
    std::cerr << "usage: bench reference.bin newton.xml foot.cu foot.cubin verify|time\n";
    return 2;
  }
  const auto prepareStart = std::chrono::steady_clock::now();
  py::scoped_interpreter python{};
  try {
    readRef(argv[1]);
    auto wp = py::module_::import("warp"), n = py::module_::import("newton");
    auto device = wp.attr("get_device")("cuda:0");
    wp.attr("set_device")(device);
    py::print("Newton", n.attr("__version__"), "Warp", wp.attr("__version__"), "GPU",
              device.attr("name"));
    if (n.attr("__version__").cast<std::string>() != "1.8.0" ||
        wp.attr("__version__").cast<std::string>() != "1.19.0")
      throw std::runtime_error("Unsupported Newton/Warp version");
    auto one = n.attr("ModelBuilder")("gravity"_a = py::make_tuple(0, 0, -9.80665));
    one.attr("add_mjcf")(argv[2], "enable_self_collisions"_a = false);
    one.attr("add_ground_plane")("label"_a = "floor");
    if (py::len(one.attr("body_label")) != 15 || py::len(one.attr("shape_label")) != 9)
      throw std::runtime_error("Unexpected model layout");
    auto gap = one.attr("shape_gap");
    for (int k = 0; k < 9; k++)
      gap[py::int_(k)] = .0025;
    auto all = n.attr("ModelBuilder")("gravity"_a = py::make_tuple(0, 0, -9.80665));
    all.attr("replicate")(one, lanes, "spacing"_a = py::make_tuple(0, 0, 0));
    auto model = all.attr("finalize")(device);
    if (model.attr("body_count").cast<int>() != 960 ||
        model.attr("shape_contact_pair_count").cast<int>() != 512)
      throw std::runtime_error("Expected 960 body links and 512 sole-to-ground pairs");
    auto s0 = model.attr("state")(), s1 = model.attr("state")(), ctrl = model.attr("control")();
    const bool tiled = getenv("NEWTON_TILE_GEMM") && std::string(getenv("NEWTON_TILE_GEMM")) == "1";
    py::print("Newton use_tile_gemm", tiled);
    auto solver = n.attr("solvers").attr("SolverFeatherstone")(
        model, "angular_damping"_a = 0., "update_mass_matrix_interval"_a = 1, "use_tile_gemm"_a = tiled);
    auto pipe =
        n.attr("CollisionPipeline")(model, "broad_phase"_a = "explicit", "rigid_contact_max"_a = 1024);
    auto contacts = pipe.attr("contacts")();
    CUcontext ctx;
    ck(cuCtxGetCurrent(&ctx));
    if (!ctx)
      throw std::runtime_error("Missing CUDA context");
    CUstream stream =
        reinterpret_cast<CUstream>(wp.attr("get_stream")(device).attr("cuda_stream").cast<uintptr_t>());

    py::module_::import("warp._src.build")
        .attr("build_cuda")(argv[3], device.attr("arch"), argv[4], "pch_dir"_a = py::str("/tmp"),
                            "use_precompiled_headers"_a = false);
    CUmodule module;
    ck(cuModuleLoad(&module, argv[4]));
    CUfunction prep, feet, applyFeet, record, next;
    ck(cuModuleGetFunction(&prep, module, "prepare"));
    ck(cuModuleGetFunction(&feet, module, "feet"));
    ck(cuModuleGetFunction(&applyFeet, module, "apply_feet"));
    ck(cuModuleGetFunction(&record, module, "record"));
    ck(cuModuleGetFunction(&next, module, "next"));
    DeviceBuffers memory;
    CUdeviceptr tick = memory.allocate(4), torques = memory.allocate(sizeof(float) * steps * lanes * 14),
                load = memory.allocate(sizeof(float) * lanes * 2);
    CUdeviceptr history = memory.allocate(sizeof(float) * steps * lanes * 43),
                faults = memory.allocate(4);
    CUdeviceptr corners = memory.allocate(lanes * 8 * 6 * sizeof(float));
    Vec tau(steps * lanes * 14), q(lanes * 21), v(lanes * 20);
    float cf[3];
    ck(cuMemcpyDtoH(cf, ptr(model, "body_com"), sizeof(cf)));
    double com[3] = {cf[0], cf[1], cf[2]};
    for (int j = 0; j < lanes; j++) {
      auto &a = ref[j];
      size_t qbase = j * 21, vbase = j * 20;
      std::copy(a.q, a.q + 3, q.begin() + qbase);
      for (int k = 0; k < 4; k++)
        q[qbase + 3 + k] = a.q[3 + (k + 1) % 4];
      std::copy(a.q + 7, a.q + 21, q.begin() + qbase + 7);
      double speed[6];
      rootVelocity(a.q, a.v, com, speed);
      std::copy(speed, speed + 6, v.begin() + vbase);
      std::copy(a.v + 6, a.v + 20, v.begin() + vbase + 6);
      for (int i = 0; i < steps; i++)
        std::copy(a.tick[i].torque, a.tick[i].torque + 14, tau.begin() + (i * lanes + j) * 14);
    }
    ck(cuMemcpyHtoD(torques, tau.data(), tau.size() * 4));
    auto reset = [&]() {
      ck(cuStreamSynchronize(stream));
      ck(cuMemsetD32(tick, 0, 1));
      ck(cuMemsetD32(faults, 0, 1));
      ck(cuMemcpyHtoD(ptr(s0, "joint_q"), q.data(), 4 * q.size()));
      ck(cuMemcpyHtoD(ptr(s0, "joint_qd"), v.data(), 4 * v.size()));
      n.attr("eval_fk")(model, s0.attr("joint_q"), s0.attr("joint_qd"), s0);
      ck(cuStreamSynchronize(stream));
    };
    // The solver takes external wrenches for the matched compliant law. Passing contacts a second time
    // would double-count them.
    auto step = [&](const py::object &from, const py::object &to, bool logging) {
      pipe.attr("collide")(from, contacts);
      launch(prep, stream, lanes * 15 * 6, tick, torques, ptr(ctrl, "joint_f"), ptr(from, "body_f"),
             corners);
      launch(feet, stream, 1024, ptr(contacts, "rigid_contact_count"),
             ptr(contacts, "rigid_contact_shape0"), ptr(contacts, "rigid_contact_shape1"),
             ptr(contacts, "rigid_contact_point0"), ptr(contacts, "rigid_contact_point1"),
             ptr(contacts, "rigid_contact_margin0"), ptr(contacts, "rigid_contact_margin1"),
             ptr(model, "shape_body"), ptr(from, "body_q"), ptr(from, "body_qd"), ptr(model, "body_com"),
             corners, faults);
      launch(applyFeet, stream, lanes * 2, corners, ptr(from, "body_f"), load);
      solver.attr("step")(from, to, ctrl, py::none(), .001);
      if (logging)
        launch(record, stream, lanes * 43, tick, ptr(to, "joint_q"), ptr(to, "joint_qd"), load, history);
      void *arg[] = {&tick};
      ck(cuLaunchKernel(next, 1, 1, 1, 1, 1, 1, 0, stream, arg, nullptr));
    };
    // Compile every solver/collision module before CUDA graph capture.
    reset();
    step(s0, s1, true);
    ck(cuStreamSynchronize(stream));
    step(s1, s0, true);
    ck(cuStreamSynchronize(stream));
    auto capture = [&](bool logging) {
      reset();
      wp.attr("capture_begin")(device);
      step(s0, s1, logging);
      step(s1, s0, logging);
      auto graph = wp.attr("capture_end")(device);
      wp.attr("capture_launch")(graph);
      ck(cuStreamSynchronize(stream));
      return graph;
    };
    auto graph = capture(true);
    auto executable = [&](py::object g) {
      return reinterpret_cast<CUgraphExec>(g.attr("graph_exec").attr("value").cast<uintptr_t>());
    };
    auto run = [&](py::object g) {
      auto exec = executable(g);
      reset();
      const auto start = std::chrono::steady_clock::now();
      for (int i = 0; i < steps; i += 2)
        ck(cuGraphLaunch(exec, stream));
      ck(cuStreamSynchronize(stream));
      return std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    };
    run(graph);
    unsigned f = 0;
    ck(cuMemcpyDtoH(&f, faults, 4));
    if (f)
      throw std::runtime_error("Unexpected non-sole contact pair");
    Vec result(steps * lanes * 43);
    ck(cuMemcpyDtoH(result.data(), history, result.size() * 4));
    Check check;
    check.evaluate(result, com);
    std::cout << "Preparation and validation wall seconds "
              << std::chrono::duration<double>(std::chrono::steady_clock::now() - prepareStart).count()
              << std::endl;
    if (check.firstLoad > .025 || check.firstHinge > .000005 || check.horizontal > .003 ||
        check.orientation > .06 || check.hinge > .06 || check.different > steps * lanes * .005)
      throw std::runtime_error("Trajectory or contact agreement gate failed");
    if (std::string(argv[5]) == "time") {
      auto timed = capture(false);
      run(timed);
      std::vector<double> t;
      for (int i = 0; i < 9; i++) {
        t.push_back(run(timed));
        Vec end(lanes * 21);
        ck(cuMemcpyDtoH(end.data(), ptr(s0, "joint_q"), end.size() * 4));
        for (int lane = 0; lane < lanes; lane++)
          for (int k = 0; k < 21; k++) {
            const float expected = result[((steps - 1) * lanes + lane) * 43 + k];
            if (!std::isfinite(end[lane * 21 + k]) || std::abs(end[lane * 21 + k] - expected) > .004) {
              int progress;
              ck(cuMemcpyDtoH(&progress, tick, 4));
              fprintf(stderr, "Endpoint mismatch at lane %d q[%d], step %d: traced %.8f timed %.8f\n",
                      lane, k, progress, expected, end[lane * 21 + k]);
              throw std::runtime_error("Timed replay endpoint changed");
            }
          }
      }
      std::sort(t.begin(), t.end());
      printf("Newton CUDA wall_s min median max %.6f %.6f %.6f aggregate_steps_s %.1f instance_realtime "
             "%.3f\n",
             t.front(), t[4], t.back(), lanes * steps / t[4], steps * .001 / t[4]);
    }
  } catch (const std::exception &e) {
    std::cerr << e.what() << std::endl;
    return 1;
  }
}
