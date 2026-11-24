#!/usr/bin/env bash
# Rebuild the static runtime from a complete build.sh source FMU export.
set -euo pipefail
cd "$(dirname "$0")/.."
stage=$(mktemp -d build/browser-release.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
for class in OnrtWake OnrTumblehome CruiserImagingSonar Sailboat Hobie16 HobieFleetPilot Rdd2Survey AirflowProbe CurrentProbe HerringGull FeedingGround HullWildlife SwimmerWake SurfaceSpray WhaleSpray HarborTraffic HullWake WakeSpectrum BowWavePatch MarineWind Regatta Wreck.Plant Wreck.Navigation Wreck.SurveySLAM; do
  model=${class//./_}
  output=build/fmi3/$class
  python3 scripts/browser-fmi3.py "$output/$model" "$stage"
  cp "$output/$model.fmu" "$stage/"
done
cp "$stage"/* viewer/fmi3/
scripts/package-pages.sh
