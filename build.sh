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
fetch marine-models https://github.com/CogniPilot/modelica_models 68818e807a347f325f35560ce87c7980bdbeefe9
solver_patch="$root/compiler/modelica-column-cholesky.patch"
if ! git -C .deps/marine-models apply --reverse --check "$solver_patch" 2>/dev/null; then
  git -C .deps/marine-models apply "$solver_patch"
fi
bash scripts/prepare-wreck-sensor-mounts.sh
fetch msl https://github.com/modelica/ModelicaStandardLibrary 8ae3d35c24e519cb2996cab20f3b13daf2b0c50a
node scripts/bathymetry-grid.mjs
node scripts/wreck-solids.mjs
node scripts/piccard-solids.mjs
if [[ -n ${RUMOCA:-} ]]; then
  compiler=$RUMOCA
else
  revision=$(cat compiler/rumoca-revision)
  compiler_dir="$root/.deps/rumoca-upstream"
  fetch rumoca-upstream https://github.com/CogniPilot/rumoca "$revision"
  python3 scripts/patch-rumoca.py "$compiler_dir" "$revision" \
    "$root/compiler/rumoca-array-storage.patch" "$root/compiler/rumoca-pure-tables.patch" \
    "$root/compiler/rumoca-alternating-pure-arguments.patch" "$root/compiler/rumoca-readonly-tables.patch" \
    "$root/compiler/rumoca-nested-output-ranges.patch" "$root/compiler/rumoca-repeated-pure-results.patch" \
    "$root/compiler/rumoca-mixed-history.patch"
  (cd "$compiler_dir" && cargo build --locked -p rumoca --bin rumoca --no-default-features \
    --features scheduled-sim,scenario-config,input-keyboard,transport-udp,transport-zenoh,viewer-web,process-control,fmu-packaging,component-build)
  compiler="$compiler_dir/target/debug/rumoca"
fi
library_root="$root/build/rum-libs"
mkdir -p "$library_root"
ln -sfn "$root/Wreck" "$library_root/Wreck"
roots=(--source-root "$root/.deps/msl" --source-root "$root/.deps/marine-models" --source-root "$library_root")
status=0
for model in OnrtWake OnrTumblehome CruiserImagingSonar Sailboat Hobie16 HobieFleetPilot HobieCoursePrediction Rdd2Survey AirflowProbe CurrentProbe HerringGull FishSchool FeedingGround HullWildlife SwimmerWake SurfaceSpray WhaleSpray MantaRay ScubaDiver HarborTraffic MantaRayOpenWater ScubaDiverOpenWater HarborTrafficOpenWater HullWake WakeSpectrum BowWavePatch MarineWind Regatta Wreck.Plant Wreck.Navigation Wreck.SurveySLAM Wreck.PiccardPositionHold; do
  extra=()
  source=Wreck/package.mo
  if [[ $model == Hobie16 ]]; then source=viewer/board/Hobie16.mo; extra=(--source-root "$root/viewer/board/Shore.mo" --source-root "$root/viewer/board/Sailboat.mo" --source-root "$root/viewer/board/SailMembrane.mo" --source-root "$root/viewer/board/SailingTactics.mo"); fi
  if [[ $model == HobieCoursePrediction ]]; then source=viewer/board/HobieCoursePrediction.mo; fi
  if [[ $model == HobieFleetPilot ]]; then
    source=viewer/board/HobieFleetPilot.mo
    for dep in Shore Sailboat SailMembrane Hobie16 RegattaBase Regatta SailingTactics BowWavePatch; do extra+=(--source-root "$root/viewer/board/$dep.mo"); done
  fi
  base_model=${model%OpenWater}
  if [[ $model == FishSchool ]]; then source=viewer/board/FishSchool.mo; fi
  if [[ $base_model == ScubaDiver ]]; then source=viewer/board/ScubaDiver.mo; extra=(--source-root "$root/viewer/board/DiverTree.mo" --source-root "$root/viewer/board/DiverHydrodynamics.mo"); fi
  if [[ $base_model == MantaRay ]]; then source=viewer/board/MantaRay.mo; extra=(--source-root "$root/viewer/board/MantaContact.mo" --source-root "$root/viewer/board/MantaTree.mo"); fi
  if [[ $model == HullWildlife ]]; then extra=(--source-root "$root/viewer/board/MantaContact.mo" --source-root "$root/viewer/board/SwimmerCollision.mo" --source-root "$root/viewer/board/WildlifeContact.mo"); fi
  if [[ $base_model == HarborTraffic ]]; then extra=(--source-root "$root/viewer/board/MantaContact.mo" --source-root "$root/viewer/board/SwimmerCollision.mo" --source-root "$root/viewer/board/WildlifeContact.mo" --source-root "$root/viewer/board/WildlifeGuidance.mo" --source-root "$root/viewer/board/SwimmerSections.mo" --source-root "$root/viewer/board/GreatWhite.mo" --source-root "$root/viewer/board/Humpback.mo" --source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == Regatta ]]; then extra=(--source-root "$root/viewer/board/RegattaBase.mo" --source-root "$root/viewer/board/BowWavePatch.mo" --source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == OnrtWake ]]; then source=viewer/board/OnrtWake.mo; extra=(--source-root "$root/viewer/board/WakeSpectrum.mo"); fi
  if [[ $model == CurrentProbe || $model == OnrTumblehome || $model == HullWildlife || $model == HerringGull || $model == FeedingGround || $model == SwimmerWake || $model == SurfaceSpray || $model == WhaleSpray || $model == BowWavePatch || $model == WakeSpectrum || $model == HullWake || $model == MarineWind || $model == Regatta || $model == HarborTraffic || $model == Rdd2Survey ]]; then source="viewer/board/$model.mo"; fi
  if [[ $model == CruiserImagingSonar ]]; then source=viewer/board/CruiserImagingSonar.mo; extra=(--source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == Sailboat ]]; then source=viewer/board/Sailboat.mo; extra=(--source-root "$root/viewer/board/Shore.mo" --source-root "$root/viewer/board/SailMembrane.mo" --source-root "$root/viewer/board/SailingTactics.mo"); fi
  if [[ $model == Wreck.Plant ]]; then extra=(--source-root "$root/viewer/board/MantaContact.mo" --source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == Rdd2Survey ]]; then extra=(--source-root "$root/viewer/board/Shore.mo"); fi
  if [[ $model == AirflowProbe ]]; then
    source=viewer/board/AirflowProbe.mo
    extra=(--source-root "$root/viewer/board/Sailboat.mo" --source-root "$root/viewer/board/Rdd2Survey.mo" --source-root "$root/viewer/board/Shore.mo")
  fi
  if [[ $model != "$base_model" ]]; then
    source="viewer/board/$model.mo"
    extra+=(--source-root "$root/viewer/board/$base_model.mo")
  fi
  "$compiler" compile "$source" -m "$model" "${roots[@]}" "${extra[@]}" --target fmi3 -o "build/fmi3/$model" || status=1
done
exit "$status"
