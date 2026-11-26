# Rumoca FMI CUDA batch runner

The runner executes the generated co-simulation step on an NVIDIA GPU once per lane and request. Initialization, FMI input setters and output getters run on the host. Each lane owns a full model instance, event state and a separate 4 MiB scratch arena.

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
