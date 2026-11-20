# ocean_web request tracker

A checked item records the specific result described. Open items include partially implemented requests and identify the remaining check.

## Single-FMU architecture

- [ ] Export one Rumoca FMI 3 LS-WASM component that owns the vehicle plants, actuators, electrical systems, ocean, all sensors, estimation, control, contact, race state and simulation clocks.
- [x] Compare native and LS-WASM trajectories, sonar, image features, and mapped keyframes over the first 0.4 s of the integrated Hobie scene.
- [ ] Replace browser co-simulation and GPU sensor acquisition with one instance. Keep Three.js as an output renderer, including photometric caustics and material shading. Extend the native trajectory comparison through a complete survey.

## Browser, performance and distribution

- [x] Float the anchored committee launch on the shared Modelica ocean. Exercise calm equilibrium, tide rise, oblique wake and settling in the shipped Regatta WASM.
- [x] Compare the optimized 64×64 wake transform against the previous transform on a changing oblique tow. The largest measured output difference over 60 updates was below 1e-15. Median standalone wake update time fell from 45 to 21 ms on the development machine.
- [ ] Measure end-to-end real-time factor and frame-time distribution on physical phones during the coupled survey.

- [x] Publish the static Three.js simulator on GitHub Pages with sailboat, survey submarine and RDD2 in one scene. Ship precompiled Rumoca FMI 3 WebAssembly modules.
- [x] Add vehicle selection, independent manual startup and switchable autopilots for all three vehicles, keyboard and mobile thumbstick controls, and sailboat cameras that can go underwater.
- [x] Add opt-in peer-to-peer ghosts and verify that two browser clients see each other. Add race marks, committee boat, fleet countdown, start signal and wind audio.
- [x] Verify reciprocal contact forces and yaw moments for sloop–sloop, catamaran–catamaran and mixed pairs in the shipped FMUs. Two clients joined the public Pages room and rendered each other.
- [ ] Test contact over a latency-impaired peer link, sensor visibility options, arbitrary internet peers, and race scoring through a full race.
- [x] Reduce submarine collision broad-phase work. At 4,135 sampled poses all six force and moment components matched the exhaustive check.
- [ ] Benchmark end-to-end submarine speed and input latency on physical phones and desktop browsers with waves, SLAM and multiplayer enabled.
- [ ] Track compiler fixes upstream. Finish review and merge of the marine models in [modelica_models PR 36](https://github.com/CogniPilot/modelica_models/pull/36). Maintain Rumoca-only reproducible builds and verify compound collision and visual shapes.
- [x] Clean unused build directories. Keep source, released FMUs and active compiler products.

## Ocean and atmosphere

- [x] Model finite-depth spectral dispersion and wake generation from immersed sections of each individual hull. Feed wave resistance back into the boat.
- [x] Add deterministic directional wind-wave amplitudes and independent phases to the sailing FFT. Sample the same modes for incident height and slopes.
- [x] Verify all twelve section water heights against the sampled wave fields. The two pontoons experienced up to 0.647 m of height difference in the swell test.
- [ ] Validate crossing seas, wave groups, sharp crests, wind shifts and puff signatures against reference sequences and buoy spectra. Validate bow waves, trailing waves, distant propagation and hull interference by speed.
- [ ] Calibrate tides, current shear, orbital velocity, wreck shelter and distributed pressure forces. Evaluate precomputed flow around wreck geometry.
- [ ] Compare spectral resolutions, multiple domain sizes and GPU acceleration against the CPU/WASM reference on phones. Check mobile fallback, horizon LOD, reproducibility and water masking inside hulls.
- [x] Refract sunlight through the wave normals and cache wreck depth from the light direction for caustic occlusion.
- [ ] Finish and qualify surface and underwater optics. Cover depth absorption, refraction, reflections of trees, per-pixel waterline, sand caustics, kelp, rocks, shoreline foam, residual foam and whitecaps.
- [ ] Finish sky and weather presets. Verify sun and moon, phases, star field, storm lightning, volumetric cloud lighting, shadows, shafts and live sky reflections under time-of-day changes.
- [ ] Document quality controls, supported APIs, asset provenance and Apache-2.0 compatibility. Use the supplied commercial references as visual targets.

## Sailboats

- [x] Set a 200 m triangular course with a wind-square 40 m start line. Test crossings at three prevailing wind bearings.
- [x] Move the Pilothouse fin, bulb and lateral force station amidships.
- [x] Give the trampoline ballast carriage a matte black finish.
- [x] Transmit leech tension through the mainsail mesh and verify loaded-edge motion with the sheet hauled.
- [x] Replace the catamaran vang with a downhaul. Verify the fixed head, moving tack, tracked foot and reversible luff load through an ease–haul–ease cycle.
- [ ] Compare eased-sail leech speeds during hard trim releases against measured rig motion. Investigate the short, large spikes in the release transient.
- [x] Render generic triple mainsheet blocks, shackles, routed sheet and cam hardware on the moving jib travelers.
- [x] Add pairs of local-flow telltales to both faces of the main and jib at two heights.
- [x] Mount apparent-wind telltales on both catamaran shrouds and verify calm, crosswind and boat-induced flow in the compiled model.
- [ ] Allow the mainsheet blocks to meet, with tension-only low-stretch purchase and elastic fore–aft mast bend.
- [ ] Calibrate mast flexural rigidity and loaded tackle extension against measured hardware.
- [x] Verify linked main/jib manual trim (S hauls in, W eases), windward sheet take-up, on-deck slack and independent jib fine trim.

- [ ] Keep the eased mainsail, its full-length battens and boom inboard of both sidestays. Verify port and starboard contact, release on trimming in, and force transfer at the clew.

- [x] Add selectable Pelagic sloop and full-size Hobie 16 with two shallow hulls, twin steering blades, mainsail and jib. Give the Hobie adjustable fore–aft and transverse trampoline ballast.
- [x] Model sail deformation in Rumoca and place full-length battens across the Hobie main and jib following the supplied sail plan.
- [x] Add main/jib sheets, travellers and vehicle-specific downhaul or vang controls, a forestay-mounted jib, masthead wind vane, compass and camera float. Represent sheet tension and slack.
- [ ] Validate sail lift, foil lift and drag, wet sail loading, ballast response, pitch stability and leeward helm against sailing data. Test luffing, tacking, flying a hull, jumping waves and pitchpoling.
- [x] Verify that the four fisheye lenses and stitched panorama return image pixels and export their synchronized wind field labels.
- [ ] Qualify GPS/IMU and vane-driven autopilot through a complete course under shifting wind. Validate mast-camera coverage and stitching, plus vision-based puff observations.
- [ ] Compare speed polars, resistance, wake and righting moments with measured Hobie data before using results for hull optimization. Maintain RL observations, actions, repeatable scoring and baseline-controller comparisons.
- [x] Raise both tiller arms above the stern deck and connect them to the moving crossbar. Use unlettered red, orange and gold sails with fabric-covered battens and monochrome hull stripes.
- [x] Verify beach support and independent port and starboard rock impacts against the rendered shoreline. The two approach tracks produce opposite yaw moments.
- [x] Shape both deployed Hobie rudders after the supplied photos and keep their tiller arms linked. Kick-up dynamics and multibody rope simulation are deferred by request.

## Submarine, wreck and drone

- [x] Add a listed three-level wreck, 6-DOF submarine, ballast, drag, buoyancy, spatial currents and structural contact. Add swim/surface controls, rotor animation, RPM-linked bubbles and force display.
- [x] Wire rendered 3D sonar, DVL, depth, IMU and camera features into the browser navigation pipeline. Compare GPU ranges with the Modelica reference.
- [x] Qualify the automatic three-level wreck survey. All 12 stations passed with 0.585 m translational RMS error in 112.8 simulated seconds.
- [x] Score survey heading and test a controlled stern-entry revisit. The 12-station run had 2.62° RMS heading error. The 24 s return-track test accepted one closure with 0.604 m maximum position error.
- [x] Exercise the integrated LS-WASM world through the 12-station wreck mission and score the onboard pose estimate against the plant trajectory.
- [x] Verify the public worker sends the SLAM map when keyframes change. Over 40 browser snapshots the five map updates matched the complete FMI graph, and 35 snapshots skipped its 8,640 values.
- [x] Transfer the wind, wake, background sea, camera and feature arrays on their simulation clocks. Across 90 mixed-step browser snapshots, all 1,171,530 checked scalar values matched full reads. The sampled arrays and the scalar probe used 2.61 MB versus 9.37 MB.
- [ ] Extend survey regression to sustained sensor outages, ambiguous loop closures and minimum structural clearance.
- [ ] Validate the electrical powertrain, ballast thermofluid behavior, air/water propeller loading, surface wind, full added-mass coupling and current-gradient pressure against measured data. Compare against the [Mariana reference](https://piccard.science/).
- [x] Verify RDD2 station holding, manual flight, return to station, drag in reversed crosswinds and motor-cut descent to rest at −13.61 m in the released WASM.
- [x] Follow the onboard submarine estimate through the full wreck survey with the RDD2. Horizontal tracking error was 0.874 m RMS, altitude error was 0.236 m RMS and peak horizontal separation was 2.28 m.
- [x] Add fish and the Quaternius shark and whale. Retain asset credits; compare shading, size and animation from the submarine and waterline cameras.

## Vehicle art

- [x] Incorporate the modern Hobie 16 reference with lime, white and grey sail panels, transparent foot windows, visible batten pockets, and contrasting hull stripes.

- [x] Add reproducible Blender-to-GLB sources for both boat hulls and the submarine pressure housing with embedded PBR maps. Keep the requested upstream RDD2 GLB.
- [ ] Review hulls, rudders and submerged geometry from the supplied photo angles. Extend material detail to rigging, deck hardware, thruster housings and cameras. Preserve mesh pivots, sensor transforms and force application frames.
- [ ] Compare above-water and below-water image sequences on desktop and mobile, including sunset, swell, storm and the wreck approach.

- [x] Pin the lower mainsheet block directly to the traveler car and align the Modelica fairlead with the pin.
- [x] Give full-length batten segments axial compression resistance and damp changes in pocket curvature.
- [ ] Calibrate batten stiffness and damping against measured bend and tack-reversal motion. Check peak leech speed during the first haul-in.
- [ ] Reconcile the full-trim rig after lowering the traveler attachment. Check block clearance and peak sheet loads across the downhaul range.

- [x] Shorten the catamaran jib on the live forestay and show the exposed head halyard. Assumed 4.56 m of cloth rise from the reference photos.
- [x] Reproduce runaway wet sail loads in compiled pitchpole and beam-capsize tests. Include wet rig inertia and transverse stay damping.
- [ ] Calibrate sheet tail effort and wet-rig coefficients against measured data.
- [x] Show the triangle designation, port roundings and true first-leg bearing aboard the committee boat. Time each boat from its own start to the finish.
- [x] Give the bow-up sailing compass a rotating true-bearing card, fixed bow index and prominent numeric true heading.
- [ ] Benchmark a local short-wave bow field driven by hull wetting and pressure, with long waves in the existing spectral solver, on physical phones.
- [x] Replace the deck ballast box with an unbranded blue cooler on the moving carriage.
- [x] Profile and optimize island collision with matched contact loads and measured offshore, beach and boulder approaches.
- [x] Verify gust-driven aircraft drag and bank, add drone FPV, and test four-foot deck touchdown, rocking, takeoff and missing the deck.
- [x] Give all three pyramid marks buoyancy and roll/pitch response to water sampled across their individual footprints.

- [x] Add an estimated attitude ladder, heading tape, speed and altitude or depth to both first-person views. Mount the submarine camera inside a transparent forward viewport.
- [x] Add a Shift speed modifier to manual drone flight and model four-foot landings on the catamaran trampoline and sloop hatch.
- [ ] Reproduce the upward mainsail fold reported at 68.4 s, heading 256°T, and 89 N tackle load.
