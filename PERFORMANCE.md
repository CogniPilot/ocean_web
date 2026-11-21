# Ocean simulator performance

## Published integrated Hobie scene

On November 20, 2026, the deployed world manifest selected `OceanWorld.fmu.f2e68b8f094c95b1.json`. Measurements used an AMD Ryzen 9 5950X development workstation under shared load. The browser run used Chromium with a 393 × 852 CSS pixel touch viewport, device scale factor 2 and SwiftShader software rendering. These figures establish where time goes on this build. Physical Android and iPhone measurements are still needed.

| Measurement | Result |
| --- | ---: |
| Integrated FMU, no renderer, mean wall time per 10 ms of physics | 16.7 ms |
| Median ordinary step | 9.4 ms |
| Median step ending on a 100 ms boundary, excluding 200 ms boundaries | 40.3 ms |
| Median step ending on a 200 ms boundary | 86.2 ms |
| 95th / 99th percentile over all steps | 71.5 / 111.5 ms |
| Read three bound pose outputs, median | 0.25 ms |
| Published page, 180 animation frames, physics running | 29.0 FPS |
| Frame time, median / 95th / 99th percentile | 32.1 / 55.0 / 105.7 ms |
| Frames longer than 50 ms | 16 of 180 |
| Simulated seconds per wall second during rendering | 0.42 |
| Mean WebGL draws per frame, running / paused | 113 / 72 |

The worker benchmark warmed up for 100 steps and measured 300 more. Each timing group includes all work due on its clock boundary. The 10 Hz event includes wake evolution and buoyancy sampling. The 5 Hz boundary also includes submarine perception and navigation. Wind runs at 4 Hz. These overlapping clocks prevent assigning the entire 86.2 ms to sonar or the FFT. A complete 12-station survey independently took 241.1 s to step through 109.6 simulated seconds and 0.49 s to read the requested telemetry.

A V8 sample profile of the published FMU put **61.9%** of samples under the event-update call. Clocked discrete equations accounted for **46.1%** of total samples, including their callees. Zero-initializing event workspace in `calloc` accounted for another **9.0%** of total samples. Algebraic refresh appeared on **34.5%** of sample stacks. Inclusive percentages can overlap. The profiling run used default manual scenario inputs and a separate process from timing.

The published page fell to 42% of real time while still drawing about 29 frames each second. Pausing the model with the camera held still stopped the repeated water captures, raised the rate to 36.4 FPS and lowered p95 to 42.5 ms. This comparison changes physics and capture work together. Reflection and refraction each draw the scene again. The underwater silt uses one points draw for the whole field. It contributes to the visible aliasing, but no measurement identifies it as a major source of stalls.

## Unpublished mooring build

The added mooring and buoy physics exposed a separate compiler problem. Looking up one scalar from a 4,096-element array assignment ran the full generated array program for each singleton. That routine alone accounted for 5,843 of 7,758 samples (75.3%) in a short step profile. A direct-load optimization in Rumoca removed that routine from the leading samples. In a follow-up short profile, **69.6%** of samples still sat under complete algebraic projection. In the 300-step timing test this candidate averaged **68.6 ms per 10 ms step**, before committee-boat collision was added. It is slower than the deployed FMU.

The wind-field optimization is independently measurable. Its standalone median fell from 18.32 to 8.20 ms with identical values across 414,720 comparisons. A faster individual kernel cannot compensate for thousands of scalar projection operations elsewhere.

A candidate renderer also raised the drawing buffer from 275 × 596 in a local baseline run to 412 × 894 in the candidate run and enabled mobile multisampling. That combination with the slower candidate world produced 14.3 FPS. The two builds had different physics, buffer sizes and capture behavior. This comparison does not isolate the cost of multisampling on a phone.

The subsequent integrated committee-contact FMU averaged 74.0 ms per 10 ms step with the boats initially separated, over 100 measured ticks after warmup. A separate glancing-impact run produced a 2.40 kN peak, exactly opposite force vectors, 5.1 cm of launch displacement and 0.31 degrees of launch yaw in half a simulated second. Contact uses MultiBodyLie's sphere–box and paired-wrench routines inside the guest. Its distance check skips shape pairs when boats are far apart. The timings come from different runs and cannot establish the incremental cost of collision detection.

