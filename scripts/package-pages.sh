#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-build/pages}
mkdir -p "$out"/{board,fmi3,vendor}
cp viewer/{index.html,world-view.mjs,sailing-start.mjs,instrumentation.mjs,compass.mjs,sonar-map.mjs,imaging-sonar.mjs,vehicle.js,vehicle-assets.mjs,propulsion.js,sub-worker.mjs,sub-lamp.mjs,submarine.mjs,sailing-live.mjs,wave-worker.mjs,captains.mjs,fleet-numbers.mjs,fleet.mjs,deck-traffic.mjs,fleet-room.mjs,fleet-seat.mjs,fleet-directory.mjs,fleet-menu.mjs,npc-room.mjs,npc-vessels.mjs,npc-sailing-worker.mjs,npc-sailing-frame.mjs,npc-hobie-race.mjs,race-rules.mjs,wildlife-wake.mjs,marine-snow.mjs,water-spray.mjs,whale-effects.mjs,whale-camera.mjs,harbor-map.mjs,harbor-map-input.mjs,harbor-traffic.mjs,harbor-worker.mjs,feeding-harbor.mjs,gull.mjs,fish-finder.mjs,shark-inertia.mjs,shark-contact.mjs,shark-contact-data.mjs,cruiser-sonar.mjs,cruiser-sonar-view.mjs,cruiser-sonar-worker.mjs,cruiser-chart.mjs,motorboat.mjs,keyboard-sticks.mjs,fleet-timeline.mjs,fleet-sea-clock.mjs,drone.mjs,lap-board.mjs,regatta.mjs,inboard-audio.mjs,drone-audio.mjs,piccard-audio.mjs,render-layers.mjs,physics-view.mjs,collision-view.mjs,inertia-view.mjs,surface-collision-view.mjs,sub-collision-view.mjs,waterline.mjs,caustics.mjs,mast-camera.mjs,camera-cones.mjs,atmosphere.js,bow-grid.mjs,fauna.js,island-landscape.js,visuals.js} "$out/"
cp viewer/model-training{,-paths}.mjs viewer/training-fleet-view.mjs viewer/training-model-rig.mjs viewer/onrt-ship.mjs "$out/"
cp viewer/harbor-hud.{css,mjs} viewer/harbor-aux.css "$out/"
cp viewer/fmi3/HobieCoursePrediction.{json,mjs,wasm,fmu} "$out/fmi3/"
cp viewer/{sail-training-tasks,sail-training-helm,hobie-race-policies}.mjs "$out/"
cp viewer/{rig-selection,load-vectors,wildlife-loads}.mjs "$out/"
cp viewer/onrt{,-propeller}.html viewer/onrt-{view,orbit,facility,materials,trial,worker,basin,playback,wake-display,propeller,volume,mesh,recording,shaft-loads}.mjs "$out/"
for obsolete in wrecks.html wrecks.mjs wreck.js; do
  if [[ -f "$out/$obsolete" ]]; then unlink "$out/$obsolete"; fi
done
cp viewer/{live-training-tasks.mjs,live-training-worker.mjs,live-policy-actor.mjs,wildlife-training-tasks.mjs,vehicle-training-tasks.mjs} "$out/"
cp viewer/{abyss-cave.mjs,abyss-encounter.mjs,abyss-plaque.mjs,scuba-bind.mjs,scuba-triangles.mjs,diver-frame.mjs,diver-training-update.mjs,diver-training-worker.mjs,diver-swim-policy.mjs,diver-training.mjs,diver-training-view.mjs,training-chart.mjs,training-replay.mjs,training-count.mjs,training-physics.mjs,training-rig-overlay.mjs,diver-mesh-contact.mjs,diver-contact.mjs,scuba-diver.mjs,coral-reef.mjs,wreck-fish.mjs,baitfish.mjs,fish-body.mjs,fish-schools.mjs,fish-obstacles.mjs,manta.mjs,manta-model.mjs,red-sea-sites.mjs,harbor-sites.mjs,harbor-current.mjs,spawn-sites.mjs,stern-lift.mjs,piccard-hoist.mjs,piccard-flood.mjs,convex-scan.mjs,wreck-contact.mjs} "$out/"
cp viewer/board/{boat,trampoline,sail-battens,sail-telltale}.mjs "$out/board/"
cp viewer/{piccard-geometry.mjs,subsea-materials.js,bathymetry.js} "$out/"
cp viewer/vendor/{sha256.mjs,three.min.js,gltf-loader.mjs,THREE-LICENSE,trystero.mjs,qrcode-2.0.4.mjs,QRCODE-LICENSE,names.js,OBSCENITY-LICENSE} "$out/vendor/"
cp -Rf viewer/{assets,licenses} "$out/"
cp viewer/board/{LICENSE,THIRD-PARTY-NOTICES.txt} "$out/board/"
sed 's|](../../LICENSE)|](../LICENSE)|g' viewer/board/UPSTREAM-NOTICES.md > "$out/board/UPSTREAM-NOTICES.md"
cp LICENSE "$out/"
sed 's|viewer/||g' NOTICE > "$out/NOTICE"
cp viewer/fmi3/{instance.mjs,OceanWorld.fmu,OceanSailing.fmu,Wreck_SurveySLAM.fmu} "$out/fmi3/"
cp viewer/fmi3/OceanMotorboat.{json,mjs,wasm} "$out/fmi3/"
cp viewer/fmi3/BowWavePatch.{json,mjs,wasm} "$out/fmi3/"
for model in BasinCamera OnrtWake OnrTumblehome CruiserImagingSonar Wreck_Plant Wreck_Navigation Rdd2Survey AirflowProbe CurrentProbe HerringGull FishSchool FeedingGround HullWildlife SwimmerWake SurfaceSpray WhaleSpray MantaRay ScubaDiver HarborTraffic Sailboat Hobie16 HobieFleetPilot Regatta MarineWind HullWake WakeSpectrum; do
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
