# Rumoca FMI CUDA batch runner

The runner executes the generated co-simulation step on an NVIDIA GPU once per lane and request. Initialization, FMI input setters and output getters run on the host. Each lane owns a full model instance, event state and a separate scratch arena (4 MiB by default).

Build the runner with a C and C++17 toolchain, FMI 3 headers, CUDA driver headers and library, and cJSON. Use the same generated C sources for the host build and the device kernel. The metadata JSON is the file shipped with the matching browser reactor.

```sh
export CUDA_INCLUDE=/path/to/cuda/include
export CJSON_ROOT=/path/to/cjson
export CUDA_DRIVER=/path/to/libcuda.so.1
tools/fmi-cuda-batch/build.sh /path/to/ScubaDiver/sources /tmp/diver-runner
/tmp/diver-runner/runner /path/to/ScubaDiver.cubin /path/to/runtime/ScubaDiver.json --capabilities
node tools/fmi-cuda-batch/check.mjs /tmp/diver-runner/runner /path/to/ScubaDiver.cubin /path/to/runtime
```

Without `--capabilities`, send one JSON request per line. A reset can change the lane count. Each subsequent advance uses the same count, order, and positive communication interval in seconds. An empty input object keeps that lane's previous commands. Every successful reply contains the named outputs in the requested lane order, the hardware name, token, cumulative GPU dispatch count since reset , device event time in `kernelSeconds`, and the wall seconds spent on the batch. A failed mutation invalidates the batch; issue a reset before continuing.

```jsonl
{"op":"reset","lanes":[{"inputs":{"bedHeight":-120}}],"outputs":["state"]}
{"op":"advance","dt":0.01,"lanes":[{"inputs":{"pilot":[1,0,0,0.5,0]}}],"outputs":["state","mechanicalPower"]}
```

The memory-based maximum accounts for free VRAM, per-lane arena, instance storage, and the separate CUDA device heap. Before loading a module the runner reserves a heap sized from the generated state and parameter counts for event iteration. This covers concurrent relation-history allocations when the trainer increases the batch size. GPU contention, context allocations and launch latency can make a smaller batch more practical. The current runner copies full instances across PCIe on each step. For modules exporting their build identity it verifies both the device instantiation token and instance size on startup. Older modules require the same build pairing to be established when packaging.

The runner reserves a 24,576-byte CUDA thread stack by default. Set `RUMOCA_CUDA_STACK_BYTES` in the training service environment to use a stack size validated for the specific CUBIN. The packaged sm_86 diver built with ptxas O3 passed four-lane trajectory and 64-lane event checks with 16,384 bytes. This leaves more device memory available for the browser renderer.

Set `RUMOCA_CUDA_BLOCK_COPIES=1` when building plants with a Rumoca checkout that supports cooperative copies. The runner selects the launch shape from the kernel exported by each module.

## Model training service

Build a multi-plant registry from the source FMUs in `viewer/fmi3`. Supply the CUDA-enabled Rumoca checkout containing `examples/codegen/cuda-fmi3` (`2d40a553f186bf9d05890cd8878ad3ca46092f91` on Rumoca PR #755 reproduced the shipped Hobie 16 CUDA kernel from its source FMU). Choose the CUDA architecture for the GPU that will run the service. The build uses Node.js, `unzip`, the host dependencies above, NVPTX-enabled LLVM/Clang, CUDA libdevice and ptxas.

```sh
export RUMOCA_ROOT=/path/to/rumoca
export CLANG=/path/to/clang LLVM_BIN=/path/to/llvm/bin
export CUDA_LIBDEVICE=/path/to/cuda/nvvm/libdevice/libdevice.10.bc
export PTXAS=/path/to/cuda/bin/ptxas CUDA_ARCH=sm_86
export CUDA_INCLUDE=/path/to/cuda/include CJSON_ROOT=/path/to/cjson
export CUDA_DRIVER=/path/to/libcuda.so.1
node tools/fmi-cuda-batch/build-plants.mjs build/cuda-training \
  Hobie16 Sailboat ScubaDiver MantaRay HerringGull HarborTraffic Wreck_Plant Rdd2Survey OnrTumblehome OceanMotorboat
node tools/serve-training.mjs 18588 http://127.0.0.1:18587 --registry build/cuda-training/registry.json
```

Serve the packaged browser viewer separately on the upstream port (18587 in this example) and open the proxy at `http://127.0.0.1:18588/`. The registry maps each FMU name to `runner`, `cubin` and `metadata` paths relative to the JSON file. Use `stackBytes` or `arenaBytes` to override the stack or per-lane scratch arena for a single model. The global arena setting is `RUMOCA_CUDA_ARENA_BYTES`, in multiples of 256 bytes. For the cruiser, the builder preserves the LLVM IR optimization, uses llc O0 and ptxas O1, and registers a 34,816-byte thread stack and an 8 MiB arena for the nested solver and event frames. Device heap reservation uses the state and parameter counts of each compiled model. The sm_86 Hobie 16 kernel requires 24,576 bytes with the tested build. The build replaces the registry after all selected plants pass their device probes. Restart the proxy to load a changed registry.

`GET /api/training/capabilities` reports the available plants, their individual device/memory estimates under `byPlant`, and probe failures under `errors`. During an active rollout the service returns last-measured limits with `busy: true` and the list of `activePlants`. Use `GET /api/training/capabilities?plant=Hobie16` to check one plant without waiting for the registry. The trainer checks the selected model when it opens, when the model changes and when the user selects **Refresh devices**. Starting another session checks current capacity for that plant. The UI compares each runner token to the browser FMU before offering CUDA. Shark and whale share the HarborTraffic runner. The original positional command still serves one plant.

The browser can run the policy update on WebGPU. At Rumoca PR #755 revision `2d40a553`, its `wgsl-ode` target emits continuous derivatives for explicit ODEs and omits event handling, integration and initialization. All ten training plants require events. The Piccard and cruiser also require model initialization. CUDA runs their full FMI step locally, including the solver and events. A static Pages deployment uses browser WASM for these plants.

The cabin cruiser trains on a numeric FMI 3 export of the playable OceanMotorboat Modelica world. The builder reads `viewer/fmi3/OceanMotorboat.training.fmu`. To refresh it after a model change, build the standard world dependencies, then export the reactor and copy its matching metadata, WASM and archive together.

```sh
OCEAN_WORLD_TARGET=fmi3 scripts/build-ocean-world.sh OceanMotorboat
node scripts/browser-wasi-fmi3.mjs build/ocean-motorboat-numeric/OceanMotorboat build/motorboat-training-runtime
cp build/motorboat-training-runtime/OceanMotorboat.{json,mjs,wasm} viewer/fmi3/
cp build/motorboat-training-runtime/OceanMotorboat.fmu viewer/fmi3/OceanMotorboat.training.fmu
```
