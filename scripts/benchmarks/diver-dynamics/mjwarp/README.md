# Submerged diver GPU dynamics benchmark

The benchmark compares the current Ocean Web diver’s floating torso and 18 rotational joints on 64 moving, fully submerged configurations. Each engine evaluates forward dynamics at the same configurations, velocities and resolved joint and root loads. MuJoCo Warp 4.0.1 uses float32. The generated Rumoca solver uses binary64.

The oracle evaluates the production Modelica function `DiverTree.forwardDynamics`. It records the operands of `MultiBodyLie.Math.floatingTreeDynamics` after the water forces and gravity have been resolved. On the MuJoCo side it applies the same link wrenches at the link centres of mass, checks all 24 accelerations against Modelica, projects the wrenches into generalized efforts and checks again. The MJCF uses the Modelica mass centres, centre inertias, armatures, and fully immersed entrained-water masses. Fin and controller forces enter as prescribed efforts. The bladder holds a fixed volume and collisions are disabled.

Both GPU runners repeat forward dynamics on the prescribed inputs. Seven warmed blocks of 240 calls report milliseconds per 64-world batch. The measurement includes launching work and waiting at the end of each block. It excludes data transfer, consultation of the oracle, water-force evaluation, time integration, event processing and policy updates. The Warp runner checks accelerations in world-linear/body-angular coordinates against Modelica. The Rumoca runner checks the underlying solver's body-frame accelerations against native binary64. An open-water training round is a separate measurement.

## Run

Run on Linux with an NVIDIA GPU. Install MuJoCo Warp 4.0.1 and the matching MuJoCo Core and Warp runtime for the reference engine. The runner embeds the upstream package using pybind11. A C/C++ compiler, Node, the Python development headers and link configuration for the installed reference package, the CUDA driver and headers, PTX assembler and LLVM NVPTX toolchain are required. The production simulator has no dependency on the reference engine.

Supply the same ScubaDiverOpenWater FMI 3 export and Rumoca checkout used to build the solver. Set `FMI_INCLUDE`, `RUMOCA_ROOT`, `LLVM_BIN`, `CUDA_LIBDEVICE`, `CUDA_INCLUDE`, `MUJOCO_DIR`, and `PYBIND11_INCLUDE` to the installed locations. Set `CUDA_ARCH` for your GPU (`sm_86` on the RTX 3090). The runner also accepts `MUJOCO_LIBRARY`, `CUDA_DRIVER_LIB`, `PYTHON_CONFIG`, `PTXAS`, and `CLANG` when those tools or libraries have alternate names or locations.

```sh
scripts/benchmarks/diver-dynamics/mjwarp/run.sh /path/to/ScubaDiverOpenWater /tmp/diver-gpu-results
```

The runner checks 1,536 acceleration components before reporting speed, repeats timings in reverse engine order, and writes the captured Warp graph to `warp-graph.dot`. Inspect the graph to see which kernels actually launched and their grid and block dimensions. Warp’s kernel cache contains the corresponding generated CUDA source. Rumoca’s emitted instruction stream is in `rigid.ptx` in the results directory.
