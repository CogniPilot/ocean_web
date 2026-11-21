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

### Sea presets

The coupled vehicles use one directional JONSWAP wind sea and a separate long swell. Modelica normalizes the sampled FFT energy to the wind-wave height in the table. The swell uses finite-depth dispersion at the nominal 13.7 m depth. Its 185 m wavelength is about 36 Hobie hull lengths. The separate 1 m grid retains the hull displacement waves and drops its duplicate wind-sea spectrum. Low disables hull forcing in the wake solver. [JONSWAP field measurements](https://repository.tudelft.nl/record/uuid:f204e188-13b9-49d8-a6dc-4fb7c20562fc)

| Preset at 11 m/s wind | Wind-sea significant height | Wind-sea peak period | Swell height, crest to trough |
| --- | ---: | ---: | ---: |
| Calm | 0.08 m | 2.3 s | 0 m |
| Swell | 0.62 m | 3.65 s | 0.44 m |
| Steep swell | 1.15 m | 4.8 s | 0.96 m |

The renderer uses the measured wind-speed dependence of open-ocean whitecap coverage as a density control and gates foam by crest elevation and slope. Sheltered Calm water can remain clear with wind across it. The shader's whitecaps are optical. Modelica still supplies all water loads. [Monahan and O'Muircheartaigh whitecap observations](https://journals.ametsoc.org/abstract/journals/phoc/10/12/1520-0485_1980_010_2094_opldoo_2_0_co_2.xml)

In the sailing component, a variant that branched inside the multi-output wake function spent about 177 ms on an ordinary 100 ms wave boundary. The released-style kernel with a zero duplicate wind input reduced that median to 33 ms in a separate warmed run. The latter averaged 9.19 ms per 10 ms integration step. High rendered at 60.1 FPS and 1.00× simulation speed over the short RTX 3090 Chromium comparison. The retained wake clock runs at 10 Hz. The wind-sea clock runs at 5 Hz. The renderer blends from the currently displayed field between results.

### Automatic Hobie travelers

Auto trim blends between wind-dependent upwind limits and the outboard downwind settings. At 3 m/s, the modeled solo boat centers the main and brings the jib cars to their inboard stops. At 8 m/s the main shifts about 17 cm and the jib moves about 11 cm from its inboard stop. A 15 m/s gust moves the main about 49 cm with the automatic main sheet at its block-to-block command. A higher represented crew mass delays the same depowering. [Gavin Colby's Hobie 16 tuning guide](https://media.hobie.com/digital_assets/hobie-16-tuning-guide.pdf) · [Wally Myers's Hobie University guide](https://hobieclass.com/archive.hobieclass.com/site/hobie/ihca/downloads/hobieu/HobieU.pdf)

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

The Hobie’s asymmetric hulls supply lateral resistance. Their wetted surfaces already contribute skin friction and a viscous form factor. An additional zero-incidence foil drag term on each hull counted profile resistance twice. The corrected model applies the separate profile term to the two rudders and retains hull lift, induced drag and crossflow drag.

| Flat-water trial, starting from rest | Speed at 5 s, before → after | Mean speed over final 30 s, before → after |
| --- | ---: | ---: |
| 20 kn wind, 130° true wind angle, 0.06 m payout | 11.09 → 11.94 kn | 11.98 → 13.40 kn |
| 21.4 kn wind, 130°, 0.06 m payout | 11.88 → 12.84 kn | 12.71 → 14.24 kn |
| 21.4 kn wind, 75°, initial 0.12 m payout | 6.73 → 7.11 kn | 7.37 → 8.16 kn |

The respective broad-reach peaks after the correction were 13.46 kn and 14.31 kn. The strongest real-world run described below was faster. These trials measure a change in the modeled force balance. Establishing absolute accuracy requires matched on-water data.

The coupled sailing world also ran the race launch with manual helm, neutral rudder, initial sheets, Calm sea and wakes disabled. Starting at 4.67 kn, through-water speed after 5, 10 and 15 simulated seconds changed from 6.38, 6.87 and 8.83 kn to 6.58, 7.85 and 10.24 kn. Both runs used the same wind field and initial conditions.

### Baseline before the hull drag correction

Run `node scripts/profile-hobie-speed.mjs 11 auto` and `node scripts/profile-hobie-speed.mjs 11 .06` at revision `1327a21` to repeat the baseline open-water measurement. Each heading starts from rest, with 11 m/s true wind, zero current and a flat surface. The speed column averages the last 30 seconds of a 90-second run. Sampling uses simulation time, independently of browser frame rate.

| True wind angle | Automatic trim | Manual 0.06 m payout |
| --- | ---: | ---: |
| 60° | 3.26 kn | 6.34 kn |
| 90° | 7.04 kn | 10.53 kn |
| 110° | 9.05 kn | 12.15 kn |
| 130° | 10.11 kn | 12.71 kn |
| 150° | 11.09 kn | 12.30 kn |

At 60°, tighter trim raised mean forward sail force from 24 N to 83 N. At 90° it raised drive from 108 N to 214 N. The best sustained run in these two sweeps was 12.71 kn, with a sampled peak of 12.77 kn. For scale, a racing Hobie 16 averaged 19.14 kn over a timed 380 m run in surf. The organizer gives approximately 20 kn of wind for the speed course. Surf, crew placement and exact sailing angle limit the comparison with these flat-water trials. [Organizer’s event report (PDF)](https://www.jens-hannemann.de/archiv.html?file=files%2FPR%2F2016%2FAugust%2FPM+Hobie+World+Cat+2016+Sylt.pdf) [International Hobie Class Association race report](https://hobieclass.com/denmark-wins-the-hobie-world-cat-2016-on-sylt-and-sets-speed-record/)

The race launch uses the coupled world, including local wind and water. With the manual sheet held at its initial payout and rudder tracking the launch course, a 58° true wind angle gave 3.16 kn after 5 s and 1.94 kn after 15 s. A 75° launch gave 5.19 kn and 6.19 kn respectively from the same 4.67 kn initial speed.

At the initial 0.12 m manual payout, a flat-water start from rest in 11 m/s of wind reached 4.75 kn after five seconds at 60° and 6.73 kn at 75°. Speeds averaged 4.96 and 7.37 kn over the last 30 seconds respectively.

A second sweep at 10.29 m/s (20 kn) covered 110°, 120°, 130°, 140° and 150° with manual payouts of 0.012, 0.06, 0.18 and 0.35 m. The fastest of those 20 runs held 11.98 kn and peaked at 12.04 kn at 130° with 0.06 m payout. That run reached 11.09 kn in five seconds. The model accelerates quickly on this reach and then settles well below the timed surf run. These tests do not isolate a single drag or sail-force coefficient responsible for the difference.

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

### Measuring a phone during a session

Open **Settings → Test frame rate (15 s)** while sailing, flying or surveying. Keep the page visible. The report gives average rendered frames per second, the 95th-percentile interval between frames, simulated seconds per wall second, the performance preset, and the final drawing-buffer dimensions. A real-time factor of 1.00 means the physics advanced one simulated second per elapsed second. The test samples the simulation's existing draw loop locally. Adaptive resolution stays active. To compare devices, use the same vehicle, view, sea, sky and preset.

A tested Low shader shortcut skipped the four-octave foam pattern when crest and shore coverage were below 1e-8. Two fixed-view renders (Day and Storm) matched every tested color byte. In four 15-second SwiftShader runs with mobile viewport emulation, release/candidate/candidate/release p95 frame intervals were 49.2, 48.2, 50.4 and 48.8 ms. The shortcut did not improve sustained frame pacing consistently and was left out of the release.

### Multiplayer wind shadow

The Hobie and pilothouse sloop use nearby peer boat poses and velocities to estimate disturbed air at the receiving rig. Modelica evaluates the deficit along the wind relative to the source boat. It spreads across the flow and decays over a distance scaled by the source rig height. Local sail forces, the cup anemometer and telltales use this wind. The room's weather field retains its shared background wind. This is a reduced-order approximation with assumed coefficients. Sail trim and heel of the source rig are outside this approximation.

Run `node scripts/check-peer-wind.mjs` to test the standalone browser FMUs. With 10 m/s background wind, a stationary catamaran 8 m directly upwind produced 7.81 m/s at the receiving rig. The test checks recovery with distance, crosswind offset, peer velocity, removal of a peer and a change in mainsail force outside collision range.

In a two-tab WebRTC room with launch positions separated by 8 m, the downwind skipper's rig wind fell to 86% of local ambient speed after the peer appeared. The upwind skipper retained full ambient speed during that observation. In a separate solo run, 11,760 sampled vehicle, race and wave values matched the previous sailing FMU exactly.


## Mobile sailing startup

On the Low sailing-only path the first running frame takes priority over constructing marine wildlife. An idle callback with a one-second timeout starts the wildlife work after that frame. Switching to the submarine or drone loads the vehicle-specific modules when needed.

Four cache-disabled localhost runs used Chromium with SwiftShader and a 393 × 852 touch viewport. In release/candidate/candidate/release order, navigation to the first positive simulation time took 2.49, 1.86, 1.97 and 1.98 seconds. In each release run, wildlife requests totaling 1,077,012 decoded bytes began before that frame. In both candidate runs all four requests started afterward and completed during the same session. This shifts startup work while preserving the underwater scene. Timings cover browser emulation on desktop hardware.

### Ray wing animation

The ray has 442 wing vertices. Two relative morph targets now encode the traveling wave. A simulation update writes two weights per wing. This removes the two CPU vertex-normal rebuilds and the position and normal buffer uploads on each update. Three.js can also cull the wings using a bound covering the full stroke.

In a Chromium microbenchmark, 4,000 synchronous visitor updates per run averaged 102–104 µs per update with the old mesh and 0.27–0.48 µs with the morphs. The test isolated the ray before the other animal assets finished loading. Across 40 phases the largest vertex difference was below 0.00000003 m and the largest unit-normal difference was below 0.000014. In five 360 × 240 SwiftShader renders, no pixel differed by more than two intensity levels in any RGB channel. These results measure animation work and image agreement. They do not measure whole-scene frame rate.


### Delayed contact between two skippers

The browser delivers new boat positions to Modelica on the next drawing frame, and clears a departing boat on that frame. The 50 ms race update also checks for stale packets and boats that have separated since spawning together. A solo client skips the peer-traffic read and write.

Run `node scripts/check-delayed-contact.mjs` to replay two compiled Hobies starting 9 m apart on reciprocal headings at 2.4 m/s each. In five simulated seconds, boats sent poses at 10 Hz on independent sender clocks. With no packet delay the first opposing force on each hull appeared at 0.92 s and the minimum center distance was 3.81 m. With 40–210 ms of one-way delay, 14 dropped packets and 26 reordered packets rejected, polling at 50 ms alone reduced minimum distance to 1.11 m. Consuming fresh snapshots at the next 10 ms replay step gave 3.23 m. Peak opposing forces were 2.48 and 2.40 kN, compared with 1.71 kN each in the zero-delay run. These results describe one deterministic head-on encounter. Browser frame cadence and internet transport introduce additional variability.


### Full wreck survey localization

Run `node scripts/prepare-world-runtime.mjs` followed by `node scripts/check-world-survey.mjs --browser-steps --follow` to compare the onboard position estimate with the simulated trajectory at every 5 Hz navigation tick. This run uses the integrated FMU, 10 ms physics steps and the drone autopilot. It completed all 12 stations in 108.8 simulated seconds. The estimator recorded 36 keyframes and one loop closure, with temporal image matches in 543 of 544 samples. Position error was 0.46 m RMS, 0.79 m at the 95th percentile and 0.52 m at the finish. Depth error was 0.077 m RMS. The drone held its 5 m altitude target to 0.24 m RMS and followed the estimated horizontal position to 0.88 m RMS.

On this workstation the physics steps used 182.2 wall seconds and reading the bound outputs used another 0.37 s. Those times give about 0.60× real time for the headless run and exclude Three.js. The packaged browser demo also completed all 12 stations in a phone-sized Chromium viewport with the sonar map and cockpit HUD active. Physical handset throughput remains to be measured.

### Live simulation speed and Low water motion

The status panel reports drawn frames per second and simulated seconds per wall second over successive one-second windows. Pausing keeps the FPS number and marks the clock as paused. The 15-second Settings test still reports the 95th-percentile frame interval.

In one baseline and one candidate run using Low, a 412 × 870 touch viewport and SwiftShader, planar reflection refreshes rose from 6.0 to 11.8 per second. Transmission stayed near 6 per second. Water presentation uniforms changed on 22.4 versus 32.7 frames per second. Final rendering averaged 31.4 versus 33.0 FPS and the simulation ran at 0.90× versus 0.87× real time. The renderer blends the last two sea samples over their observed delivery interval. Physics and the live real-time factor use the committed simulation clock. These short desktop runs measure cadence. Sustained device performance remains unverified.

### What limits real-time speed in the current build

The comparison used the November 21 browser release before switching desktop Hobie launches to the sailing component. The full-world and sailing runs used the same sailing start, calm sea and 11 m/s wind. Physics advanced in 10 ms communication steps. The browser was Chromium with ANGLE Vulkan on an RTX 3090 at 1440 × 900.

| Browser session over 15 wall seconds | FPS | Simulation speed | Worker stepping | Worker input and output |
| --- | ---: | ---: | ---: | ---: |
| Full world, High, sailboat selected | 59.9 | 0.943× | 14.36 s | 0.16 s |
| Sailing component, High | 60.0 | 1.005× | 11.17 s | 0.23 s |
| Full world, Low, wreck survey cockpit | 60.1 | 0.852× | 14.52 s | 0.18 s |

The worker spans and browser timings are concurrent. In the full-world High run, CPU time in Three.js render submission was about 4.78 s across all passes, with 3.11 s of that in reflection and transmission passes. That measures browser CPU work and driver submission. GPU execution time was outside this measurement. The submerged survey skipped both planar passes and still fell below real time. A warmed headless run took 10.73 ms per 10 ms step for the full world on High, versus 7.65 ms with the sailing component on High and 6.58 ms on Low. Including four bound reads each step, the respective throughputs were 0.90×, 1.26× and 1.45×. The interactive browser targets real time and uses the extra capacity to absorb slow updates.

A warmed V8 stack sample on the full-world High run put 55.3% of samples under Rumoca event updates, 44.3% under scheduled discrete work and 33.6% under the integrator. Derivative evaluations accounted for 25.4% of samples. These figures are inclusive. The ordinary step median was 6.43 ms. The median on 100 ms wave boundaries without the 200 ms background update was 32.72 ms. The median on 200 ms boundaries without the wind event was 58.34 ms, even while the sub camera was idle. Camera activation added work at that boundary. Hardware counter sampling with Linux perf also found a large startup cost. In a process-wide capture beginning at launch, one V8 optimizer routine accounted for 67% of sampled user cycles, and the libc move routine accounted for 6.7%. The process-wide capture includes background compilation and should be interpreted separately from the warmed step profile.

To repeat the headless timing, package the page with `scripts/package-pages.sh build/pages --world` and run `node scripts/profile-world.mjs build/pages/world 500` and `node scripts/profile-world.mjs build/pages/sailing 500`. Add `--low` to omit wake forcing or `--camera` to enable simulated camera and SLAM where the submarine is present. On suitable Linux hosts, prefix the command with `perf stat -e cycles,instructions,cache-misses,task-clock --`. Browser users can use the live status readout or the 15-second Settings test. The next large savings are fewer active vehicle equations and less scheduled wave and sonar work. The measurements give CPU utilization on desktop hardware and do not establish physical handset performance.

### Visible crests from the solved hull wake

Balanced and High receive a hull-only elevation grid from the same spectral solver that feeds buoyancy and wave resistance. One inverse FFT yields both the total surface and the hull-only surface by packing their Hermitian spectra into its real and imaginary channels. The renderer shades positive hull-wake crests with a foam approximation. It does not add height or load. Low skips the extra grid and shading. The paired-model comparison of total height, wave loads and boat state differed by less than 1e-12 in normalized units.

### One vehicle plant per tab

The startup picker opens a vehicle-specific compiled component in one physics worker. A room invite opens the same picker for each player. In the shared room, vehicle poses go over WebRTC. The local solver consumes peer inputs for sailboat contact, wind shadow, and drone landings. Only a submarine tab runs the navigation sensor sampling and SLAM. The explicit `?runtime=world` development route still runs the coupled model.

Run `node scripts/profile-vehicles.mjs build/pages` against a packaged site to check the included plants and measure solver throughput. This test runs 600 fixed 10 ms steps after 100 warmup steps, with wakes enabled and an active survey camera in the dedicated submarine. It excludes renderer and network time.

### Shared surface coordinates and close wake detail

In a regression with four vehicle types and the coupled component, late starters reevaluated the 64 × 64 directional wave field at the same room time. At five ENU points the maximum discrepancy dropped from 0.445 m to 1.24e-13 m. The test holds weather fixed and isolates the incoming spectral band. The visible and physical wake still depends on the arrival of a peer's displacement samples. Run `node scripts/check-surface-wave-drift.mjs build/pages` and `node scripts/check-peer-wake.mjs build/pages/sailing build/pages/flight` to check both paths.

Balanced and High render two narrow foam trails on the solved ocean using the observed positions and immersion of the stern strips. Each drawn sample is advected by the same surface-current reference as the spectral field. Its appearance fades over 3.6 seconds. The foam is a rendering approximation for entrained air and supplies no force. Bow foam brightens existing positive wake crests beside wet forebody strips. Low skips these passes. The spectral field still supplies the wave height and resistance.

The periodic hull-wave band is blended into the incident sea between radii of 22.4 and 31.36 m around the active physics vehicle. Modelica uses the same cubic smoothstep at surface probes for the anchored objects and the other vehicles in the coupled world. The renderer interpolates the combined and incident-only grids only in this transition band. A test with a distant race launch removed a 1.79 cm periodic wake alias and matched the calculated elevation across all three regions to 5.6e-17 m.

Run `node scripts/check-analytical-waves.mjs build/pages/flight` to compare the wave solution with the finite-depth free-surface Green function on the periodic grid. A known one-cell 0.10 m displacement pulse is supplied through the normal peer source input. The direct analytical Fourier sum applies the modeled damping and excludes the mean and Nyquist modes. Across 3,520 elevation samples at depths of 14 m and 1.5 m, peak elevation was 0.096875 m and maximum absolute disagreement was 5.3e-16 m. This checks dispersion and propagation after a prescribed displacement. Estimating realistic forcing strength and bow wave shape requires a separate comparison with measured wakes.

### Hobie solo loading and rotational inertia

The modeled all-up mass of 206.3 kg includes a 145 kg boat, 60 kg movable crew equivalent and 1.3 kg masthead float. A class-minimum open-racing boat and crew total 274.45 kg. The solo fit keeps the simulation's existing crew arrangement. [International Hobie Class Association rules](https://hobieclass.com/wp-content/uploads/2025/03/R_Book_01042025-rev.1.137.pdf)

The estimated boat mass budget uses two 38 kg hulls, an 18 kg mast, 4 kg boom, 3.9 kg mainsail and 1.2 kg jib. The remaining 41.9 kg covers crossbeams, sidebars, trampoline, rudders, tiller, lines and fittings. Hull and mast figures are typical readings reported by owners. Spar and cloth dimensions inform the boom and sail estimates. [Hull weight reports](https://thebeachcats.com/forums/hobie-16-forum/h16-hull-weight/) · [Mast weight report](https://davidchin38.blogspot.com/2015/09/hobie-cat.html) · [Hobie specifications](https://hobieclass.com/hobie-classes/hobie-16/)

Summing rod and panel approximations with the parallel-axis theorem yields approximately 610 kg m² roll, 715 kg m² pitch and 320 kg m² yaw about the centred solo system's mass centre. Including the float, the previous model used about 280, 385 and 315 kg m². The revised nominal roll and pitch totals are 613 and 718 kg m². A parallel-axis correction increases the appropriate moments as the crew equivalent moves along the trampoline. Dry mass and rudder parameters retain their previous values. The mast bend equation's 6 kg remains an effective modal mass. Measuring physical inertia and water-added inertia remains open.

At a fixed test height, opposite 5.2° pitch tilts changed the buoyant centre from 0.91 m aft to 0.38 m forward of the model origin. At opposite cross-slopes it moved ±0.64 m sideways. The total hydrostatic lift matched seawater density times gravity times the sum of the immersed strip volumes to 1e-12 N. Run `node scripts/check-water-loads.mjs` to repeat the check.

### Near-field bow rise

The Hobie samples a slender-body source distribution from the changing immersed cross-sections of both hulls. Modelica evaluates the linear Bernoulli head at nearby receivers. The worker evaluates the same distribution on an 8 m square with 25 cm spacing for the water surface. The correction tapers to zero at 3.8 m from the boat. The spectral solver carries the propagating wake beyond it. Low disables the correction and the existing hull-wake calculation.

In the 8 m/s launch case, the sailing guest averaged 6.71 m/s during the first 2.4 simulated seconds. Peak combined elevation in the test region outside the bows was 9.6 cm, including 1.2 cm peak elevation from the coarse grid alone. These are simulated crest heights. The physical amplitude still needs comparison with measured Hobie wakes. The committee launch test compares the closed-form solution against independent numerical integration over the source lines.

On a desktop RTX 3090, five seconds in Chromium with wakes enabled gave 60.1 FPS and 1.01 simulated seconds per wall second. The preceding release gave 60.1 FPS and 1.00 in the same test. A phone-sized viewport with touch input selected Low and disabled the bow field.
