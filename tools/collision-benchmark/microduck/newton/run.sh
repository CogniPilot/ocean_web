#!/usr/bin/env bash
# Build the validated CPU reference and run Newton's GPU solver from a native benchmark host.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
sdk=$(realpath "${1:?Pass the extracted MuJoCo 4.0.1 SDK}")
out=${2:?Pass a benchmark output directory}
mode=${3:-verify}
[[ $mode == verify || $mode == time ]]
mkdir -p "$out"
out=$(realpath "$out")
bench=tools/collision-benchmark/microduck/newton
export MICRODUCK_REFERENCE="$out/rumoca-reference.bin" NEWTON_MJCF="$out/newton.xml"
OMP_NUM_THREADS=${OMP_NUM_THREADS:-1} tools/collision-benchmark/microduck/run.sh "$sdk" | tee "$out/native.log"
pyconfig=${PYTHON_CONFIG:-python3-config}
read -ra pyflags <<< "$("$pyconfig" --includes)"
read -ra pylibs <<< "$("$pyconfig" --embed --ldflags)"
if [[ -n ${PYBIND11_INCLUDE:-} ]]; then pyflags+=("-I$PYBIND11_INCLUDE")
else
  read -ra bindflags <<< "$("${PYTHON:-python3}" -m pybind11 --includes)"
  pyflags+=("${bindflags[@]}")
fi
lib="$sdk/libmujoco.so.4.0.1"
[[ -f $lib ]] || lib="$sdk/lib/libmujoco.so.4.0.1"
flags=(-I"$sdk/include" "${pyflags[@]}")
if [[ -n ${CUDA_INCLUDE:-} ]]; then flags+=("-I$CUDA_INCLUDE"); fi
if [[ -n ${CUDA_DRIVER_DIR:-} ]]; then flags+=("-L$CUDA_DRIVER_DIR" "-Wl,-rpath,$CUDA_DRIVER_DIR"); fi
"${CXX:-c++}" -std=c++17 -O2 "${flags[@]}" "$bench/bench.cc" "${pylibs[@]}" -lcuda "$lib" \
  -Wl,-rpath,"$(dirname "$lib")" -Wl,-rpath,"$("$pyconfig" --prefix)/lib" -o "$out/newton-bench"
"$out/newton-bench" "$MICRODUCK_REFERENCE" "$NEWTON_MJCF" "$bench/foot.cu" "$out/foot.cubin" "$mode" | tee "$out/newton.log"
