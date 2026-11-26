# Native diver forward dynamics

This fixture compares the 88 kg, 15-frame diver with 14 rotational joints and a free torso. The subsequent diver revision adds four twist axes. Each benchmark case prescribes the pose, generalized velocity, root wrench and shaft torques. Both engines recompute pose-dependent transforms, inertial and velocity terms, then solve for all 20 accelerations. Joint armatures and mass-centre offsets are identical. MuJoCo represents each massless carrier and its co-located child hinge as two ordered joints on one physical segment.

The Rumoca side calls native C generated from the production MultiBodyLie.Math.floatingTreeDynamics function. The harness requests its acceleration output and checks its assertions. The MuJoCo side calls mj_forward on preallocated native mjData. World linear and body angular coordinates are reconciled with the rotating-frame transport term. Gravity, contacts, hydrodynamics, policies and time integration are excluded. Each sample measures one CPU thread and excludes setup, coordinate conversion, model loading, rendering and the FMI wrapper. See [MuJoCo computation](https://mujoco.readthedocs.io/en/stable/computation/index.html) and [mj_forward](https://mujoco.readthedocs.io/en/stable/APIreference/APIfunctions.html#mj-forward).

## Reproduce

The Linux runner needs Node, a C compiler, Rumoca with the FMI 3 target, MuJoCo's native headers and shared library, the Modelica library under .deps/marine-models, and the FMI 3 headers under .deps/rumoca-upstream. Set MODELICA_MODELS and FMI_INCLUDE to use other locations. BENCH_CPU optionally pins the executable to a logical CPU.

```sh
MUJOCO_DIR=/path/to/mujoco CC=gcc RUMOCA=rumoca BENCH_CPU=4 \
  scripts/benchmarks/diver-dynamics/run.sh /tmp/diver-dynamics
```

The runner generates both engines' physical inputs from fixture.mjs, validates 640 acceleration components across 32 deterministic states, warms the solvers, and writes nine paired timing blocks to result.json. Each block visits the same states 100 times in both engines. The first engine alternates between blocks. An acceleration error above 1e-9 aborts before timing.

## Measured on AMD Ryzen 9 5950X

On 2026-11-26 the Ryzen system ran MuJoCo 4.0.1, Rumoca 0.10.4, MultiBodyLie checkout 54509b8 and GCC 15.2.0 with -O3 and double precision, pinned to logical CPU 4. The greatest acceleration discrepancy was 1.28e-13, with the largest absolute reference component 40.63. The measurements are per call.

| Backend | Median | Observed block range |
|---|---:|---:|
| MuJoCo | 3.65 µs | 3.29–5.94 µs |
| Rumoca / MultiBodyLie | 101.62 µs | 86.53–108.60 µs |

MuJoCo was 27.9× faster using the ratio of these medians. An independent Linux perf sample of the same executable reported 67.46% of all cycles inside the generated 20-by-20 Cholesky solveSPD and 23.40% inside the enclosing floatingTreeDynamics symbol (exclusive samples). This makes generated factorization a concrete profiling target before drawing conclusions about library-wide performance. Other jobs were present on this workstation, and this dry kernel measures only one part of a room or training update.

## Rumoca compiler reproduction and application workaround

CholeskyCopy.mo isolates the missed array-storage reuse. This model compiles independently of the diver, MuJoCo, and MultiBodyLie.

```sh
rumoca compile scripts/benchmarks/diver-dynamics/CholeskyCopy.mo -m CholeskyCopy \
  --target fmi3 -o /tmp/cholesky-copy
rg -n '400 \* sizeof' /tmp/cholesky-copy/CholeskyCopy/sources/rmc_functions.c
```

The tested compiler binary was built from the Ocean Web toolchain at Rumoca base 7107c18e0b0e9fea60151c8b0e6b884a51b6df80 with project patches. Its SHA-256 is e77f2a3817059d27bd3b3f2a35b372a63f2f8c58802f1ae59cd2bb4d622f5012. Generated lines 438–442 of the standalone reproduction copy 400 doubles, assign one indexed element, then copy the full array into the next fold accumulator. A compiler investigation can trace last use and aliasing at these two boundaries. A regression should also cover an old array value or overlapping slice that must remain observable. Source lines can move between compiler builds.

The Ocean Web build applies compiler/modelica-column-cholesky.patch to its pinned Modelica library. It expresses Cholesky factorization as complete column updates against the already-computed columns. The resulting model produced a 42.26 µs median (31.47–46.96 µs) against 5.28 µs (3.41–5.97 µs) for MuJoCo during that run. Its maximum acceleration error was 1.07e-13. The production 18-joint Wasm model before and after the change agreed to 6.54e-13 across 120 ten-millisecond advances per case for neutral trim, forward swimming, turning, mixed pitch and roll, vest inflation and an applied contact load.

For an unmodified baseline after running the project build, create a clean Modelica checkout and set MODELICA_MODELS explicitly.

```sh
git -C .deps/marine-models worktree add --detach /tmp/diver-baseline-models \
  54509b833bbd47153e4c9739c1ab5210c455157b
MODELICA_MODELS=/tmp/diver-baseline-models MUJOCO_DIR=/path/to/mujoco \
  scripts/benchmarks/diver-dynamics/run.sh /tmp/diver-baseline
```

## Comparing compiler builds on the original Modelica

check-compiler.sh also times the standalone generated Cholesky function. It solves 24 deterministic positive-definite 20-by-20 matrices and checks every solution against a known vector before timing. The runner requires the unmodified Modelica library pinned above, uses a separate compilation cache in each output directory, and then runs the 15-frame diver comparison.

```sh
MODELICA_MODELS=/tmp/diver-baseline-models MUJOCO_DIR=/path/to/mujoco \
  RUMOCA=/path/to/first/rumoca CC=gcc BENCH_CPU=4 \
  scripts/benchmarks/diver-dynamics/check-compiler.sh /tmp/compiler-before
MODELICA_MODELS=/tmp/diver-baseline-models MUJOCO_DIR=/path/to/mujoco \
  RUMOCA=/path/to/second/rumoca CC=gcc BENCH_CPU=4 \
  scripts/benchmarks/diver-dynamics/check-compiler.sh /tmp/compiler-after
```

With clean Rumoca PR #755 HEAD 58efc82dd3283856d605013bd934736bacbcc60a (0.11.0), the standalone solve median was 82.59 µs with max solution error 4.00e-15. The diver median was 151.32 µs against MuJoCo at 4.00 µs with max acceleration error 1.28e-13. This compiler uses sizeof for the same 400-double copies at lines 346 and 351 of the reduced generated C.

## Generalized torque gradients

check-derivatives.sh uses the original solveSPD from CholeskyCopy.mo, fed physical diver mass matrices in MuJoCo generalized coordinates. At each fixed pose and velocity the equation is M a = applied_effort − bias. For a scalar loss sᵀa the torque gradient is M⁻ᵀs. Seeds act on the 14 hinges; all 20 generalized sensitivity components are compared across engines. Independent centered differences perturb each hinge's applied torque in mj_forward.

Run this after check-compiler.sh with the same compiler and output directory.

```sh
MUJOCO_DIR=/path/to/mujoco RUMOCA=/path/to/rumoca CC=gcc BENCH_CPU=4 \
  scripts/benchmarks/diver-dynamics/check-derivatives.sh /tmp/compiler-before
```

Clean PR #755 reproduced all 448 hinge gradients with maximum finite-difference discrepancy 1.43e-10. The largest discrepancy between analytical implementations was 5.33e-15. With 32 sampled postures the native generated Rumoca JVP (primal and tangent together, zero dM) took 267.51 µs median. The actual fmi3GetAdjointDerivative request plus primal read took 5.68 ms. This FMI backend evaluates one analytical direction per input and contracts the resulting columns with the supplied seed. The native MuJoCo comparison took 2.00 µs for a newly factored dense matrix and both linear solves, or 0.73 µs for two solves reusing the factor available after mj_forward. These are fixed-pose torque sensitivities; whole-body state, timestep, fluid and contact Jacobians have separate costs.
