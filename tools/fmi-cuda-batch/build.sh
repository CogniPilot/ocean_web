#!/usr/bin/env bash
# Build one runner from the same generated FMU source directory as its CUBIN.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=$(realpath "${1:?source directory containing model.h}")
out=$(realpath -m "${2:?output directory}")
shift 2
host_flags=()
for define in "$@"; do
  case "$define" in
    RMC_FMI3_INLINE_FACTORS) host_flags+=("-D$define") ;;
    *) echo "Unsupported CUDA host ABI option: $define" >&2; exit 2 ;;
  esac
done
mkdir -p "$out"
# Classify the public derivative and indicator reads using FMI ModelStructure.
# A loose sources directory has no inventory and keeps individual getters.
xml="$src/../modelDescription.xml"
output_refs="$out/output-references.h"
if [[ -f "$xml" ]] && awk -v RS='<' '/^ModelStructure[[:space:]]*>/{found=1} END{exit !found}' "$xml"; then
  {
    echo '#define RMC_OUTPUT_INVENTORY_KNOWN 1'
    echo 'static const uint32_t rmc_special_output_refs[] = {'
    awk -v RS='<' '/^(ContinuousStateDerivative|EventIndicator)[[:space:]]/ {
      if (match($0, /valueReference="[0-9]+"/)) {
        attribute = substr($0, RSTART, RLENGTH)
        gsub(/[^0-9]/, "", attribute)
        print attribute ","
      } else { exit 1 }
    }' "$xml"
    echo 'UINT32_MAX};'
  } > "$output_refs"
else
  echo '#define RMC_OUTPUT_INVENTORY_KNOWN 0' > "$output_refs"
fi
fmi=${FMI_INCLUDE:-"$here/../../.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"}
: "${CUDA_INCLUDE:?directory containing cuda.h}"
: "${CJSON_ROOT:?cJSON installation prefix}"
driver=${CUDA_DRIVER:-/run/opengl-driver/lib/libcuda.so.1}
objects=()
jobs_to_wait=()
for unit in "$src"/*.c "$here"/host.c; do
  obj="$out/$(basename "$unit" .c).o"
  objects+=("$obj")
  "${CC:-cc}" "${host_flags[@]}" -O2 -DNDEBUG -ffp-contract=off -DRMC_BATCH_OUTPUT_CLASSIFICATION \
    -I"$src" -I"$fmi" -I"$out" -c "$unit" -o "$obj" &
  jobs_to_wait+=("$!")
done
status=0
for job in "${jobs_to_wait[@]}"; do wait "$job" || status=1; done
(( status == 0 )) || exit 1
"${CXX:-c++}" -O2 -std=c++17 -I"$CUDA_INCLUDE" -I"$CJSON_ROOT/include" \
  "$here/runner.cpp" "${objects[@]}" "$driver" -L"$CJSON_ROOT/lib" -lcjson -lm \
  -Wl,-rpath,"$CJSON_ROOT/lib" -Wl,-rpath,"$(dirname "$driver")" -o "$out/runner"
