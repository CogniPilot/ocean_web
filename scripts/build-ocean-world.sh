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
exec "$compiler" compile models/OceanWorld.mo -m OceanWorld "${roots[@]}" --target fmi-ls-wasm -o build/ocean-world
