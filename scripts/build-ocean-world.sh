#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compiler=${RUMOCA:-.deps/rumoca-upstream/target/debug/rumoca}
bash scripts/prepare-wreck-sensor-mounts.sh
lib=build/world-libs
mkdir -p "$lib"
for package in "$PWD"/.deps/marine-models/*/package.mo "$PWD"/.deps/msl/*/package.mo "$PWD"/Wreck/package.mo; do
  directory=${package%/package.mo}
  ln -sfn "$directory" "$lib/${directory##*/}"
done
ln -sfn "$PWD/.deps/msl/Complex.mo" "$lib/Complex.mo"
case ${1:-OceanWorld} in
  OceanWorld) modelName=OceanWorld; defaultOut=build/ocean-world ;;
  OceanSailing) modelName=OceanSailing; defaultOut=build/ocean-sailing ;;
  OceanSloop) modelName=OceanSloop; defaultOut=build/ocean-sloop ;;
  OceanSubmarine) modelName=OceanSubmarine; defaultOut=build/ocean-submarine ;;
  OceanFlight) modelName=OceanFlight; defaultOut=build/ocean-flight ;;
  OceanMotorboat) modelName=OceanMotorboat; defaultOut=build/ocean-motorboat ;;
  OceanHabitat) modelName=OceanHabitat; defaultOut=build/ocean-habitat ;;
  *) echo "Expected OceanWorld, OceanSailing, OceanSloop, OceanSubmarine, OceanFlight, OceanMotorboat or OceanHabitat" >&2; exit 2 ;;
esac
roots=(--source-root "$lib" --source-root models/OceanRace.mo)
case $modelName in
  OceanSloop) roots+=(--source-root models/OceanSailing.mo) ;;
  OceanSubmarine|OceanFlight|OceanHabitat) roots+=(--source-root models/OceanMission.mo) ;;
  OceanMotorboat) roots+=(--source-root models/OceanMission.mo --source-root viewer/board/BreakwaterEncounter.mo --source-root models/CruiserAnchor.mo --source-root models/CruiserPropulsion.mo) ;;
esac
for model in MantaContact SwimmerCollision WildlifeContact Shore SailingTactics Sailboat SailMembrane MarineWind WakeSpectrum BowWavePatch RegattaBase Regatta SharedRegatta Rdd2Survey; do
  roots+=(--source-root "viewer/board/$model.mo")
done
# The coupled FMI kernel holds event snapshots and sensor tensor temporaries
# on the guest stack. The default WASI stack traps during initialization.
export CARGO_PROFILE_RELEASE_OPT_LEVEL="${CARGO_PROFILE_RELEASE_OPT_LEVEL:-3}"
export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS:--Dwarnings}"$'\x1f'"-Clink-arg=-zstack-size=8388608"
exec "$compiler" compile "models/$modelName.mo" -m "$modelName" "${roots[@]}" --target fmi-ls-wasm -o "${OCEAN_WORLD_OUT:-$defaultOut}"
