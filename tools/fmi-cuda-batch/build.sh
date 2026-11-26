#!/usr/bin/env bash
# Build one runner from the same generated FMU source directory as its CUBIN.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=$(realpath "${1:?source directory containing model.h}")
out=$(realpath -m "${2:?output directory}")
mkdir -p "$out"
fmi=${FMI_INCLUDE:-"$here/../../.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"}
: "${CUDA_INCLUDE:?directory containing cuda.h}"
: "${CJSON_ROOT:?cJSON installation prefix}"
driver=${CUDA_DRIVER:-/run/opengl-driver/lib/libcuda.so.1}
objects=()
jobs_to_wait=()
for unit in "$src"/*.c "$here"/host.c; do
  obj="$out/$(basename "$unit" .c).o"
  objects+=("$obj")
  "${CC:-cc}" -O2 -DNDEBUG -ffp-contract=off -I"$src" -I"$fmi" -c "$unit" -o "$obj" &
  jobs_to_wait+=("$!")
done
status=0
for job in "${jobs_to_wait[@]}"; do wait "$job" || status=1; done
(( status == 0 )) || exit 1
"${CXX:-c++}" -O2 -std=c++17 -I"$CUDA_INCLUDE" -I"$CJSON_ROOT/include" \
  "$here/runner.cpp" "${objects[@]}" "$driver" -L"$CJSON_ROOT/lib" -lcjson -lm \
  -Wl,-rpath,"$CJSON_ROOT/lib" -Wl,-rpath,"$(dirname "$driver")" -o "$out/runner"
