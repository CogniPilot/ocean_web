#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
sdk=$(realpath "${1:?Pass the directory containing MuJoCo 4.0.1 include/ and shared library}")
duck=${MICRODUCK_WEB:-.deps/microduck_web}
(cd "$duck/site" && sha256sum -c - > /dev/null) <<'PINS'
c8c27ec96a8f92a011da9ff7e617d5e65ea44004b80bf13e73bdb28882a6131c  sources/GroundContact.mo
5c2e2b26682c37d02c2bd58532a07723e33b18b61a2f389181b7641cf305ca4a  sources/MicroduckComponents.mo
ec9d2f731596cfc847a7fc3898ef8b5e67a548928abc23216537f1da8af2729c  robot.xml
PINS
bench=tools/collision-benchmark/microduck
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
sed -n '/^function groundWrench/,$p' "$duck/site/sources/GroundContact.mo" > "$out/WalkingSole.mo"
cat "$bench/WalkingSole.mo" >> "$out/WalkingSole.mo"
"${RUMOCA:-.deps/rumoca-upstream/target/debug/rumoca}" compile "$out/WalkingSole.mo" -m WalkingSole --target fmi3 -o "$out"
src="$out/WalkingSole/sources"
name=$(sed -n 's/.*status=\(rumoca_scalar_pure_[0-9]*\)(.*/\1/p' "$src/rmc_assign.c" | sort -u)
[[ $name =~ ^rumoca_scalar_pure_[0-9]+$ ]]
lib="$sdk/libmujoco.so.4.0.1"
[[ -f $lib ]] || lib="$sdk/lib/libmujoco.so.4.0.1"
"${NODE:-node}" "$bench/fixture.mjs" "$duck" > "$out/walk.txt"
"${CC:-cc}" -O3 -DNDEBUG -std=c11 -ffp-contract=off -fopenmp -DWALKING_SOLE="$name" \
  -I"$sdk/include" -I"$src" -I.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers \
  "$bench/walk.c" "$src/rmc_functions.c" "$lib" -Wl,-rpath,"$(dirname "$lib")" -lm -o "$out/walk"
OMP_NUM_THREADS=${OMP_NUM_THREADS:-1} "$out/walk" "$out/walk.txt"
db=scripts/benchmarks/diver-dynamics
"${RUMOCA:-.deps/rumoca-upstream/target/debug/rumoca}" compile "$db/DryDiverDynamics.mo" -m DryDiverDynamics \
  --source-root "${MODELICA_MODELS:-.deps/marine-models}" --target fmi3 -o "$out"
"${NODE:-node}" "$db/fixture.mjs" "$out"
"${NODE:-node}" "$bench/robot.mjs" "$duck/site" "$out"
kernel=$(sed -n 's/^#define TREE_FORWARD //p' "$out/fixture.h")
cat > "$out/walking.c" <<WRAPPER
#include "rmc_functions.c"
int walking_force(const double *x,double *y) { return $name((const double*[]){x},y,NULL); }
WRAPPER
echo '{global: walking_force; local: *;};' > "$out/exports.map"
flags=(-O3 -DNDEBUG -std=c11 -ffp-contract=off -I"$sdk/include" -I.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers)
"${CC:-cc}" "${flags[@]}" -fPIC -shared -I"$src" "$out/walking.c" -Wl,--version-script="$out/exports.map" -lm -o "$out/libwalking.so"
"${CC:-cc}" "${flags[@]}" -I"$out/DryDiverDynamics/sources" -fopenmp -DTREE_FORWARD="$kernel" "$bench/articulated.c" \
  -L"$out" -lwalking -Wl,-rpath,"$out" "$lib" -Wl,-rpath,"$(dirname "$lib")" -lm -o "$out/articulated"
OMP_NUM_THREADS=${OMP_NUM_THREADS:-1} "$out/articulated" "$out/duck.xml" "$out/controls.txt"
"${CC:-cc}" "${flags[@]}" -fopenmp -I"$out" -I"$out/DryDiverDynamics/sources" "$db/trajectory.c" \
  "$lib" -Wl,-rpath,"$(dirname "$lib")" -lm -o "$out/diver-trajectory"
OMP_NUM_THREADS=${OMP_NUM_THREADS:-1} "$out/diver-trajectory" "$out/diver.xml"
