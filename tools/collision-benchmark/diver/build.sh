#!/usr/bin/env bash
set -euo pipefail
out=${1:?Set output directory}
sdk=${COAL_DIR:?Set to Coal SDK prefix}
mj=${MUJOCO_DIR:?Set to MuJoCo SDK prefix}
dir=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
cxx=${CXX:-c++}
"$cxx" -std=c++17 -O3 -DNDEBUG -DUSE_COAL "$dir/plane.cpp" -I"$sdk/include" -I"$sdk/include/eigen3" -L"$sdk/lib" -L"$sdk/lib64" -Wl,-rpath,"$sdk/lib:$sdk/lib64" -Wl,-rpath-link,"$sdk/lib64" -Wl,--no-as-needed -lcoal -lz -o "$out/coal-plane"
lib="$mj/libmujoco.so.4.0.1"
[[ -f "$lib" ]] || lib="$mj/lib/libmujoco.so.4.0.1"
"$cxx" -std=c++17 -O3 -DNDEBUG "$dir/plane.cpp" -I"$mj/include" "$lib" -Wl,-rpath,"$(dirname "$lib")" -o "$out/mujoco-plane"
cargo build --release --locked --manifest-path "$dir/../../bench-wreck-parry/Cargo.toml" --bin diver-plane --target-dir "$out/parry"
root=$(cd "$dir/../../.." && pwd)
compiler=${RUMOCA:-"$root/.deps/rumoca-upstream/target/debug/rumoca"}
"$compiler" compile "$dir/DiverPlaneProbe.mo" -m DiverPlaneProbe --target fmi3 -o "$out/rumoca"
src="$out/rumoca/DiverPlaneProbe/sources"
fmi="$root/.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"
"${CC:-cc}" -O3 -std=c11 -I"$src" -I"$fmi" -c "$src/rmc_functions.c" -o "$out/diver-plane.o"
"$cxx" -std=c++17 -O3 -DNDEBUG -DUSE_RUMOCA "$dir/plane.cpp" -I"$src" -I"$fmi" "$out/diver-plane.o" -lm -o "$out/rumoca-plane"
