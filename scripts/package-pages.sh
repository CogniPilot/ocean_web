#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-build/pages}
mkdir -p "$out"/{board,fmi3,vendor}
cp viewer/{index.html,world-view.mjs,sailing-start.mjs,instrumentation.mjs,compass.mjs,sonar-map.mjs,vehicle.js,vehicle-assets.mjs,propulsion.js,sub-worker.mjs,submarine.mjs,sailing-live.mjs,wave-worker.mjs,fleet.mjs,drone.mjs,regatta.mjs,waterline.mjs,caustics.mjs,mast-camera.mjs,atmosphere.js,wreck.js,fauna.js,visuals.js} "$out/"
cp viewer/board/boat.mjs "$out/board/"
cp viewer/vendor/{three.min.js,gltf-loader.mjs,THREE-LICENSE,trystero.mjs} "$out/vendor/"
cp -Rf viewer/{assets,licenses} "$out/"
cp LICENSE NOTICE "$out/"
cp viewer/fmi3/{instance.mjs,OceanWorld.fmu} "$out/fmi3/"
for model in Wreck_Plant Wreck_Navigation Rdd2Survey Sailboat Hobie16 Regatta MarineWind HullWake WakeSpectrum; do
  cp viewer/fmi3/"$model".{fmu,json,mjs,wasm} "$out/fmi3/"
done
touch "$out/.nojekyll"

if [[ ${2:-} == --world ]]; then
  node scripts/prepare-world-runtime.mjs "$out/world"
  sed 's/<body>/<body data-default-runtime="world">/' viewer/index.html > "$out/index.html"
fi
