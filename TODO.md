# ocean_web request tracker

A checked item records the specific result described. Open items include partially implemented requests and identify the remaining check.

## Current simulator requests · 2026-11-21

### Performance priority

- [ ] Reach sustained simulation headroom of 20× on Low, 10× on Medium and 5× on High on the desktop. Measure the complete offline scene with vehicle and wildlife running. Keep separate measurements for frame rate and physical phones.
- [x] Add a 15-second offline headroom test to Settings. It reports the slower of the vehicle and harbor clocks, target, frame rate and 95th-percentile frame time.
- [ ] Verify at least real-time play in Medium and High on a physical phone with the Hobie in Swell. Measure the remaining gap to 2× with the offline speed setting.

### Latest playtests

- [x] Match Piccard WASD and arrow keys to two mobile joysticks and preserve its Q/E and R/F aliases. Joining the shark or whale releases Piccard input and hides its sensor window; returning to the sub restores it. Verified in desktop and emulated mobile Chromium.
- [x] Default audio off on each new session and silence previously enabled background tabs. Added cruiser engine and propeller sound tied to signed shaft speed and load.
- [x] Shade clouds from scene illumination at night. Show Piccard-style grain and underwater light scatter in hull camera feeds, with bow, stern, port and starboard mounts.
- [x] Reduce fast great-white body motion. In the straight-swim test, anterior bend falls below 0.009° at 3.56 m/s while the tail swings about ±22°. The skinned primary dorsal stays on the torso.
- [x] Rebuild the great white’s rostrum, resting gape, shorter mandible, dental arcades, gum pads and recessed mouth lining from front, side and three-quarter references. Swim, partial bite and full bite use the same model.
- [x] Let the race pilot gain sternway before reversing rudders on a stalled Hobie tack. Recovered from both signs in the compiled plant.
- [x] Resolve shark buoyancy and pitch moment along the body. The nose submerged in 1.43 s from an 85° nose-up release, and all three deliberate breaches reentered.
- [x] Steer the automatic whale around the island and sound ahead before diving. In three 100 s approaches the minimum skin clearance was 2.75–3.28 m. Starting inside the turn radius produced a 1.1 cm glancing contact and the whale swam clear.
- [x] Profile the Firefox simulator and the shoreline freeze with Linux perf. Evaluate whale contact on a 200 Hz physics clock and run wildlife in a dedicated worker. The second simulated second of an overlapping boulder release fell from 44.3 s to 65 ms in the same test.
- [x] Use the single Rumoca SIL stick convention for all seven controllable roles. Verified signed inputs from keyboard and touch, including drone Acro and Piccard.
- [x] Verify the full 600 m Hobie race in the site’s default north wind through both mark roundings and finish. The shipping Regatta Wasm scored a 598.0 s lap.

- [x] Sharpen the gull’s upper bill and taper the lower bill into a shorter, separate tip. Checked the new profile in flight in Chromium.
- [x] Keep the cruiser throttle where the skipper leaves it. Verified W/S, touch release and restoring the lever after reloading the tab.
- [x] Separate the room’s storm switch from time of day. Rain, clouds and lighting were exercised with both Day and Moonlit.
- [x] Use the cruiser’s 3D sonar as its only sonar instrument, including at the helm. Large contacts repeat the supplied hit.mp3 faster at short range. A 9.2 m return repeated every 1.68 s and a 23.2 m return every 2.87 s. Two clients verified six consecutive shared alerts, silence on the seabed and muted listeners.
- [x] Add a separate cruiser 3D imaging sonar panel. A compiled 36 m scan and browser pick resolved range, bearing and elevation. Night alerts can use the same scanner when its display is closed.
- [x] Verify the X-controlled downward floods and overlapping warm glow around the hull, deck occlusion of the independent Z searchlight and shared radar rotation. Twelve strip samples drive the cruiser’s heave, roll and pitch. In moderate waves at rest, beam seas produced 10.47° peak-to-peak roll and head seas produced 12.87° pitch.