## Event-history allocation experiment

Two builds of the same integrated mast model differed in when Rumoca allocated event iteration history. On the development workstation, twenty alternating batches of ten 10 ms steps took 3.462 s with immediate allocation and 3.369 s with deferred allocation after warmup. The median batch took 164.3 and 156.5 ms respectively. Forty-two scalar observations, including mast and wave outputs, matched exactly at each of 25 batch boundaries while the rudder and mainsheet inputs varied. This short comparison under shared build load indicates a modest improvement. Both runs still exceeded the 100 ms real-time budget per batch.

## Priorities for real-time phones

1. **Remove unnecessary projection work in Rumoca.** Group exact independent array assignments in schedule order and reuse unchanged discrete wave fields across continuous steps. Preserve dependency ordering, finite-value checks, event semantics and each hull's water samples. Compare force histories, capsize recovery and navigation trajectories before shipping.
2. **Reduce event spikes.** Reuse per-instance event workspace or allocate it only when relation iteration requires history. Profile the coincident wave and perception work with identical physics inputs after compiler changes. A 100 Hz model needs a mean under 10 ms per step with headroom for the browser.
3. **Budget the water passes separately.** Keep helm and camera display updates independent from reflection and refraction refreshes. Tune capture sizes and refresh rate before increasing the entire canvas's pixel count. Measure frame-time tails and input response alongside FPS.
4. **Measure sustained hardware performance.** On physical iOS Safari and Android Chrome, run at least five minutes each in the start area, over the wreck, and during a capsize. Record device, browser, drawing buffer size, real-time factor, median/p95/p99 frame time and input-to-visible-response latency. A proposed first target is sustained 1× simulation speed with p95 at or below 33 ms for a 30 FPS mobile tier. Thermal behavior and onboard sensor cadence are part of that check.

Run `node scripts/prepare-world-runtime.mjs build/world-runtime viewer/fmi3/OceanWorld.fmu` and then `node scripts/profile-world.mjs build/world-runtime` to repeat the isolated test. Pass a different prepared runtime and tick count as arguments for matched comparisons.

## Worker scheduling in the sailing browser

In four alternating Chromium runs (original, queued, queued, original), the same world manifest `OceanWorld.fmu.2d1d02144991263f.json` advanced at 0.50× and 0.49× real time with dispatch on animation frames. Keeping up to five pending 10 ms ticks and sending them when the worker completes its previous batch produced 0.59× and 0.61×. Running frame rates were 31.2 and 31.2 FPS for the original scheduler and 29.8 and 29.1 FPS for the queued scheduler. Each sample covered 180 rendered frames using a 393 × 852 touch viewport and SwiftShader on the development workstation under shared load. This measures the trade between simulation throughput and drawing throughput on that machine. Physical-phone and sustained thermal measurements remain open.

## Hull-generated wake on a fast reach

A standalone Node/WASM tow at 6 m/s, with both pontoons immersed, took 21.0 ms median and 24.0 ms p95 per 100 ms advance on the development workstation under shared load. This excludes rendering and uses 100 timed advances after 40 warmup advances. The integrated FMU and phone timings require separate measurements.

The existing 64 m periodic spectral field has 1 m sampling and six displaced-volume strips per hull. At 6 m/s the source moves 0.6 m per update. For near-bow detail, prototype a current-relative local patch with finer resolution, forced by actual strip immersion and pressure including dynamic lift. Split the short and long wavelength sources and integrate their reaction on the hull once. Use the existing spectral field for the long waves. For a 0.15 m near grid at 6 m/s, deposit along the swept strip path or substep the source to avoid skipping four cells. Use absorbing boundaries and check the periodic far field for wraparound. Compare wake height, wavelength, resistance and runtime for single-hull flight, two immersed hulls, turns, and stopping.

## Island collision cost

