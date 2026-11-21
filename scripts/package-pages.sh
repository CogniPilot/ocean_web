#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-build/pages}
mkdir -p "$out"/{board,fmi3,vendor}
cp viewer/{index.html,world-view.mjs,sailing-start.mjs,instrumentation.mjs,compass.mjs,sonar-map.mjs,imaging-sonar.mjs,vehicle.js,vehicle-assets.mjs,propulsion.js,sub-worker.mjs,sub-lamp.mjs,submarine.mjs,sailing-live.mjs,wave-worker.mjs,captains.mjs,fleet.mjs,fleet-timeline.mjs,fleet-sea-clock.mjs,drone.mjs,regatta.mjs,render-layers.mjs,waterline.mjs,caustics.mjs,mast-camera.mjs,atmosphere.js,wreck.js,fauna.js,visuals.js} "$out/"
cp viewer/board/{boat,trampoline}.mjs "$out/board/"
cp viewer/vendor/{three.min.js,gltf-loader.mjs,THREE-LICENSE,trystero.mjs} "$out/vendor/"
cp -Rf viewer/{assets,licenses} "$out/"
cp LICENSE NOTICE "$out/"
cp viewer/fmi3/{instance.mjs,OceanWorld.fmu,OceanSailing.fmu,Wreck_SurveySLAM.fmu} "$out/fmi3/"
cp viewer/fmi3/BowWavePatch.{json,mjs,wasm} "$out/fmi3/"
for model in Wreck_Plant Wreck_Navigation Rdd2Survey Sailboat Hobie16 Regatta MarineWind HullWake WakeSpectrum; do
  cp viewer/fmi3/"$model".{fmu,json,mjs,wasm} "$out/fmi3/"
done
touch "$out/.nojekyll"

if [[ ${2:-} == --world ]]; then
  node scripts/prepare-world-runtime.mjs "$out/world"
  node scripts/prepare-world-runtime.mjs "$out/sailing" viewer/fmi3/OceanSailing.fmu OceanSailing
  for pair in 'sloop OceanSloop' 'submarine OceanSubmarine' 'flight OceanFlight'; do
    read -r directory model <<< "$pair"
    node scripts/prepare-world-runtime.mjs "$out/$directory" "viewer/fmi3/$model.fmu" "$model"
  done
  sed 's/<body>/<body data-default-runtime="world">/' viewer/index.html > "$out/index.html"
fi

node scripts/version-viewer.mjs "$out"
