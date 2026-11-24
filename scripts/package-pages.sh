#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-build/pages}
mkdir -p "$out"/{board,fmi3,vendor}
cp viewer/{index.html,world-view.mjs,sailing-start.mjs,instrumentation.mjs,compass.mjs,sonar-map.mjs,imaging-sonar.mjs,vehicle.js,vehicle-assets.mjs,propulsion.js,sub-worker.mjs,sub-lamp.mjs,submarine.mjs,sailing-live.mjs,wave-worker.mjs,captains.mjs,fleet-numbers.mjs,fleet.mjs,fleet-room.mjs,npc-room.mjs,npc-vessels.mjs,npc-sailing-worker.mjs,npc-sailing-frame.mjs,npc-hobie-race.mjs,race-rules.mjs,wildlife-wake.mjs,water-spray.mjs,whale-effects.mjs,harbor-map.mjs,harbor-traffic.mjs,harbor-worker.mjs,feeding-harbor.mjs,gull.mjs,fish-finder.mjs,cruiser-sonar.mjs,cruiser-sonar-view.mjs,cruiser-sonar-worker.mjs,cruiser-chart.mjs,motorboat.mjs,keyboard-sticks.mjs,fleet-timeline.mjs,fleet-sea-clock.mjs,drone.mjs,lap-board.mjs,regatta.mjs,inboard-audio.mjs,drone-audio.mjs,render-layers.mjs,physics-view.mjs,collision-view.mjs,inertia-view.mjs,surface-collision-view.mjs,sub-collision-view.mjs,waterline.mjs,caustics.mjs,mast-camera.mjs,camera-cones.mjs,atmosphere.js,bow-grid.mjs,wreck.js,fauna.js,island-landscape.js,visuals.js} "$out/"
cp viewer/board/{boat,trampoline,sail-battens,sail-telltale}.mjs "$out/board/"
cp viewer/vendor/{three.min.js,gltf-loader.mjs,THREE-LICENSE,trystero.mjs} "$out/vendor/"
cp -Rf viewer/{assets,licenses} "$out/"
cp viewer/board/{LICENSE,THIRD-PARTY-NOTICES.txt} "$out/board/"
sed 's|](../../LICENSE)|](../LICENSE)|g' viewer/board/UPSTREAM-NOTICES.md > "$out/board/UPSTREAM-NOTICES.md"
cp LICENSE "$out/"
sed 's|viewer/||g' NOTICE > "$out/NOTICE"
cp viewer/fmi3/{instance.mjs,OceanWorld.fmu,OceanSailing.fmu,Wreck_SurveySLAM.fmu} "$out/fmi3/"
cp viewer/fmi3/BowWavePatch.{json,mjs,wasm} "$out/fmi3/"
for model in CruiserImagingSonar Wreck_Plant Wreck_Navigation Rdd2Survey AirflowProbe HerringGull FeedingGround HullWildlife SwimmerWake SurfaceSpray WhaleSpray HarborTraffic Sailboat Hobie16 HobieFleetPilot Regatta MarineWind HullWake WakeSpectrum; do
  cp viewer/fmi3/"$model".{fmu,json,mjs,wasm} "$out/fmi3/"
done
touch "$out/.nojekyll"

if [[ ${2:-} == --world ]]; then
  node scripts/prepare-world-runtime.mjs "$out/world"
  node scripts/prepare-world-runtime.mjs "$out/sailing" viewer/fmi3/OceanSailing.fmu OceanSailing
  for pair in 'sloop OceanSloop' 'submarine OceanSubmarine' 'flight OceanFlight' 'motorboat OceanMotorboat' 'habitat OceanHabitat'; do
    read -r directory model <<< "$pair"
    node scripts/prepare-world-runtime.mjs "$out/$directory" "viewer/fmi3/$model.fmu" "$model"
  done
  node scripts/export-cruiser-mesh.mjs "$out/motorboat" "$out/motorboat/collision-mesh.json"
  sed 's/<body>/<body data-default-runtime="world">/' viewer/index.html > "$out/index.html"
fi

node scripts/version-viewer.mjs "$out"