On a desktop Node/WASM run under shared load, the standalone Hobie advanced 200 ten-millisecond steps from each launch position. The table omits 20 warmup steps. Both versions reached the same final east coordinate in every case.

| Scenario | Previous median / p95 (ms) | Revised median / p95 (ms) |
| --- | ---: | ---: |
| Offshore | 3.15 / 3.91 | 3.24 / 3.87 |
| Approaching beach | 48.83 / 56.47 | 7.20 / 10.95 |
| Approaching boulders | 57.04 / 71.51 | 15.31 / 18.98 |

A separate compiled Modelica contact benchmark exercised 1,000 positions and headings per scenario across offshore, approach, boulder and beach regions. All six wrench components agreed to within 1e-6. Broad-phase filtering now rejects distant boulders once per vessel evaluation, and the convex face test stops when the rock cannot improve the deepest contact. The boulder case still exceeded the 10 ms simulation step budget on this host. These results exclude rendering and other FMU subsystems.

## Does optimizing the hull spectrum speed up the full world?

An experimental solver reused conjugate hull-displacement coefficients. On the development workstation, the standalone median fell from 20.78 to 18.82 ms per wave update, with identical results across 393,792 comparisons. The coupled simulation showed no material throughput gain. In four paired runs with the initialization order reversed between runs, the original took 40.59 s and the experiment took 40.55 s for 24 simulated seconds each. The experiment branch contains the implementation and the repeatable standalone benchmark. [Conjugate wake experiment](https://github.com/CogniPilot/ocean_web/tree/perf/conjugate-wake-rows)

In a separate trial on the released component, changing the FMI communication step from 10 to 20 ms gave median wall times of 172 and 170 ms per 100 simulated ms respectively over 20 measured batches. The result does not support changing the browser clock for performance. Both measurements exclude rendering and network traffic.

## Cost of approaching the island

The released `9a3a47043dcc6627` world ran three 1.8 s launches on the same workstation, each heading east at 2 m/s with manual control. The first 30 of 180 steps warmed the solver. The remaining 150 supplied the timings. Contact counts and peak forces cover all 180 steps. This benchmark excludes rendering.

| Starting east, north (m) | Steps with shore force | Peak shore force | Mean per 10 ms step | Median | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| −8, −7 | 0 | 0 kN | 18.6 ms | 8.1 ms | 77.3 ms |
| 11, 40 | 47 | 9.6 kN | 33.7 ms | 18.2 ms | 121.7 ms |
| 18.5, 40 | 180 | 18.2 kN | 96.3 ms | 50.6 ms | 361.9 ms |

Sustained contact cost about five times as much as the offshore trajectory. The comparison includes both geometric contact evaluation and the integration of the resulting forces. It cannot assign that difference to a single collision routine.

## Nearby multiplayer wakes

Two Chromium windows joined one WebRTC room as a boat and a drone. The drone received advancing hull samples, and switching the sender to submarine cleared its source. Each sample carries 148 bytes before transport overhead, or 1.48 kB per receiving peer per simulated second at 10 Hz.

Three independent FMUs tested a real catamaran source replayed 3 m east and 1 m north of a second boat against a quiet control. The maximum surface difference reached 2.85 cm, and the receiving hull sections saw up to 2.30 cm. Existing waves continued after the sender left.

On the development workstation, after 100 warm-up steps, 400 interleaved steps averaged 15.53 ms per 10 ms step on the preceding release and 16.33 ms on the candidate with no peers. A separate comparison on the same candidate averaged 14.47 ms with no source and 15.18 ms with one moving source. Median 200 ms events took 76.41 and 82.23 ms respectively. The tests measured physics alone. Physical phone frame times and multi-peer scaling remain open.

## Mobile rendering presets

Low defaults on devices with a coarse primary pointer. Settings can override it, and the browser remembers the selection. Low uses an 88 × 88 water grid and interpolates the Modelica surface slope from its vertices. It refreshes 192 × 120 reflection and transmission targets at most once per 150 ms, halves the sky-map dimensions, and skips the underwater caustic pass while the camera is above water. The adaptive drawing-buffer ratio ranges from 0.5 to 0.75. High uses a 144 × 144 water grid, per-pixel slope and 512 × 320 captures. All presets run the same FMU.

A 393 × 852 touch viewport in Chromium with SwiftShader recorded 180 running frames per configuration on the workstation. The previous mobile default averaged 31.8 FPS with a 43.2 ms p95 frame. Low averaged 53.2 FPS with a 24.0 ms p95. Offscreen framebuffer binds fell from 0.75 to 0.24 per frame. Physics advanced at 0.49× and 0.40× real time in those runs. These are renderer measurements under shared CPU load, with physical phone performance still unmeasured.

### Submarine imager when sailing

The coupled world samples the DVL, pressure, inertial instruments and all acoustic fans at 5 Hz in every vehicle view. With both the submarine and aircraft in manual mode, selecting another vehicle suspends the 864 camera rays, pixel synthesis and visual feature matching. Selecting the submarine or engaging either survey autopilot enables the imager on the next sensor tick. The headless FMU defaults to full sensing.

A workstation comparison interleaved three WASM sessions over 400 measured 10 ms steps after 100 warm-up steps each. Median steps ending on a 200 ms sensor boundary took 76.8 ms on the previous release, 61.2 ms with the camera idle and 78.5 ms with full sensing on the new release. The corresponding mean across all steps was 15.20, 14.67 and 15.49 ms. Disabling the imager helps the longest steps during manual sailing, while the mean still exceeds the real-time budget.

### Movement between worker updates

A cache-disabled Chromium touch viewport (393 × 852, SwiftShader) rendered 181 sampled frames per sailing run. With the previous renderer, the hull repeated exactly the same position on 144 and 149 of 180 frame transitions at 48 FPS. Sampling position and orientation between committed worker poses reduced repeats to 16 of 180 at 50 FPS. The maximum visible position change in that run was 9.2 cm, compared with 14.4 and 11.9 cm in the baseline runs. Pausing stabilized both the boat and its camera. In a separate drone FPV run the aircraft altitude changed on 158 of 180 transitions. These are display measurements. The interpolation can trail the latest solved pose by up to one interpolation interval (capped at 160 ms). Vehicle contacts, sensors, network packets and mast captures continue to use committed physics states.

### Submarine collision lookup during sailing

A 300-step sampling profile with the survey camera idle found 253 of 3,748 samples inside the submarine's structure-contact routine. Its launch position is outside the wreck and above the seabed. The Modelica function now first compares the submarine position to two expanded bounding boxes, one for the wreck and one for the seabed. Both use the original narrow-phase guard margin. The geometry generator derives the bounds from the same rounded collision solids used by the solver. The candidate profile counted 4 of 3,612 samples in that routine.

Two interleaved WASM runs each measured 400 steps after 100 warm-up steps per model. With the previous release first, mean time per 10 ms step was 14.58 ms versus 14.30 ms with the bounds. With initialization order reversed, means were 16.39 ms versus 13.18 ms. Variability under shared workstation load limits the precision of the timing gain.

An independent OpenModelica comparison evaluated the old and new force and moment functions at 5,940 positions across the six faces of all 165 oriented collision solids, with six offsets, varying hull yaw and nonzero linear and angular velocity. Forces and moments matched exactly, including 4,115 positions with nonzero contact force.

### Low preset with hull wakes disabled

Low skips the local and received hull displacement spectrum and associated wave resistance. The Modelica solver still computes the directional wind sea, swell, water heights at the hull sections and buoyancy. The boat continues publishing its immersed sections so peers using Balanced or High can see its wake. Switching to a higher preset starts a fresh wake history on the next spectral sample.

Two workstation WASM benchmarks interleaved the previous release and both wake settings on the new release, alternating execution order and reversing session initialization for the second run. Each session warmed up for 100 steps and measured 400 steps of 10 ms. Median wave-only event steps fell from 32.5 and 33.5 ms on the previous release to 20.5 and 19.6 ms on Low. With wakes enabled they took 32.8 and 31.9 ms. Low averaged 12.24 and 11.20 ms across all steps. The 200 ms sensor events still took 55.1 and 50.4 ms on Low.

A 393 × 852 touch viewport in Chromium using SwiftShader selected Low on a fresh origin. Across 180 running frames it averaged 48.4 FPS with a 25.9 ms p95 frame and advanced 0.525 simulated seconds per wall second. Physical handset timing remains unmeasured.

### Time to first motion

The viewer starts loading vehicle meshes alongside the integrated world and prepares the renderer and shoreline before awaiting both. When the tide is at or above mean sea level, the planar reflection pass can skip the submerged wreck, seabed and animals. The transmission pass still draws these objects.

In a cache-disabled Chromium touch viewport (393 × 852, SwiftShader, localhost), two candidate launches first reported positive simulation time at 2.821 and 2.822 seconds. The interleaved previous release took 2.934 seconds. The first catamaran hull request began at 157–160 ms on the candidate and 735 ms on the previous release. In a paired render of the same orbit view, all 23,040 pixels in the Low reflection target matched with submerged scenery included and excluded.

### Wind update cost on Low

The generated kernel carried the entire 48 × 48 × 3 output array through a nested loop that assigned three entries at a time. Expressing the Modelica field as a map of independent cells lets Rumoca emit a contiguous three-value output per cell. A standalone WASM comparison across 80 changing-wind updates returned identical fields, including the roughness channel. Median update time fell from 13.9 to 4.1 ms after eight warm-up updates.

Two interleaved coupled-world Low benchmarks measured 400 steps per model after 100 warm-up steps, reversing initialization order on the second run. Median steps with a wind event alone fell from 29.4 and 29.7 ms to 9.2 and 8.8 ms. Across all steps the respective means changed from 12.36 to 12.33 ms and from 13.19 to 11.33 ms. The compiled worlds returned identical values on 55,344 comparisons of wind fields, boat position and local boat and drone wind. Combined wave and sensor events remain the largest stalls.

### Fish school rendering

WebGL 2 draws the 34-member school with one instanced mesh. Each fish keeps its own transform and phase offset. Its vertex shader blends two adjacent frames of the shared morph texture for both position and surface normal. WebGL 1 retains individual meshes. A fixed bounding sphere encloses every swim path, so the renderer can cull the entire school.

Four 512 × 256 orthographic comparison renders captured poses at 0, 0.29, 1.125 and 7.9 seconds. All color channels matched the individual meshes exactly and the isolated school went from 34 draws to one. In four cache-disabled submarine orbit runs in Chromium (393 × 852 touch viewport, SwiftShader, Low), each sampled over 180 running frames, average scene draw calls were 128.6, 107.1, 107.2 and 128.2 in the order release, candidate, candidate, release. Frame rates were 39.2, 41.9, 42.5 and 43.8 FPS. Measured p95 frame times were 36.6, 32.3, 33.2 and 33.5 ms. Throughput varied between runs.

### Shoreline rocks

All 46 rock transforms and tints share one static instanced draw on supported devices. Three 512 × 256 shoreline views took 46, 46 and 28 rock draws before batching and one each afterward. No RGB channel differed by more than two levels. Regenerating the Modelica collision planes produced identical source. WebGL 1 devices without instancing draw individual meshes.

Four cache-disabled Chromium runs (393 × 852 touch viewport, SwiftShader, Low, 180 running frames each) measured 47.6, 43.3, 44.0 and 41.7 FPS in release/candidate/candidate/release order for the default sailing view. Adaptive drawing-buffer width ranged from 255 to 294 pixels. This run did not establish a general frame-rate improvement or measure physical phone performance.

### Solo page startup

The default Hobie page defers the sloop hull and peer transport until multiplayer starts, removing two requests totaling 345,827 uncompressed bytes from solo loading. The sloop similarly defers 221,207 bytes. Both hulls and the transport are ready before a room accepts snapshots.

Chromium touch emulation with cold page caches, SwiftShader, 80 ms request latency and a 10 Mbps page download limit reported the first positive simulation time at 3.87, 3.51, 3.47 and 3.53 seconds (release, candidate, candidate, release). This emulation applies to the page target. It does not reproduce a physical phone or a network-wide throttle. Both boat selections also passed solo startup, immediate cancellation of a pending join, subsequent room entry and room exit.

### Collapsed submarine sensors

A folded onboard sensor panel no longer subscribes to image and feature arrays or paints the 180 × 120 preview. Submarine navigation still acquires and processes its observations. A Chromium touch test opened the wreck demo and alternated closed/open twice on each runtime. Each 1.3-second closed measurement recorded zero preview payloads and zero sensor canvas uploads. Open measurements recorded five to seven payloads. The estimate continued reporting feature matches and keyframes throughout. This measures avoided display work, not total frame rate.

### Vehicle-selected SLAM

Selecting the submarine enables its onboard camera, sonar registration, keyframe creation and loop closure. Selecting the sailboat or drone preserves the existing map and continues dead reckoning from pressure, inertial and four Doppler velocity log beams. Submarine autopilot retains obstacle ranges while deselected. Opening or folding the sensor display only changes preview transfers.

The generated wreck ray hierarchy now chooses splits by child surface area and plate count. Across 50,000 seeded test rays, bounds tests fell from 902,547 to 414,427 and exact plate tests fell from 164,725 to 119,099. All first-return ranges matched. The standalone browser navigation FMU took 4.29 ms per acquisition versus 6.03 ms previously on a workstation trajectory through the wreck. All 1,770,480 compared camera, sonar, estimate, feature and keyframe values matched.

Two interleaved Low runs of the integrated FMU placed the median step at the 200 ms event near 50–51 ms with the new build versus 53 ms previously. The mean across all ticks improved in one trial and regressed in the other. The wave event remains a bottleneck.

## Hobie acceleration and sailing speed

Run `node scripts/profile-hobie-speed.mjs 11 auto` and `node scripts/profile-hobie-speed.mjs 11 .06` to repeat the open-water measurement. Each heading starts from rest, with 11 m/s true wind, zero current and a flat surface. The speed column averages the last 30 seconds of a 90-second run. Sampling uses simulation time, independently of browser frame rate.

| True wind angle | Automatic trim | Manual 0.06 m payout |
| --- | ---: | ---: |
| 60° | 3.26 kn | 6.34 kn |
| 90° | 7.04 kn | 10.53 kn |
| 110° | 9.05 kn | 12.15 kn |
| 130° | 10.11 kn | 12.71 kn |
| 150° | 11.09 kn | 12.30 kn |

At 60°, tighter trim raised mean forward sail force from 24 N to 83 N. At 90° it raised drive from 108 N to 214 N. The best sustained run in these two sweeps was 12.71 kn, with a sampled peak of 12.77 kn. For scale, a racing Hobie 16 averaged 19.14 kn over a timed 380 m run in surf. The report gives no wind measurement for that run, so it provides a real-world reference rather than a matched calibration point. [International Hobie Class Association race report](https://hobieclass.com/denmark-wins-the-hobie-world-cat-2016-on-sylt-and-sets-speed-record/)

The race launch uses the coupled world, including local wind and water. With the manual sheet held at its initial payout and rudder tracking the launch course, a 58° true wind angle gave 3.16 kn after 5 s and 1.94 kn after 15 s. A 75° launch gave 5.19 kn and 6.19 kn respectively from the same 4.67 kn initial speed.

### Hobie deck hardware at sailing distance

Three.js uses the full mainsheet blocks and jib cleats close to the camera. Beyond 4 m it uses a single vertex-coloured mesh per fitting. Distance selection runs separately for each camera. With the same boat and an 800 × 600 render target, a 14 m orbit view went from 85 draws and 17,856 triangles to 73 draws and 6,864 triangles. Three pixels differed by more than two intensity levels in any RGB channel. A 0.25 m view of the lower block returned identical pixels and triangle counts.

Four cache-disabled Chromium runs used a 393 × 852 touch viewport, Low quality, and SwiftShader. Each measured 180 running frames after warmup. In release/candidate/candidate/release order the rates were 35.9, 37.6, 39.2 and 35.0 FPS. The corresponding 95th-percentile frame times were 54.7, 72.6, 60.2 and 102.9 ms. The renderer improvement leaves significant frame stalls and these timings do not measure a physical handset.

## Sailing-only Modelica world

On a multiplayer room link, a Hobie skipper loads a component built from the same race equations as the three-vehicle world. This removes the submarine plant, estimator, drone and their local ocean probes from the physics step. The race committee, marks, boat contact inputs, gusts, shared sea clock and 64 × 64 hull wake solver remain in the component. Build with `scripts/build-ocean-world.sh OceanSailing`. Compare packaged components with `node scripts/check-sailing-world.mjs build/pages/world build/pages/sailing`.

A six-second A/B run switched wakes from off to on, applied helm and sheet commands, and injected contact with another hull. The 11,760 compared outputs included sail forces, poses, race data and wave heights. The largest difference divided by one plus the absolute reference magnitude was 3.4 × 10⁻¹¹ or less. Peak measured peer contact exceeded 4.5 kN and peak axial wave load exceeded 38 N. Excluding the first second, the full world averaged 14.14 ms per 10 ms tick and the sailing component averaged 8.34 ms in this mixed-wake workload.

In a separate 12-second Low-preset run of the full world in Chromium on an RTX 3090, the worker spent 10.18 s stepping the FMU, 0.18 s reading outputs and writing inputs combined, and advanced 11.81 simulated seconds. Enlarging the browser catch-up reserve from 100 to 300 ms recovered under 0.1 s per 12 s run in two interleaved comparisons. The released page uses the original reserve.

Four 15-second Low-preset browser runs on the RTX 3090 used the same 393 × 852 touch viewport and alternated full, sailing, sailing, full. Rendering averaged 60 FPS in all four. The sailing component kept pace with wall time (1.000× and 1.001×), compared with 0.986× and 0.986× for the full world. These are desktop hardware measurements.

### Multiplayer wake source transfers

The sailing worker reads the twelve hull-strip positions and immersed volumes when the Modelica wave sample changes and another player wants wakes. In a Chromium worker comparison, 95 consecutive 10 ms steps included 60 subscribed steps across two intervals. The worker transferred 2,304 bytes of strip data in eight reads, compared with 27,360 bytes across 95 reads previously. All 2,160 subscribed scalar observations matched the continuous readout, including the first step after each subscription. These byte counts cover hull source strips only.

### Cost of drawing the ocean on Low

A Chromium sailing session used SwiftShader, a 393 × 852 touch viewport, the Low preset and the dedicated sailing FMU. Diagnostic runs kept the simulation advancing while selectively omitting GPU work. At a 294 × 639 drawing-buffer size, two normal 3.5-second windows gave 26.4 and 28.9 ms p95 frame intervals. Skipping both planar captures gave 22.0 and 25.8 ms. Hiding the water surface in the final scene draw gave 20.4 ms in the one omitted-surface window that matched that resolution. The camera followed the moving boat, so scene composition varied. SwiftShader shares the host CPU with the simulation worker. These timings do not predict physical handset GPU throughput.

The planar reflection and transmission passes usually run together on Low. A candidate kept both and moved transmission to the following frame, using the camera matrix from each corresponding capture. Four 15-second runs used release, candidate, candidate, release order and normal adaptive resolution.

| Build | FPS | p95 frame interval | Simulated seconds per wall second |
| --- | ---: | ---: | ---: |
| Release | 37.4 | 40.1 ms | 0.90 |
| Staggered | 40.0 | 51.4 ms | 0.92 |
| Staggered | 39.3 | 54.4 ms | 0.90 |
| Release | 38.8 | 39.2 ms | 0.93 |

The release keeps the passes together. Staggering increased the long frame intervals despite slightly higher average FPS. The isolation trials point toward reducing the cost of each ocean draw as the next experiment.