### Water interaction and performance

- [ ] Validate wind roughness, puff size and drift against footage at comparable wind speeds. Compare the same view at calm, moderate and strong wind. Higher wind should break up the glassy reflection with denser, steeper ripples, including on mobile.
- [ ] Calculate whitecaps from near-breaking crests. Use crest steepness and local wind to start foam, then advect it with the surface. Emit wind-driven spray directly from exposed crests, with a separate splash source when a plunging lip hits the water. Reuse batched spray rendering and measure mobile cost.
- [ ] Low priority. Add optional surf-zone wave shoaling, refraction, breaking and run-up over the island bathymetry. Drive a local depth-aware wave model with the offshore spectrum. Validate against a sloping-beach benchmark, including turquoise breaking faces, whitewater and a thin foamy swash over the sand. [Delft SWASH manual](https://swash.sourceforge.io/online_doc/swashuse/swashuse.html)
  - For plunging breakers, treat the lip as a narrow moving surface that can curl over an air pocket. Feed lip impact into a surface roller and foam. Use a cap on active crests and particles. [Real-time Breaking Waves for Shallow Water Simulations](https://cgl.ethz.ch/Downloads/Publications/Papers/2007/Thue07b/Thue07b.pdf)
  - Balmforth and Mandre analyze shock-like roll waves generated by shallow flow down a slope. Use their drag and hydraulic-jump treatment as a reference for shallow bores after breaking. [Dynamics of roll waves](https://personal.math.ubc.ca/~njb/Research/mandre.pdf)
- [x] Hobie and humpback water spray share a Modelica discharge law based on relative impact velocity and wet area. The renderer draws ballistic, velocity-aligned drops.
- [x] Wet fluke trailing-edge sockets shed a finite film as the tail emerges. Dry-start emitters carry no film. Exercised runoff and detached spray in a manual breach.
- [x] Replace round breach particles with an asymmetric impact curtain, falling spray and submerged bubble wash. The spout begins at the blowholes and widens into drifting mist. A full browser breach exercised all four effects.
- [x] Interpolate the near-field water patch and transport its bound ridge with the dorsal fin. The measured positional jitter fell from 18.0 to 2.75 cm RMS.
- [x] Wildlife wakes feed both hull dynamics. A nearby whale impact produced 12 cm heave and 1.11° roll on the Hobie, 5 cm and 0.91° on the cruiser.
- [ ] Wildlife patch updates fell from 86.8 to 4.38 ms (whale) and 149.8 to 4.80 ms (shark) in the ten-source test. GPU/readback was prototyped separately. Profile the drone runtime independently.
- [x] Correct split-waterline clear color and height-sampler precision. Seven angular jumps disappeared in a frozen Balanced comparison. Distant refraction filtering retained 93% of the submerged shark contrast and reduced the largest pixel jump from 35.9 to 13.9 levels.

### Whale and shark

- [ ] Check normal whale surfacing against the sequence supplied by the user. Show the blowholes and a spreading mist plume, the arched back, then the lifted flukes with most of the animal submerged.
- [ ] Review the animated humpback at the waterline and from below. Check long scalloped pectorals, ventral throat pleats and broad notched flukes with a dark upper face and mottled white panels with black borders underneath.
- [ ] Validate breach mechanics. Measure tail thrust, muscle power, approach depth and speed, water exit angle, height, roll, re-entry and recovery. Compare against animal observations. Keep the trajectory force-driven.
- [x] Whale pectoral controls, deterministic direct-actuator headless environment and opposite-roll recovery check. Opposite fin commands produced approximately ±39.5° of bank.
- [x] Use unilateral terrain contact on whale and shark skin points. Compiled flat-bottom, powered-shore and beached tests pass. A dry shark tail produces zero water thrust.
- [ ] Verify whale and shark contact stops both sailboats and powered motorboats. Exercise glancing hits, different depths, player-controlled and NPC animals, and multiplayer.
- [ ] Validate both Modelica animal plants, guidance, wake and foam against observations and keep Three.js focused on visualization. Record approximations and calibration evidence before describing either plant as research-grade.
- [ ] Review the adult great white at the requested scale and from the supplied front and side views. Check the continuous jaw opening around the snout, tooth placement, five gill slits, countershading without a black stripe and fins-only exposure at the surface.
- [x] Exercise separate whale and shark cameras in two local browser clients watching shared NPCs. Manually pilot a whale and trigger the breach cycle from its controls.
- [ ] Verify both animals patrol, investigate boats or subs, follow alongside at a safe distance, and return to patrol. Include the host’s Hobie, another player’s sub and an occupied route.
- [x] Exercise manual whale and shark swim, dive, surface and NPC control in the compiled runtime. Keyboard and mobile joystick routes passed on both animals.
- [x] Shared feeding works in a controlled two-browser encounter. A whale caught five and a shark one. Both clients saw all six fish disappear and return while retaining scores. Compiled sonar range, azimuth, elevation and field-of-view tests passed.

### Multiplayer, birds and harbor

- [x] Profile and optimize the cruiser and wildlife runtime. Identical RTX 3090 cruiser runs before and after the terrain optimization measured 17.5 and 49.7 FPS, at 0.923× and 1.012× real time. Four camera feeds and lights ran at 54.1 FPS in a separate sample.
- [x] Build an express-cruiser hull, swept windshield, hardtop, cockpit, helm and swim platform. Local and remote boats share the mesh. Bow and propeller wake were exercised underway.

- [ ] Reproduce same-room invisibility after refresh across independent devices. Test named rooms, reconnect and late join. The editable room field should default to regatta and copied links should preserve it.
- [ ] Verify first-arrival host election, poor-ping fallback and transfer when the host leaves. Only the host can change wind and weather or advance wildlife. Guests should see the host’s NPCs, including later spawns, the sailing Hobie and its wildlife-following drone.
- [ ] Whale blow, impact and gull calls use shared events. Verified two-client gull cries and no replay after host transfer or reconnect. Verify end-to-end audio on separate physical devices.
- [ ] Compiled gull model exercises powered flight and gliding with continuous state. Flight speed and frequency are compared with published measurements. Both gull and drone crossed the cloud layer. Further species-specific calibration is needed for research use.
- [x] Animate the race committee flag and island palms with local wind and gusts.
- [x] Make the inboard cabin cruiser selectable and run it under power in Chromium. The underwater bow camera switched below the waterline while underway.
- [x] Verify one aimable rooftop searchlight (Z), the under-hull lighting circuit (X), four independent underwater cameras and the fish finder. Every camera showed stronger illumination at night when its lights were switched on. Peer lighting state and visibility were tested.

### Helm, instruments and racing

- [ ] Plan sailing routes from the mast cameras. Use synchronized, calibrated mast images and boat attitude to locate and track rough-water puff patches on the surface. Estimate their motion and uncertainty, then use a short-horizon planner to choose headings and tacks based on expected velocity made good, maneuver costs and course constraints. Use the simulator wind field as ground truth for evaluation and compare against the current pilot in the same repeatable weather.
- [x] Show rendered mast sensor images in the sailing UI. Verified four lenses and populated 512 × 512 camera and 1024 × 512 panorama captures.
- [x] Show boat force arrows in the hull frame and the submarine DVL beams and returns in orbit.
- [ ] Match RDD2 keyboard sticks to the Rumoca interactive demo. Check tap versus sustained hold, return to neutral, throttle and arming. Check comparable progressive response on the Hobie tiller and submarine.
- [x] Complete all 17 submarine survey stations. The shipped standalone sub passed a headless run with minimum 2.73 cm guard-to-wreck clearance.
- [ ] Test realistic crew transfer. Auto ballast should settle gently in steady sailing and cross quickly during a tack. Upwind automatic traveler should keep the boom near center on both tacks.
- [x] Show the compact sailing compass, true wind, boat speed and waypoint information by default; group less frequent controls in Settings.
- [x] Exercise drone race autopilot on the triangle. A headless run completed all gates and posted a 289.85 s lap.
- [ ] Verify player sailboat race autopilot from start to scored finish, including tacks on the upwind leg, and verify course and lap display in both sailboat and drone browsers.
- [x] Package the current local preview and verify the simulation clock advances in Chromium.

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
- [x] Publish submarine camera and feature frames only while piloting the submarine, and map rows only while viewing its sonar map. Verified independent subscriptions and camera resumption against the integrated WASM.
- [x] Elect a peer sea clock and accept a shared incident-wave phase in the integrated Modelica world. Compare two independent FMUs at different local ages and exercise late join over WebRTC.
- [x] Replicate wind speed, bearing, sea state and sky settings over WebRTC. Verify late join and simultaneous wind and sky edits.
- [x] Replicate the integrated wind advection distances and storm phase. Verify late entry after a wind change and continuity when the room leader leaves.
- [ ] Synchronize current drift and player-generated wake sources across peers. Measure wave-height agreement on separate devices under latency and packet loss.
- [ ] Test contact over a latency-impaired peer link, sensor visibility options, arbitrary internet peers, and race scoring through a full race.
- [x] Reduce submarine collision broad-phase work. At 4,135 sampled poses all six force and moment components matched the exhaustive check.
- [ ] Benchmark end-to-end submarine speed and input latency on physical phones and desktop browsers with waves, SLAM and multiplayer enabled.
- [ ] Track compiler fixes upstream. Finish review and merge of the marine models in [modelica_models PR 36](https://github.com/CogniPilot/modelica_models/pull/36). Maintain Rumoca-only reproducible builds and verify compound collision and visual shapes.
- [x] Clean unused build directories. Keep source, released FMUs and active compiler products.

## Ocean and atmosphere

- [x] Model finite-depth spectral dispersion and wake generation from immersed sections of each individual hull. Feed wave resistance back into the boat.
- [x] Use the rotated hull-strip positions for wake generation and yaw reaction during simultaneous heel and pitch. Check the interference phase for two hulls, a flying hull and the torque on one wetted strip.
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
- [ ] Compare speed polars, resistance, wake and righting moments with measured Hobie data before using results for hull optimization. Include tow resistance, running trim and sinkage versus speed and crew load to calibrate dynamic lift. Maintain RL observations, actions, repeatable scoring and baseline-controller comparisons.
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
- [x] Fade the refracted seabed and caustic patch into open water and reduce both jib traveler cleats.
- [x] Synchronize incident waves, weather settings and gust advection across peers and preserve phase through leader changes.
- [x] Exchange the integrated catamaran’s submerged hull sections and drive nearby peer waves and hull loads in Modelica.
- [ ] Restore earlier wake trails for late joiners, support the split-model sloop, and benchmark multiplayer wakes on phones.
- [x] Ship Low, Balanced and High rendering settings, default Low on touch phones, and benchmark draw time independently of simulated time.
- [ ] Verify sustained frame pacing on physical phones and reduce the CPU cost of the integrated FMU. Defer enhanced wake shading while frame pacing takes priority.
- [x] Suspend the unoccupied manual submarine’s imager when sailing or flying manually. Preserve acoustic and inertial navigation and restore visual observations for the selected submarine and both autopilots.
- [x] Smooth the displayed hull and aircraft poses between asynchronous physics snapshots and measure frame-to-frame motion in the sailing and FPV views.
- [x] Skip wreck and seabed contact lookup when the submarine is outside both expanded bounds. Verify all 165 solids against the previous force and moment function.
