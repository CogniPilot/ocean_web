#!/usr/bin/env bash
# Compare the generated open-water FMU's rigid-body solve with MuJoCo Warp.
set -euo pipefail
if [[ $# != 2 ]]; then
  echo 'Usage: run.sh EXTRACTED_SCUBA_FMU OUTPUT_DIRECTORY' >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
src=$(realpath "$1/sources")
mkdir -p "$2"
out=$(realpath "$2")
: "${MUJOCO_DIR:?set to MuJoCo SDK directory with include/ and libmujoco.so}"
: "${RUMOCA_ROOT:?set to the matching Rumoca compiler checkout}"
: "${FMI_INCLUDE:?set to the directory containing fmi3Functions.h}"
: "${LLVM_BIN:?set to the LLVM tool bin directory}"
: "${CUDA_INCLUDE:?set to the directory containing cuda.h}"
: "${CUDA_LIBDEVICE:?set to the libdevice bitcode file}"
: "${PYBIND11_INCLUDE:?set to the directory containing pybind11/embed.h}"
: "${PYTHON_CONFIG:=python3-config}"
export CLANG=${CLANG:-clang}
export CUDA_ARCH=${CUDA_ARCH:-sm_86}
mujoco_lib=${MUJOCO_LIBRARY:-"$MUJOCO_DIR/libmujoco.so"}
cuda_lib=${CUDA_DRIVER_LIB:-/usr/lib/x86_64-linux-gnu}
# The oracle's inline solver-factor ABI must match its model.h.
node "$here/submerged.mjs" "$out/submerged.xml"
node "$here/prepare.mjs" "$src" "$out"
"${CC:-cc}" -std=c11 -O2 -ffp-contract=off -DRMC_FMI3_INLINE_FACTORS \
  -I"$MUJOCO_DIR/include" -I"$FMI_INCLUDE" -I"$src" -I"$out" \
  "$here/loads.c" "$out/capture.c" "$mujoco_lib" -Wl,-rpath,"$(dirname "$mujoco_lib")" -lm -o "$out/loads"
"$out/loads" "$out/submerged.xml" "$out/cases.bin" "$out/rigid.bin"
node "$here/build-device.mjs" "$src" "$out" >"$out/build-rigid.log" 2>&1
read -ra py_includes <<< "$("$PYTHON_CONFIG" --includes)"
read -ra py_ldflags <<< "$("$PYTHON_CONFIG" --embed --ldflags)"
"${CXX:-c++}" -O2 -std=c++17 "$here/warp.cc" -I"$PYBIND11_INCLUDE" "${py_includes[@]}" \
  "${py_ldflags[@]}" -o "$out/warp"
"${CXX:-c++}" -O2 -std=c++17 -I"$CUDA_INCLUDE" "$here/rigid.cc" \
  -L"$cuda_lib" -Wl,-rpath,"$cuda_lib" -lcuda -o "$out/rigid"
# Reverse the engine order for the second pair to expose clock/temperature drift.
for pass in 1 2; do
  if [[ "$pass" == 1 ]]; then engines=(warp rigid); else engines=(rigid warp); fi
  for engine in "${engines[@]}"; do
    if [[ "$engine" == warp ]]; then
      "$out/warp" "$out/submerged.xml" "$out/cases.bin" "$out/warp-graph.dot" | tee "$out/warp-$pass.log"
    else
      "$out/rigid" "$out/rigid.cubin" "$out/rigid.bin" | tee "$out/rigid-$pass.log"
    fi
  done
done
