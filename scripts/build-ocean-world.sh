#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compiler=${RUMOCA:-.deps/rumoca-src/target/debug/rumoca}
lib=build/world-libs
mkdir -p "$lib"
for package in "$PWD"/.deps/modelica_models/*/package.mo "$PWD"/.deps/msl/*/package.mo "$PWD"/Wreck/package.mo; do
  directory=${package%/package.mo}
  ln -sfn "$directory" "$lib/${directory##*/}"
done
ln -sfn "$PWD/.deps/msl/Complex.mo" "$lib/Complex.mo"
roots=(--source-root "$lib")
for model in Shore Sailboat SailMembrane MarineWind WakeSpectrum Regatta Rdd2Survey; do
  roots+=(--source-root "viewer/board/$model.mo")
done
# The coupled FMI kernel holds event snapshots and sensor tensor temporaries
# on the guest stack. The default WASI stack traps during initialization.
export CARGO_PROFILE_RELEASE_OPT_LEVEL="${CARGO_PROFILE_RELEASE_OPT_LEVEL:-3}"
export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS:--Dwarnings}"$'\x1f'"-Clink-arg=-zstack-size=8388608"
exec "$compiler" compile models/OceanWorld.mo -m OceanWorld "${roots[@]}" --target fmi-ls-wasm -o "${OCEAN_WORLD_OUT:-build/ocean-world}"
