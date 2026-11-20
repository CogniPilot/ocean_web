# ocean_web request tracker

A checked item records the specific result described. Open items include partially implemented requests and identify the remaining check.

## Single-FMU architecture

- [ ] Export one Rumoca FMI 3 LS-WASM component that owns the vehicle plants, actuators, electrical systems, ocean, all sensors, estimation, control, contact, race state and simulation clocks.
- [ ] Replace browser co-simulation and GPU sensor acquisition with one instance. Keep Three.js as an output renderer, including photometric caustics and material shading. Compare native and browser trajectories, range data and map updates before switching the live site.

## Browser, performance and distribution

- [x] Publish the static Three.js simulator on GitHub Pages with sailboat, survey submarine and RDD2 in one scene. Ship precompiled Rumoca FMI 3 WebAssembly modules.
- [x] Add vehicle selection, manual and automatic control for the marine vehicles, keyboard and touch controls, and sailboat cameras that can go underwater.
- [x] Add opt-in peer-to-peer ghosts and verify that two browser clients see each other. Add race marks, committee boat, fleet countdown, start signal and wind audio.
- [ ] Verify remote vessel collisions, sensor visibility options, arbitrary internet peers, and race scoring through a full race.
- [x] Reduce submarine collision broad-phase work. At 4,135 sampled poses all six force and moment components matched the exhaustive check.
- [ ] Benchmark end-to-end submarine speed and input latency on physical phones and desktop browsers with waves, SLAM and multiplayer enabled.
- [ ] Track compiler fixes upstream. Finish review and merge of the marine models in [modelica_models PR 36](https://github.com/CogniPilot/modelica_models/pull/36). Maintain Rumoca-only reproducible builds and verify compound collision and visual shapes.
- [x] Clean unused build directories. Keep source, released FMUs and active compiler products.

## Ocean and atmosphere

- [x] Model finite-depth spectral dispersion and wake generation from immersed sections of each individual hull. Feed wave resistance back into the boat.
- [x] Add deterministic directional wind-wave amplitudes and independent phases to the sailing FFT. Sample the same modes for incident height and slopes.
- [ ] Validate crossing seas, wave groups, sharp crests, wind shifts and puff signatures against reference sequences and buoy spectra. Validate bow waves, trailing waves, distant propagation and hull interference by speed.
- [ ] Calibrate tides, current shear, orbital velocity, wreck shelter and distributed pressure forces. Evaluate precomputed flow around wreck geometry.
- [ ] Compare spectral resolutions, multiple domain sizes and GPU acceleration against the CPU/WASM reference on phones. Check mobile fallback, horizon LOD, reproducibility and water masking inside hulls.
- [x] Refract sunlight through the wave normals and cache wreck depth from the light direction for caustic occlusion.
- [ ] Finish and qualify surface and underwater optics. Cover depth absorption, refraction, reflections of trees, per-pixel waterline, sand caustics, kelp, rocks, shoreline foam, residual foam and whitecaps.
- [ ] Finish sky and weather presets. Verify sun and moon, phases, star field, storm lightning, volumetric cloud lighting, shadows, shafts and live sky reflections under time-of-day changes.
- [ ] Document quality controls, supported APIs, asset provenance and Apache-2.0 compatibility. Use the supplied commercial references as visual targets.

## Sailboats

- [x] Give the trampoline ballast carriage a matte black finish.
- [ ] Verify linked main/jib manual trim (S hauls in, W eases), windward sheet take-up, on-deck slack and independent jib fine trim.

- [ ] Keep the eased mainsail, its full-length battens and boom inboard of both sidestays. Verify port and starboard contact, release on trimming in, and force transfer at the clew.

- [x] Add selectable Pelagic sloop and full-size Hobie 16 with two shallow hulls, twin steering blades, mainsail and jib. Give the Hobie adjustable fore–aft and transverse trampoline ballast.
- [x] Model sail deformation in Rumoca and place full-length battens across the Hobie main and jib following the supplied sail plan.
- [x] Add main/jib sheets, travellers and vang controls, a forestay-mounted jib, masthead wind vane, compass and camera float. Represent sheet tension and slack.
- [ ] Validate sail lift, foil lift and drag, wet sail loading, ballast response, pitch stability and leeward helm against sailing data. Test luffing, tacking, flying a hull, jumping waves and pitchpoling.
- [ ] Qualify GPS/IMU and vane-driven autopilot through a complete course under shifting wind. Validate mast-camera coverage and stitching, plus vision-based puff observations.
- [ ] Compare speed polars, resistance, wake and righting moments with measured Hobie data before using results for hull optimization. Maintain RL observations, actions, repeatable scoring and baseline-controller comparisons.
- [x] Shape both deployed Hobie rudders after the supplied photos and keep their tiller arms linked. Kick-up dynamics and multibody rope simulation are deferred by request.

## Submarine, wreck and drone

- [x] Add a listed three-level wreck, 6-DOF submarine, ballast, drag, buoyancy, spatial currents and structural contact. Add swim/surface controls, rotor animation, RPM-linked bubbles and force display.
- [x] Wire rendered 3D sonar, DVL, depth, IMU and camera features into the browser navigation pipeline. Compare GPU ranges with the Modelica reference.
- [x] Qualify the automatic three-level wreck survey. All 12 stations passed with 0.585 m translational RMS error in 112.8 simulated seconds.
- [ ] Extend survey regression to sensor outages, loop-closure stress, minimum clearance and heading error.
- [ ] Validate the electrical powertrain, ballast thermofluid behavior, air/water propeller loading, surface wind, full added-mass coupling and current-gradient pressure against measured data. Compare against the [Mariana reference](https://piccard.science/).
- [ ] Qualify RDD2 station keeping near the sub, aerodynamic drag and motor-cut sinking through both fluid regimes to seabed contact.
- [x] Add fish and the Quaternius shark and whale. Retain asset credits; compare shading, size and animation from the submarine and waterline cameras.

## Vehicle art

- [x] Incorporate the modern Hobie 16 reference with lime, white and grey sail panels, transparent foot windows, visible batten pockets, and contrasting hull stripes.

- [x] Add reproducible Blender-to-GLB sources for both boat hulls and the submarine pressure housing with embedded PBR maps. Keep the requested upstream RDD2 GLB.
- [ ] Review hulls, rudders and submerged geometry from the supplied photo angles. Extend material detail to rigging, deck hardware, thruster housings and cameras. Preserve mesh pivots, sensor transforms and force application frames.
- [ ] Compare above-water and below-water image sequences on desktop and mobile, including sunset, swell, storm and the wreck approach.
