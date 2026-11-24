#!/usr/bin/env bash
# Compare the wreck guard's Modelica primitive with the MuJoCo native narrow phase.
set -euo pipefail
cd "$(dirname "$0")/../.."
mujoco=$(realpath "${1:?Pass the extracted MuJoCo 4.0.1 SDK directory}")
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
"${RUMOCA:-.deps/rumoca-upstream/target/debug/rumoca}" compile tools/collision-benchmark/SphereBoxProbe.mo \
  -m SphereBoxProbe --source-root .deps/modelica_models --source-root .deps/msl --target fmi3 -o "$out"
src="$out/SphereBoxProbe/sources"
"${CC:-cc}" -O3 -std=c11 -D_POSIX_C_SOURCE=200809L \
  -I"$src" -I.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers \
  -I"$mujoco/include" tools/collision-benchmark/compare.c "$src/rmc_functions.c" \
  -L"$mujoco/lib" -Wl,-rpath,"$mujoco/lib" -lmujoco -lm -o "$out/compare"
"$out/compare"
