#!/usr/bin/env bash
# Run check-compiler.sh with the same compiler first, to generate the original dry and SPD models.
set -euo pipefail
bench=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$bench/../../.." && pwd)
out=$(cd "${1:?Set a compiler benchmark output directory}" && pwd)
export XDG_CACHE_HOME="$out/cache"
sdk=$(cd "${MUJOCO_DIR:?Set the MuJoCo SDK directory}" && pwd)
lib=$(find "$sdk" -maxdepth 2 \( -type f -o -type l \) -name 'libmujoco.so*' | sort -V | head -n 1)
inc=${FMI_INCLUDE:-"$root/.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"}
"${RUMOCA:-rumoca}" compile "$bench/DiverTorqueGradient.mo" -m DiverTorqueGradient \
  --source-root "$bench/CholeskyCopy.mo" --target fmi3 -o "$out/adjoint"
model="$out/adjoint/DiverTorqueGradient"
xml="$model/modelDescription.xml"
rg -q 'providesAdjointDerivatives="true"' "$xml"
vr(){ sed -nE "s/.*name=\"$1\" valueReference=\"([0-9]+)\".*/\1/p" "$xml"; }
token=$(sed -nE 's/.*instantiationToken="([^"]+)".*/\1/p' "$xml")
cc=${CC:-cc}
flags=(-std=c11 -O3 -DNDEBUG -ffp-contract=off -I"$inc")
"$cc" "${flags[@]}" -fPIC -shared -I"$model/sources" "-DAD_TOKEN=\"$token\"" \
  "-DMASS_VR=$(vr inertia)" "-DEFFORT_VR=$(vr effort)" "-DACCELERATION_VR=$(vr acceleration)" \
  "$bench/adjoint.c" "$model/sources/"*.c -lm -o "$out/adjoint/libtorque.so"
reduced="$out/reduced/CholeskyCopy/sources"
kernel=$(sed -nE 's/^RMC_API int (rumoca_scalar_pure_directional_[0-9]+)\(.*/\1/p' "$reduced/rmc_functions.c")
if [[ ! $kernel =~ ^rumoca_scalar_pure_directional_[0-9]+$ ]]; then echo 'Expected generated directional kernel' >&2;exit 1;fi
"$cc" "${flags[@]}" -I"$sdk/include" -I"$reduced" "-DAD_KERNEL=$kernel" "$bench/derivatives.c" \
  "$out/adjoint/libtorque.so" "$lib" "-Wl,-rpath,$out/adjoint" "-Wl,-rpath,$(dirname "$lib")" -lm -o "$out/adjoint/derivatives"
runner=()
if [[ -n ${BENCH_CPU:-} ]]; then runner=(taskset -c "$BENCH_CPU"); fi
"${runner[@]}" "$out/adjoint/derivatives" "$out/diver/diver.xml" | tee "$out/adjoint/result.json"
