#!/usr/bin/env bash
# Compare compiler revisions using exactly the same unmodified model and fixtures.
set -euo pipefail
bench=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$bench/../../.." && pwd)
out=${1:?Set a build/output directory}
mkdir -p "$out"
out=$(cd "$out" && pwd)
export XDG_CACHE_HOME="$out/cache"
m=${MODELICA_MODELS:?Set an unmodified Modelica checkout for comparing compilers}
if [[ $(git -C "$m" rev-parse HEAD) != 54509b833bbd47153e4c9739c1ab5210c455157b ]] || ! git -C "$m" diff --quiet HEAD -- MultiBodyLie/package.mo; then
  echo 'Compiler comparison requires the original 54509b8 MultiBodyLie/package.mo' >&2; exit 1
fi
"${RUMOCA:-rumoca}" --version
"${RUMOCA:-rumoca}" compile "$bench/CholeskyCopy.mo" -m CholeskyCopy --target fmi3 -o "$out/reduced"
src="$out/reduced/CholeskyCopy/sources"
kernel=$(sed -nE 's/^RMC_API int (rumoca_scalar_pure_[0-9]+)\(.*/\1/p' "$src/rmc_functions.c")
if [[ ! $kernel =~ ^rumoca_scalar_pure_[0-9]+$ ]]; then echo 'Expected one generated Modelica pure function' >&2; exit 1; fi
fmi_headers=${FMI_INCLUDE:-"$root/.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"}
"${CC:-cc}" -std=c11 -O3 -DNDEBUG -ffp-contract=off "-DSPD_KERNEL=$kernel" \
  -I"$src" -I"$fmi_headers" "$bench/solve.c" -lm -o "$out/reduced/solve"
runner=()
if [[ -n "${BENCH_CPU:-}" ]]; then runner=(taskset -c "$BENCH_CPU"); fi
"${runner[@]}" "$out/reduced/solve" | tee "$out/reduced/result.json"
"$bench/run.sh" "$out/diver"
