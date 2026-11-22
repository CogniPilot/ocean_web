#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
root=$PWD
mkdir -p .deps build
fetch() {
  if [[ ! -d .deps/$1/.git ]]; then
    git init -q ".deps/$1"
  fi
  if ! git -C ".deps/$1" cat-file -e "$3^{commit}" 2>/dev/null; then
    git -C ".deps/$1" fetch -q --depth 1 "$2" "$3"
  fi
  git -C ".deps/$1" checkout -q --detach "$3"
}
fetch modelica_models https://github.com/CogniPilot/modelica_models 98266128fc635bf7618a71a8065ac38ec37da86d
if ! git -C .deps/modelica_models apply --reverse --check "$root/compiler/rdd2-deck.patch" 2>/dev/null; then
  if ! git -C .deps/modelica_models apply --reverse --check "$root/compiler/rdd2-wind.patch" 2>/dev/null; then
    git -C .deps/modelica_models apply "$root/compiler/rdd2-wind.patch"
  fi
  git -C .deps/modelica_models apply "$root/compiler/rdd2-deck.patch"
fi
fetch msl https://github.com/modelica/ModelicaStandardLibrary 8ae3d35c24e519cb2996cab20f3b13daf2b0c50a
node scripts/wreck-solids.mjs
if [[ -n ${RUMOCA:-} ]]; then
  compiler=$RUMOCA
else
  compiler_dir="$root/.deps/rumoca-src"
  revision=$(cat compiler/rumoca-revision)
  if [[ ! -d "$compiler_dir/.git" ]]; then
    fetch rumoca-src https://github.com/CogniPilot/rumoca "$revision"
  fi
  if [[ $(git -C "$compiler_dir" rev-parse HEAD) != "$revision" ]]; then
    echo "Rumoca checkout differs from compiler/rumoca-revision. Set RUMOCA to test another compiler." >&2
    exit 1
  fi
  fixes=(marine state-initialization navigation scatter mesh sail-guard batten loop-shadow snapshot-reads
    clock-assertions div-bounds-test comprehension-replay quotient-seeds return-prefix fold-captures initial-clock flat-subscripts tensor-concat sampled-initial division-cutoff clock-runs mooring-initial direct-isolation lazy-event-history stay-slices projection-workspace bulk-history)
  patches=()
  for name in "${fixes[@]}"; do patches+=("$root/compiler/rumoca-$name.patch"); done
  python3 scripts/patch-rumoca.py "$compiler_dir" "$revision" "${patches[@]}"
  (cd "$compiler_dir" && cargo build --locked -p rumoca --bin rumoca --no-default-features \
    --features scheduled-sim,scenario-config,input-keyboard,transport-udp,transport-zenoh,viewer-web,process-control,fmu-packaging,component-build)
  compiler="$compiler_dir/target/debug/rumoca"
fi
library_root="$root/build/rum-libs"
mkdir -p "$library_root"
ln -sfn "$root/Wreck" "$library_root/Wreck"
roots=(--source-root "$root/.deps/msl" --source-root "$root/.deps/modelica_models" --source-root "$library_root")
status=0
for model in CruiserImagingSonar Sailboat Hobie16 Rdd2Survey HerringGull FeedingGround HullWildlife SwimmerWake SurfaceSpray WhaleSpray HarborTraffic HullWake WakeSpectrum BowWavePatch MarineWind Regatta Wreck.Plant Wreck.Navigation Wreck.SurveySLAM; do
  extra=()
  source=Wreck/package.mo
  if [[ $model == Hobie16 ]]; then source=viewer/board/Hobie16.mo; extra=(--source-root "$root/viewer/board/Shore.mo" --source-root "$root/viewer/board/Sailboat.mo" --source-root "$root/viewer/board/SailMembrane.mo"); fi
  if [[ $model == HullWildlife ]]; then extra=(--source-root "$root/viewer/board/WildlifeContact.mo"); fi
  if [[ $model == HarborTraffic ]]; then extra=(--source-root "$root/viewer/board/WildlifeContact.mo" --source-root "$root/viewer/board/WildlifeGuidance.mo" --source-root "$root/viewer/board/SwimmerSections.mo" --source-root "$root/viewer/board/GreatWhite.mo" --source-root "$root/viewer/board/Humpback.mo" --source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == Regatta ]]; then extra=(--source-root "$root/viewer/board/BowWavePatch.mo"); fi
  if [[ $model == HullWildlife || $model == HerringGull || $model == FeedingGround || $model == SwimmerWake || $model == SurfaceSpray || $model == WhaleSpray || $model == BowWavePatch || $model == WakeSpectrum || $model == HullWake || $model == MarineWind || $model == Regatta || $model == HarborTraffic || $model == Rdd2Survey ]]; then source="viewer/board/$model.mo"; fi
  if [[ $model == CruiserImagingSonar ]]; then source=viewer/board/CruiserImagingSonar.mo; extra=(--source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == Sailboat ]]; then source=viewer/board/Sailboat.mo; extra=(--source-root "$root/viewer/board/Shore.mo" --source-root "$root/viewer/board/SailMembrane.mo"); fi
  "$compiler" compile "$source" -m "$model" "${roots[@]}" "${extra[@]}" --target fmi3 -o "build/fmi3/$model" || status=1
done
exit "$status"
