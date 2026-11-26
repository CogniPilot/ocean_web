#!/usr/bin/env bash
# Usage: MUJOCO_DIR=/path/to/mujoco RUMOCA=rumoca [BENCH_CPU=4] ./run.sh /tmp/output
set -euo pipefail
bench=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$bench/../../.." && pwd)
out=${1:?Set a build/output directory}
mkdir -p "$out"
out=$(cd "$out" && pwd)
sdk=${MUJOCO_DIR:?Set MUJOCO_DIR to native SDK with include/mujoco and libmujoco.so}
sdk=$(cd "$sdk" && pwd)
modelica=${MODELICA_MODELS:-"$root/.deps/marine-models"}
fmi_headers=${FMI_INCLUDE:-"$root/.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"}
lib=$(find "$sdk" -maxdepth 2 \( -type f -o -type l \) -name 'libmujoco.so*' | sort -V | head -n 1)
if [[ -z "$lib" ]]; then echo "Native libmujoco.so missing from $sdk" >&2; exit 1; fi
"${RUMOCA:-rumoca}" compile "$bench/DryDiverDynamics.mo" -m DryDiverDynamics --source-root "$modelica" --target fmi3 -o "$out"
node "$bench/fixture.mjs" "$out"
sources="$out/DryDiverDynamics/sources"
"${CC:-cc}" -std=c11 -O3 -DNDEBUG -ffp-contract=off -I"$sdk/include" -I"$out" -I"$sources" -I"$fmi_headers" "$bench/compare.c" "$lib" "-Wl,-rpath,$(dirname "$lib")" -lm -o "$out/compare"
runner=()
if [[ -n "${BENCH_CPU:-}" ]]; then runner=(taskset -c "$BENCH_CPU"); fi
"${runner[@]}" "$out/compare" "$out/diver.xml" | tee "$out/result.json"
