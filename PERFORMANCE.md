# Ocean simulator performance

## Desktop simulation headroom

In an offline vehicle, open **Settings** and choose **Test simulation headroom (15 s)**. The test advances the vehicle as quickly as possible and includes wildlife throughput when the session has wildlife. With wildlife active, the result uses the slower clock. The regular frame-rate test keeps normal pacing. Changing quality, pausing or hiding the tab interrupts the measurement.

The requested desktop targets are 20× on Low, 10× on Medium and 5× on High, with a 10× High target for the Hobie 16. With 10 ms physics steps, these correspond to average wall-time budgets of 0.5, 1 and 2 ms per advance. Field updates, readbacks and other work due at lower frequencies also count. A run at 60 FPS can still miss all three targets.

A 1024 × 650 Chromium run used hardware Vulkan rendering on the workstation’s RTX 3090 and Ryzen 9 5950X, at device scale 1. The sea was set to Swell. Both the whale and shark were active. Values below are measured simulated seconds per wall second. Each row used consecutive Low, Medium and High samples, so these runs sampled different points along the trajectories. Other builds were running on the workstation.

| Scene | Low | Medium | High |
| --- | ---: | ---: | ---: |
| Hobie, prior to the final shore/hull/sea builds | 1.25× | 1.12× | 1.11× |
| Cruiser, twelve-strip hydrostatics and optimized incident sea | 4.97× | 3.10× | 3.06× |

Both scenes rendered at approximately 59–60 FPS in these runs. These are workstation results. Sustained physical-phone throughput, input latency and thermal behavior still need device tests.

An isolated paired wildlife test compared 16,500 outputs in open water, at the island, and near the seabed. Conservative flat-bottom bounds preserved those values exactly and increased open-water throughput from 19.88× to 21.67×. Four hundred 12,288-element swimmer wake field readbacks took 225–263 ms when converted to new JavaScript arrays and 8–10 ms when copied into reusable typed storage. The checked wet field was bit-identical. Neither isolated measurement includes the complete vehicle, harbor and rendering workload.

## Fast rendering preset

Fast shades the Modelica sea surface with the sky map and skips both planar water captures. It uses a 48 × 48 water grid, a drawing-buffer ratio between 0.40 and 0.60, and four volume samples per pixel for the submarine lamp. Low remains the default on touch devices. The existing Low and Fast presets both disable hull wakes.

Four six-second samples in Chromium with SwiftShader used a 393 × 852 touch viewport and device scale factor 2. The Hobie ran the same FMU in Swell in all four runs. In alternating Low, Fast, Fast, Low order, the browser recorded 29.8, 54.2, 56.6 and 27.2 FPS. The corresponding p95 frame intervals were 44.2, 26.9, 27.3 and 59.0 ms. Fast eliminated approximately 54–60 planar capture renders per second. Physics advanced at 0.88–0.91 simulated seconds per wall second across these runs. A physical phone measurement is still needed.

The packaged worker now skips the zero-filled 64 × 64 wake grid in Low and Fast. At ten updates per simulated second this removes 320 KiB/s of worker messages and 160 KiB/s of texture uploads during steady rendering. The incoming sea tile still updates. Selecting Balanced or High resumes the wake grid on the next worker reply.

With the cruiser and coastal wildlife active, four six-second Chromium samples in the same phone viewport ran in Low, Fast, Fast, Low order. They recorded 18.2, 28.3, 26.2 and 17.3 FPS and p95 frame intervals of 139.1, 93.5, 88.4 and 141.8 ms. The simulation advanced at 0.95–1.02× real time. Fast removed approximately 19–21 planar renders per second in this scene.

A second change uses single-scale foam detail in Fast and evaluates additional wildlife foam detail only where the wake has foam. Four Fast samples in reference, candidate, candidate, reference order ran at 26.6, 28.7, 25.6 and 19.3 FPS. Their p95 frame intervals were 79.8, 79.7, 61.4 and 134.2 ms. Frame timing varied with the shared workstation load.

Solo launches now start with an empty wildlife roster. The cruiser opens without fetching swimmer or gull models, their wake solver or the harbor worker. Four six-second Fast samples in the same phone viewport compared the former default and solo launch in alternating order. They recorded 27.5, 44.4, 42.3 and 27.3 FPS. The corresponding p95 frame intervals were 51.5, 27.9, 29.9 and 75.2 ms. The adaptive drawing buffer grew from 157 × 340 to 216 × 468 in the solo runs. The simulation advanced at approximately real time in all four runs.

### Hobie solver work in Swell

The incident sea skips modes whose directional energy is zero. Rumoca saves only the coordinates written by direct assignment plans that lack a projection fallback. In the Hobie derivative plan, that reduced each backup from 10,681 doubles to 644. The compiler also reuses small pure tuple results when their input bytes match. The packaged components were rebuilt with `CARGO_PROFILE_RELEASE_OPT_LEVEL=2`.

The existing paired benchmark compared the new Hobie component against `152a0cf` on the Ryzen 9 5950X with Node 22. Three alternating pairs per wake setting each measured 400 fixed 10 ms steps after 200 warmup steps, including a pose read after every step. Median paired step cost fell 9.1% with wakes off and 6.1% with wakes on. Median throughput went from 1.24× to 1.35× real time with wakes off and from 1.03× to 1.10× with wakes on. A separate eight-second replay matched all 410,960 sampled values across changes in wind, sea state, trim, steering and wake settings.


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
| Swell (startup default) | 0.62 m | 3.65 s | 0.44 m |
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

### Pull-request regression check

The Hobie physics performance workflow runs the base and proposed sailing FMUs
on the same Ubuntu runner using Node 22 and identical initial conditions.
It measures 400 ten-millisecond steps after 200 warm-up steps, with a pose
read after every step. Each of the two wake settings gets three sequential
pairs in alternating order. A median candidate/reference cost ratio above
1.25 in either setting fails the check. The 25% margin is an initial noise
allowance. The job summary includes absolute simulation speed and p95 step
time for context. The artifact retains every timing group and the runner CPU.

This measures the packaged WebAssembly physics and FMI calls. GPU rendering,
browser scheduling and mobile performance need separate browser measurements.
For a local comparison of two packaged sailing runtime directories, run
`node scripts/compare-sailing-performance.mjs build/reference build/candidate build/hobie-performance.json`.

### Profiling the sampled race-mark regression

The 10 ms integrated sailing step regressed even in Low with no renderer or
local wake. Linux perf recorded user-space cycles on the Node main thread
with V8 JIT code registrations. The symbol breakdown below uses only the
measurement window after 200 warm-up steps. This excludes startup and the
background V8 optimizing compiler.

| Shipped or experimental configuration | Simulated seconds per wall second | Median physics step | p95 physics step |
| --- | ---: | ---: | ---: |
| Released sailing FMU, wakes off | 1.33 | 4.78 ms | 20.88 ms |
| 100 Hz sampled mark contact and continuous horizontal moorings, wakes off | 0.40 | 21.09 ms | 50.27 ms |

Both runs used 800 measured steps, the standard Hobie launch, 11 m/s wind and
four bound output reads per step. Of 6,018 warm main-thread samples for the
slow build, 17.4% landed in `rmc_isolation`, 12.0% in `rmc_project_complete`,
9.1% in `rmc_project_singleton` and 5.3% in `rmc_project_block`. These are
non-overlapping leaf samples. Holding the contact wrench and updating horizontal
mooring position and velocity on the existing 20 Hz race clock removes these
routines from the leading samples. Hull, bridle and trampoline contact still
apply paired loads to the mark and the boat.

The next A/B exposed a second regression. A wake-disabled early return inside
the large spectral update improved Low, but slowed wakes-on tests to 0.42×
against 1.13× on the same machine. Copying memory accounted for 68% of warm
cycles with wakes on. The loss occurred at the 0.1 s wave update events. The
three-pair benchmark failed the wakes-on case with a 2.68× cost ratio. The
wake-enabled and disabled paths must both be benchmarked after code generation.

After removing that early return and retaining the 20 Hz mooring change,
the final three-pair local comparison measured 1.33× simulation speed with
wakes off and 1.14× with wakes on. The median paired cost ratios were 1.05
and 0.99 against the released FMU. A Low Chromium run advanced 15.04 simulated
seconds in 15 wall seconds at 60 FPS. These timings describe this desktop.

### Collision capability and performance targets

The shared Modelica library has analytic distances and contact normals for
sphere–sphere, sphere–capsule, sphere–box and capsule–capsule pairs. It also
supports plane contacts. Its fixed shape and material tables, collision masks,
paired wrenches and momentum tests are useful foundations. Body pairs iterate
over enabled shape combinations. Box–box, capsule–box and arbitrary convex
pairs are gaps in the current dispatcher. The default response adds individual
Hunt–Crossley forces with regularized sliding friction. The separate
`Optimization.frictionConeQP` has a warm-start input and offers a reference
solver for small contact problems. [Geometry and response](https://github.com/CogniPilot/modelica_models/blob/304c510096d0246dbaedb007f3a653ed11e51068/MultiBodyLie/Collision.mo) · [Friction-cone solver](https://github.com/CogniPilot/modelica_models/blob/304c510096d0246dbaedb007f3a653ed11e51068/Optimization/frictionConeQP.mo)

The Hobie-to-buoy adapter rejects distant marks, tests sampled hull, deck and
wire points against pyramid planes, and holds the paired wrenches between
20 Hz updates. The standalone wreck query instead uses spatial candidate
selection and sphere–box tests for hull and thruster guards. Neither test is a
proxy for general collision-engine performance.

In the integrated Hobie, the centerline, both hull strikes and a 4 m miss
behaved qualitatively as intended at 3.62 m/s. At 26 knots the nominal
displacement per mark update is 0.669 m. Increasing the centerline run-up by
0, 0.17, 0.33 or 0.50 m produced peak forces from 1.12 to 21.40 kN and eastward
contact impulses ranging in magnitude from 67 to 988 N·s. This is a sensitivity
test on a moving boat and buoy. It also changes their state slightly at impact.
Reproduce with `node scripts/check-mark-impact.mjs build/timed-sailing --speed-sweep`.
The range is too wide to infer a calibrated impact load from these runs.

| Priority | Reusable algorithm and where it pays off | Acceptance measurement |
| --- | --- | --- |
| 1. Reliable fast contact | Represent each bridle as a capsule, the buoy as a convex polytope, the trampoline as a thin slab, and the hulls as convex sections. Use a conservative swept bound for translation and rotation. For close fast pairs, find the first time of impact and advance the contact response over the remaining step. | Replay fixed pose trajectories at different sample phases and speeds against dense reference queries. Check missed hits, impact-time error, penetration, and convergence of integrated impulse under timestep refinement. |
| 2. Geometry coverage | Retain analytic primitive pairs. Add box–box separating axes with face clipping, and support-mapped GJK distance/witness queries plus EPA for general convex overlaps. Keep a bounded, stable set of contact points with feature identifiers for broad face contacts. | Test analytic gaps, swapped pairs, grazing edges, nearly parallel faces, deep overlap and degenerate geometry. Compare distance, normal and contact patch on identical shapes with a pinned MuJoCo build. |
| 3. Candidate selection | Keep direct checks for a few marks. For larger fleets compare sweep-and-prune with a dynamic AABB tree. Bake a static bounding-volume hierarchy for compound scenery where it beats the existing wreck candidates. Reuse transformed bounds and buffers. | Count candidate pairs, exact tests and memory copies. Report p50/p95/p99 for separated, grazing and dense scenes as body counts grow. |
| 4. Response under load | Retain calibrated compliant contact for inflatables. Group connected rigid contacts into independent islands and warm-start friction constraints using persistent contact identifiers for difficult multi-contact cases. Evaluate sparse or matrix-free iteration against the existing small dense reference solver. | Test resting support, sliding onset, sustained torque, energy balance, and two-body momentum. Report solver iterations and deadline misses alongside error. |

For speed comparisons, run identical geometry and prescribed poses through
both detectors first. Then benchmark full dynamics with matched masses, timestep,
friction, and comparable compliance. Keep native-to-native and WASM-to-WASM
results separate. The same-runner sailing CI check covers the integrated
application. Its results cannot establish parity with MuJoCo. [MuJoCo collision
pipeline](https://mujoco.readthedocs.io/en/stable/computation/index.html#collision-detection) · [MuJoCo constraint solver](https://mujoco.readthedocs.io/en/stable/computation/index.html#constraint-solver)

#### Native sphere–box reference

The Piccard thruster guards use `MultiBodyLie.Collision.sphereBox` against
oriented wreck boxes. To compare that routine with MuJoCo, run
`tools/collision-benchmark/run.sh /path/to/mujoco-4.0.1` after setting up
the project compiler. Supply the extracted [MuJoCo 4.0.1 SDK](https://github.com/google-deepmind/mujoco/releases/tag/4.0.1).
The fixture calls one Modelica function. The harness calls its Rumoca-generated
native C entry point and MuJoCo's native sphere–box collider on the same
8,192 seeded sphere positions around one rotated box, including embedded
centres, face, edge and corner regions. A generous reporting margin requests
a distance for separated pairs. The midpoint comparison converts the two
Modelica surface witnesses to MuJoCo's world contact midpoint.

On the local x86-64 desktop, the maximum signed-gap error was zero, the
maximum normal-component error was 2.22e-16, and the maximum midpoint-component
error was 6.66e-16 m. Across 31 alternating timed batches of 65,536 calls, the
median batch mean was **39.0 ns/query for Rumoca and 23.4 ns/query for
MuJoCo**. The respective p95 batch means were 40.0 and 24.8 ns/query.
Both loops copy precomputed positions. The measurements exclude broad phase,
integration, friction, allocation of a world and browser execution.

### Hobie solver headroom with swell

At revision `aab8a55`, Linux perf sampled the shipped sailing WebAssembly after 200 warm-up steps. The test ran 1,200 more 10 ms steps with the swell preset, 11 m/s wind and hull wakes enabled. The solver averaged 8.32 ms per step on the development workstation, or 1.17× real time including a pose read. Ordinary steps averaged 4.78 ms. Steps with a wake update averaged 32.62 ms and steps with both wake and background sea updates averaged 46.60 ms, excluding the wind update. The test excludes rendering and browser pacing.

* **Rollback copies.** 28.0% of sampled cycles landed in libc's bulk move and another 3.1% in the WebAssembly copy wrapper. In generated C, each algebraic or derivative refresh saves all 10,681 real slots for failure recovery. Event entry also snapshots a 67,541-double array containing discrete histories. Rumoca can generate rollback ranges from each plan's write set and keep read-only histories out of per-stage copies. Failure and retry tests must exercise nonfinite states and simultaneous clock events.
* **Integrator work between events.** An instrumented native build of the same Modelica source counted 84,448 derivative evaluations and 119,392 refreshes over 1,000 timed steps. The default event scan is 1 ms. In two paired WebAssembly runs, setting a finite 20 s experiment horizon changed the default scan spacing and raised throughput from 1.16–1.20× to 1.44–1.45×. It also changed the trajectory by up to 1.02 m east and 0.31 rad of heading in the first 13 simulated seconds. The live solver retains the original event settings. A compiler experiment should evaluate event indicators on dense integrator output while preserving bracketing and re-integration at actual crossings.
* **Spectral work.** Time the wake update and background spectrum independently of ordinary steps. Cache phase-independent mode coefficients while their wind, depth and preset inputs are constant, then compare the surface, wave loads, rig loads and vessel trajectory against the original run.

A tenfold improvement on this baseline requires approximately 0.86 ms per 10 ms of simulated time, including the pose read. Even eliminating the measured bulk-copy cost entirely would yield about 1.45× speedup. For local reproduction use `node scripts/profile-world.mjs build/pages/sailing 1200 --swell`. CI compares candidate and reference on the same runner.
## Latest browser and vehicle measurements

The viewer caps scene updates and drawing at 30 FPS. In a 393 × 852 touch
viewport, Chromium reported 30 FPS and 1.00× simulation speed on the published
Fast cruiser. The worker still steps the FMU in 10 ms increments.

Shark and whale play now loads a sea and weather component centered on the
swimmer. The previous environment stepped a hidden RDD2. In two Linux perf
captures with wakes omitted, mean environment step and read time fell from
2.36 to 1.48 ms and sampled user CPU cycles fell by 40%. This measurement
covers the environment worker. The swimmer solver runs in its own worker.

The generated solvers now copy contiguous event histories in runs and validate
contiguous array assignments before copying directly into the destination.
The compact wildlife builds also reuse orientation calculations and use a
higher optimizer setting. The gull rotates its foil forces using normalized
inflow components.

| Vehicle | Baseline ms per step and read | Candidate ms per step and read | CPU cycle speedup | Largest observed replay delta |
| --- | ---: | ---: | ---: | ---: |
| Hobie 16 | 6.843 | 6.241 | 1.10× | 0 |
| Pilothouse sloop | 7.606 | 7.663 | 0.99× | 4.61e-7 |
| Cabin cruiser | 3.090 | 2.752 | 1.13× | 0 |
| RDD2 | 2.442 | 1.952 | 1.26× | 8.88e-15 |
| Piccard survey submarine | 7.436 | 6.455 | 1.15× | 5.33e-15 |
| Humpback | 0.492 | 0.461 | 1.06× | 0 |
| Great white, pitching and banking | 0.522 | 0.516 | 1.01× | 0 |
| Herring gull | 0.097 | 0.093 | 1.04× | 3.34e-10 |
| Coupled development world | 13.663 | 13.029 | 1.05× | 0 |

These profiles compare the published archives from `fb9e68f` with the
candidate on a Ryzen 9 5950X using Node.js 22 and Linux perf. Each capture
sampled user-space cycles at 499 Hz after 200 warm-up steps. Each vehicle used
the same settings and 10 ms communication step in both builds, with 500 to
16,000 timed steps per capture. Wakes were enabled for the marine scenarios in
the table. Replay deltas are absolute differences in the sampled output lanes.
The sloop used 0.6% more CPU in the wakes-on capture above. A separate
1,500-step Fast capture with V8's lazy WebAssembly compilation measured
6.49 to 4.69 ms per step and read, 28% fewer CPU cycles, and a step p95 of
32.27 to 20.66 ms. The release includes the sloop archive for that Fast
improvement. The measured gains leave the 10× target open.

Run `scripts/profile-physics-perf.sh build/pages sailing build/physics-profiles/sailing 900`
after packaging with `scripts/package-pages.sh build/pages --world`. The script
writes the binary perf data, symbol report, timings, and numerical replay.
Use `--no-wakes` for the Fast physics setting and `--banked` for the shark
maneuver. Set `OCEAN_WASM_LAZY=1` for the sloop Fast capture. Compare
`flight-idle` on the baseline with `habitat` on the new
build for the swimmer environment measurement.

## Removing repeated projection and root searches

The gull's glide and straight-flight inputs are held between FMI communication
points. Evaluating those comparisons directly removes four roots from the
continuous search. The flap latch still runs at its 100 ms clock, and the
browser still advances in 10 ms increments.

Two alternating pairs of 25,000-step runs against `6832809` measured a mean
step of 84.8 µs before and 12.2 µs after. Median step cost fell from 80.3 to
7.4 µs, or 10.8×. Including a readback after every step, mean cost fell from
91.2 to 18.8 µs, or 4.8×. Over the 200-second replay, flapping switched on the
same ticks. The largest position difference was 1.7 mm during the first 15
seconds and 0.44 m over the full replay. Glide, bank, live mode switching, and
host handoff checks passed.

The event scan reuses the accepted projection when the algebraic assignments
are direct and independent of the history updated during integration, and the
model has no separate discrete memories. The scan still evaluates assertions
and event indicators. The compiler also emits large guarded right-hand sides
as separate functions, which lets Clang finish optimizing the marine builds.

| Vehicle or component | Fast before → after (ms) | Wakes before → after (ms) |
| --- | ---: | ---: |
| Hobie 16 | 6.20 → 5.00 | 6.32 → 6.08 |
| Pilothouse sloop | 5.16 → 4.44 | 6.73 → 5.49 |
| Cabin cruiser | 2.15 → 1.65 | 2.77 → 2.74 |
| RDD2 | 1.82 → 1.70 | 1.99 → 1.79 |
| Swimmer environment | 1.48 → 1.38 | 1.58 → 1.52 |

Each cell is the mean cost of a 10 ms physics step and a readback, measured
against `6832809` in reference, candidate, candidate, reference order in a
single pinned Node.js 22 process. Each replay used 200 warm-up steps with the
same controls. All sampled marine outputs matched exactly. The Piccard and
coupled development world keep their previous archives because the candidate
builds showed no consistent improvement.

In separate 7,000-step Linux perf captures, the humpback used 10.8% fewer
user-space cycles and the pitching and banking great white used 8.2% fewer.
Mean step and read time fell from 0.706 to 0.631 ms and from 0.587 to 0.539 ms,
respectively. The sampled outputs matched exactly in both animal replays.
These are desktop WebAssembly physics measurements. Phone timings and rendering
cost are outside these captures.

Run `scripts/profile-physics-perf.sh` against each revision's packaged Pages
directory to reproduce the captures. Use `OCEAN_WASM_LAZY=1` for the marine
runs, `--no-wakes` for Fast, and `--banked` for the shark replay.

## Piccard event and sonar copies

On the Piccard with the survey camera and sonar active, Linux perf placed
about half of the sampled CPU cycles in memory copying. Call stacks showed
that many copies originated inside the nested folds of the imaging sonar.
Each generated branch used to materialize a full tensor whether it returned
the previous array or changed a single element.

Rumoca now publishes a single tensor result after all checks succeed. A
final conditional forwards the destination into the selected branch. An
indexed update copies the source at most once, and writes only the selected
element when a fold already owns the source buffer. The generated FMI solver
also reuses settled direct assignments and copies stable parameter-backed
history once between events within a communication step. Continuous history
sources, dependent history lanes, and plans that require another solve retain
their original evaluation path.

| Component | Fast mean step and read, before → after |
| --- | ---: |
| Piccard survey submarine | 8.97 → 8.01 ms |
| RDD2 | 1.85 → 1.60 ms |
| Cabin cruiser | 1.74 → 1.59 ms |
| Swimmer environment | 1.45 → 1.34 ms |

These 10 ms replays compare to `c523e29` in reference, candidate, candidate,
reference order after 200 warm-up steps. The Piccard's mean p95 step time fell
from 95.3 to 85.6 ms in Fast and from 95.5 to 85.1 ms with wakes enabled. Mean
wakes-on throughput varied across runs. Separate pinned Linux perf captures
measured 13.4% fewer user-space cycles in Fast (800 timed steps) and 19.8%
fewer with wakes enabled (1,000 timed steps). Run
`scripts/profile-physics-perf.sh build/pages submarine build/sub-perf 1000`
on each packaged revision, adding `--no-wakes` for Fast.

An eight-second replay that toggled the imager, autopilot, and wakes matched
476,920 checked values exactly, including raw sonar, camera, pose, and map
data. The full 17-station survey passed at the browser timestep. The
Hobie and sloop candidates had mixed speed results, so the release keeps
their previous builds. The compiler changes are also available on
[the Rumoca branch](https://github.com/CogniPilot/rumoca/tree/perf/reuse-fmi-event-work).

## Low refraction and cruiser motion

The transmitted scene is captured from the presented hull pose and camera
before each above-water frame. Reflection keeps an independent projection
and refresh cadence. In five-second Low samples at 393 × 852 in Chromium
with SwiftShader, fresh transmission frames changed from 74 of 149 to 144 of
144 for the Hobie, and from 72 of 142 to 141 of 141 for the cruiser. In the
cruiser sample, 70 frames previously used a different hull height from the
capture. Every candidate frame used the same hull height. The paired
display rates were 29.8 → 28.8 and 28.4 → 28.2 frames per second, respectively.

The cruiser blends the rendered hull and camera pose between worker packets.
The deeper keel and lifting strakes are modeled visually. Buoyancy uses
progressive displacement as the V-sections become wet, with the design
displacement and small-signal waterplane slope preserved. The calm test
settled to 1.6 mm peak-to-peak heave. In a 10 ms head-sea replay at a
steady 13% throttle, peak-to-peak heave was 0.709 → 0.714 m and the p95
absolute heave jerk was 9.26 → 8.98 m/s³. The small change in heave amplitude
indicates that the display synchronization is the main fix for abrupt
visible jumps in this case.

## Mobile Hobie with waves enabled

On touch devices, Medium and High use dynamic drawing-buffer and planar
capture resolution. Each displayed above-water frame captures both reflection and
refraction with the current camera and presented boat pose. The water shader uses four depth-tested refraction
samples. Above the surface, the caustics pass traces a 96 × 96 ray grid
instead of 224 × 224 and updates at up to 5 Hz.

The Hobie worker sends 20 ms communication steps on touch devices. It keeps
the FMU's internal solver and the sea, wind and contact event schedules.
A 20-second Swell replay with changing rudder, ballast and sheet inputs
compared 10 and 20 ms. In alternating pairs with wakes enabled the mean
headroom was 1.47× and 1.60×. The maximum horizontal position difference was
under 44 nanometres and the maximum buoyancy difference was 0.000017 N.
With wakes disabled the largest position difference was 0.20 mm and the
timings were mixed.

In matched browser headroom samples with no NPCs at 393 × 852 touch pixels,
Chromium on the RTX 3090 held approximately 30 FPS. High advanced at
1.61× → 1.66× and Medium at 1.60× → 1.60×. Reflection renders fell from
30 to 15 per second. These runs used desktop hardware with 3× DevTools CPU
throttling. The physical phone result and the last gap to 2× remain open.

WebGL timer queries on the same GPU measured 117 → 90 ms of main and water
capture render time per wall second in High, and 106 → 77 ms in Medium.
These samples exclude the caustics pass and use the same 393 × 852 drawing
buffer in both builds. Separate FFT and hull-probe rewrites produced no
consistent simulation speedup in the paired runs and were left out.

The offline speed selector requests up to 2×. The HUD reports achieved
simulation speed. Multiplayer uses its normal clock. The 30 FPS display cap
also applies to accelerated playback.

## Hobie high-wind speed check

The speed report motivated a repeat of the
flat-water automatic-trim sweep from rest. Each heading ran for 90 simulated
seconds. The largest peaks were 12.05 kn in 20 kn of true wind, 14.43 kn in
25 kn and 16.52 kn in 30 kn. Those runs averaged 11.45, 13.40 and 15.90 kn
over their final 30 seconds. At 150° in 30 kn, the sails provided 344 N of
mean forward force, with 301 N of modeled skin resistance and 30 N of foil
resistance. Relative to the 19.14 kn timed run cited above, faster-reaching
calibration is still needed. The timed run included surf and race crew trim.

In a calm-water tow with centered ballast and level water, mean surge at
the highest setting was 11.98 m/s (23.3 kn). The hull reference point rose
8.2 mm from rest, and wetted area fell from 3.30 to 3.12 m². The model's
normal-velocity pressure term supported about 9% of its weight, and running
pitch changed by about 0.04°. Samples averaged the final six seconds of a
21-second tow using the existing longitudinal force input. The test
characterizes the current approximation. Calibration needs running trim,
sinkage and resistance data at matched speeds and crew loading.

## Wind puffs and the rendered Hobie wake

The water combines local wind speed with the wind model's delayed roughness
response. A 60-second field replay at 20.8 kn covered 17% more grid samples
above 25% of the shader's puff strength after widening the visible shoulders.
This comparison uses a fixed visual threshold and the same wind gust field.

At a 20 FPS presentation cadence and about 14 kn boat speed, the released
wake upload used the preceding frame's interpolation factor. Across 33
tested transitions the maximum wake-height error at the start of a new
blend was 6.5 cm. All 34 candidate wake uploads started from the expected
current height, to the texture's quantization precision. The shader also
crossfades the crest foam coverage between the two height samples.

## Hobie beam reach on High

A 20.15 s Chromium run at 1920 × 1080 on the RTX 3090 advanced the
previous Hobie by 12.50 s (0.62×) while drawing at 30 FPS. A user-timing
marker in the sailing worker identified its Linux thread. The thread
accumulated 19.51 s on CPU and 0.33 s runnable off CPU. Linux perf recorded
9,247 browser-wide cycle samples. On the worker, perf stat counted 65.26
billion cycles and 107.94 billion instructions. The simultaneous V8
profile put 19.9% of samples in the wake-step function and its generated
regions and 7.9% in the hull-hydrostatics function. A second live capture
of the same release reached 0.89×. Browser throughput varies with host load.

For a locally generated wake over an externally supplied wind sea, the
real inverse FFT now transforms 33 rows and 32 pairs of columns on the
64 × 64 grid. The calm-background standalone case took 1.64 s versus
2.18 s over 68 timed updates. The largest difference among 656,560
elevation and load comparisons was 4.34e-17. With independent wind
or edge damping enabled, the comparisons were identical.

On the full Hobie, three FMUs replayed the same reach in alternating blocks
of ten 10 ms steps on one CPU. Across 840 timed steps, mean step plus pose
read cost was 21.24 ms for the previous release, 20.85 ms on Rumoca 7107c18
with the original FFT, and 20.31 ms with the real FFT. All nine observed
channels matched exactly across 1,020 steps. Separate-process runs showed
considerable timing variation. The live optimized build reached 0.63×
at 30 FPS in a 20 s capture.

## Where the Hobie spends a 10 ms step

On the Ryzen 5950X and RTX 3090, Chromium drew the local Hobie at 30 FPS on
both presets at 1920 × 1080. In separate 20.04 s captures with 2× playback
requested, the sailing worker spent 19.88 s on CPU on High and 19.85 s on
Low. The committed simulation clock advanced at 1.18× and 1.64× respectively.

The following measurements isolate the released OceanSailing component
from rendering. The Linux perf runs used 200 warm-up steps, 850 measured
10 ms steps and nine bound output channels. Low used the same controls
with `--no-wakes`. The replay leaves wind, swell and sail dynamics active.

| Per 10 ms of simulated time | High | Low |
| --- | ---: | ---: |
| Mean step plus output read | 9.86 ms | 7.07 ms |
| Median step, excluding read | 5.78 ms | 5.74 ms |
| 95th-percentile step, excluding read | 39.41 ms | 13.11 ms |
| User-space cycle samples in libc memmove | 24.72% | 21.76% |
| Bytes copied by Wasm memory.copy per step, decimal MB | 136.22 | 88.84 |
| Of which sail-cloth routine and its nested regions, MB | 38.18 | 38.14 |
| Of which spectral wake step and its nested regions, MB | 43.69 | 0.87 |

The byte counts come from a separate 300-step replay. Counters recorded the
length of each executed Wasm bulk copy by enclosing function in a diagnostic
build. All 2,700 sampled output values for each preset matched the original
module exactly. Repeated copies count each time. These numbers describe
instructions executed inside the worker, including transfers served by cache.
The perf timings above used the uninstrumented module.

In an alternating replay of the same beam reach, the tenth step in each
100 ms interval cost 36.23 ms on High and 11.60 ms on Low, including the
output read. Each of the other nine phases averaged 5.55–7.57 ms across
the two presets. The large periodic difference coincides with the 10 Hz
wake update. A separate cost persists throughout the interval. For example,
one generated branch in the cloth routine forwarded a 960-byte input
unchanged to an output about 5,200 times per step. Other cloth regions
also copied intermediate arrays. A compiler optimization can reuse storage
when ownership and alias analysis establish that a value can safely pass
through a branch or a loop iteration.

A candidate that cached sail/shroud intersections across the three contact
sweeps increased mean step plus read from 9.47 to 15.96 ms on High and from
6.97 to 13.39 ms on Low in the alternating replay. Nine output channels
matched at all 800 steps on both presets. The release keeps the original
contact calculation.

To reproduce the uninstrumented profiles from a packaged site, run
`bash scripts/profile-physics-perf.sh build/onrt-preview sailing build/hobie-high 850`
and `bash scripts/profile-physics-perf.sh build/onrt-preview sailing build/hobie-low 850 --no-wakes`.

### After removing repeated compiler-generated copies

The following paired replay compares the released Hobie at `e48cd5d` with
the same Modelica sources rebuilt using the Rumoca changes in
`compiler/rumoca-array-storage.patch`. Both ran in the same Node process
on the 5950X. Runs alternated in ten-step batches, with 200 warm-up steps
and 600 timed steps per build and preset. Timing includes the output read.
Wasm bulk-copy counts come from a separate 300-step instrumented replay.

| Per 10 ms of simulated time | High before | High after | Low before | Low after |
| --- | ---: | ---: | ---: | ---: |
| Mean step and output read | 10.09 ms | 7.73 ms | 7.38 ms | 6.04 ms |
| Mean tenth step in each 100 ms interval | 38.83 ms | 27.26 ms | 11.92 ms | 10.45 ms |
| Bytes copied by Wasm bulk copies, decimal MB | 136.22 | 114.75 | 88.84 | 72.14 |

Rumoca reuses array storage after its last read, emits direct conditional
calls, and lets pure calls borrow contiguous parameter inputs when Solve IR
proves the snapshot can be skipped. A single 6,912-element input accounted
for 7.12 MB of copying per High step. Its copy count fell to zero.
The paired replay applied helm reversals and changed downhaul. All 29
sampled channels matched exactly at 800 steps on both presets. All 4,096
wake heights and all coordinates of the 64 sail vertices also matched at
each of 16 snapshots per preset.


## Hobie at 10× requested playback

On a Ryzen 9 5950X and RTX 3090, the packaged Hobie (`10b29f8f6e5ccd03`)
advanced 29.10 simulated seconds in 15.00 wall seconds, or **1.94×**.
Chromium used NVIDIA Vulkan through ANGLE at 1920 × 1080, High graphics,
5.14 m/s wind and sea state 0.45. The normal High preset retained its wakes
and reflections. The HUD drew at 29.5–30.0 FPS. Host builds were active.

In a second, instrumented 20.11 s run the sailing worker spent 19.64 s on
CPU and 0.035 s runnable off CPU. Linux `perf stat` counted 65.27 billion
user cycles. The profiler run advanced at 1.41× while drawing at 30 FPS.
To profile the same solver without renderer or playback pacing, run
`bash scripts/profile-physics-perf.sh build/fleet-menu-preview sailing /tmp/hobie-perf 650`.
After 200 warmup ticks the mean 10 ms step cost 6.41 ms plus 0.42 ms for
the bound output read. The median step cost 4.26 ms and the 95th percentile
cost 18.15 ms. Memory moves accounted for 21.2% of cycle samples, the
sectional hull calculation for 8.8% directly, and sine, cosine and shared
trigonometric range reduction for a further 15.8%. Sustained 10× requires
an average budget of 1 ms per 10 ms of simulated time.

To locate the memory cost, byte counters at every WebAssembly `memory.copy`
site measured 54.45 MB per 10 ms tick over 200 ticks in the producer-clock
trial. Individual ticks ranged from about 28 MB to more than 240 MB. The
64² wave kernel accounted for 13.09 MB per tick, the two sail membrane
kernels for 15.17 MB together, and integration endpoint/history work for
9.54 MB. One 312,000-byte history span was copied 3,692 times. These
counts measure logical copies, including transfers served from CPU caches.

The shipped sailing component (`a5be17f93ae5dcd3`) samples the three race
water grids at the clocks of their producers. The FMI code generator also
reuses the complete tuple from a repeated pure calculation when every
input bit matches. All 41 call sites for the Hobie's sectional hydrostatics
use this per-instance cache.

| Full High sailing, same course segment (9–39 simulated seconds) | First run | Second run |
| --- | ---: | ---: |
| Previous component | 1.63× | 1.41× |
| Updated component | 1.87× | 2.23× |

Chromium ran the four trials in previous / updated / updated / previous
order while other jobs were building. FPS stayed near 30. In a separate
interleaved solver run on one pinned CPU, 600 ticks after 150 warmup
ticks cost 6.62 ms each previously, 6.28 ms with the producer-clock
change alone, and 5.58 ms with both changes. That is an 18.6% increase
in solver throughput. A 271-tick replay compared both sail meshes,
vessel state, race water grids, incoming peer wakes, sail trim changes
and a 5.26 kN peer collision. All compared values matched exactly.
The current configuration remains above the 1 ms physics budget for 10×.

## Hobie reflection cadence

At 1440 × 800 on an RTX 3090, the 30 FPS cap left time to refresh the planar mirror every draw. Reusing a reflection on Low held the mast and hull reflection for two frames as the boat and camera moved. These measurements are from two runs per configuration with GPU timer queries around the mirror pass.

| Preset | Previous mirror updates / draws | Every-draw updates / draws | Previous FPS | Every-draw FPS | Median GPU time per mirror pass across runs |
| --- | --- | --- | --- | --- | --- |
| Low | 38/74, 37/75 | 76/76, 74/74 | 29.6, 29.9 | 30.3, 29.6 | 0.09–0.14 ms |
| Medium | 75/75, 69/74 | 75/75, 75/75 | 29.9, 29.6 | 29.9, 29.9 | 0.25–0.44 ms |

Low and Medium keep their reduced capture sizes. The timings cover GPU execution for this scene and hardware. Browser draw submission and mobile GPU costs can differ.

## Piccard manual FPV and onboard sensors

The manual FPV draws the wreck scene directly. Opening the onboard sonar panel requests a 5 Hz ping. Showing the sonar map enables the full navigation camera, sonar and SLAM update. Autonomous survey requests those measurements even with both displays closed. In manual mode with both closed, the navigation update still uses pressure, inertial data and the four Doppler beams.

In a paired test of the packaged OceanSubmarine Wasm on the Ryzen 9 5950X, closing both displays used to leave the full survey acquisition running. Sixteen alternating 0.4-second groups per configuration used identical manual inputs, wakes and a 10 ms FMI step. Full acquisition took 681 ms per group (0.59× real time). Suppressing the unused survey acquisition took 550 ms (0.73×). Repeating with 20 ms communication steps produced 679 ms and 552 ms respectively. The viewer keeps 10 ms steps. These timings exclude rendering and include host load during the run.

A separate Linux perf capture with acquisition enabled attributed 29.4%, 12.8% and 8.2% of sampled cycles to the generated singleton, complete and block algebraic projection routines. Memory copying accounted for 16.4%. This capture of the older packaged model explains how physics could run below real time while the GPU continued drawing at 30 FPS.

To compare survey cost in a built runtime, run `node scripts/profile-physics.mjs build/pages submarine 500 --manual` with and without `--idle-sensors`. The flags reproduce the two acquisition modes. This harness reads bound outputs each step.

### Piccard contact near the original box wreck and seabed

In a Linux perf recording taken 32 seconds into the autonomous survey, the
most frequently sampled generated function selected a single hull primitive
from a tree of constant arrays. The old lookup constructed and copied
intermediate arrays for each of 126 pieces. The contact kernels now load the
geometry tables once before iterating over parts and keep the same narrow-phase
collision calculations.

| Initial position in ENU metres | Previous CPU ms per 10 ms step | Table lookup CPU ms per 10 ms step |
| --- | ---: | ---: |
| Open-water approach (−5, 0, −10) | 1.37 | 1.60 |
| Inside the wreck (6.3, −1.87, −9.43) | 33.22 | 2.60 |
| At the seabed (−5, 0, −13.55) | 40.93 | 4.42 |

The test alternated both standalone Wasm plants through 220 fixed steps per
initial pose and timed the last 200. Position, quaternion, velocity, contact
forces and moments, tank levels, propeller loads and survey telemetry matched
bit for bit throughout each run. The seabed run reached a measured 119.84 N
contact reaction. These timings cover the plant and output reads. The coupled
sensor, wake, rendering and network costs are additional.

On the packaged OceanSubmarine component, 500 timed 10 ms steps after 32
seconds of warm-up went from 0.135× to 1.60× real time (11.9× speedup).
The run included the autonomous controller, all onboard perception, navigation,
full wakes and bound output reads. After 2 seconds of warm-up on approach,
the same test went from 1.47× to 1.53×. Both runs exclude rendering and
networking. Use the following command on each historical packaged revision.

```sh
node scripts/profile-physics.mjs build/pages submarine 500 --warmup=3200
```

### Piccard survey and sensor costs

At the compact Piccard's Yatush launch, the coupled davit build ran the
autopilot, optical survey, imaging sonar, navigation and shared wakes at
1.33× real time on one pinned CPU. That run used 850 timed 10 ms steps after
150 warmup steps. Each step and bound output read took 7.53 ms wall time and
7.33 ms on the calling thread. Manual mode with optical and sonar acquisition
idle took 3.62 ms wall time and 3.51 ms on the thread. These figures exclude
rendering and networking. Concurrent builds and CPU frequency affect comparisons.

Counters inserted in a scratch copy of the release WebAssembly module counted
130 executions of the complete acquisition function across 10 physical sensor
samples in two simulated seconds. The solver evaluated the same pure function
for event iteration and assertion predicates. It executed 3,291 adaptive
integrations, including root searches, and 34,053 derivative evaluations across
those 200 communication steps. Bulk memory-copy instructions moved 14.33 GB in
the survey and 7.64 GB with manual controls and idle imaging.

For comparison, the standalone navigation FMU took 9.16–9.19 CPU ms per
200 ms acquisition over 230 moving frames alternating between the two wrecks
and open water. Moving the immutable integer lookup tables into static compiler
storage reduced this to 4.63–5.26 ms. The seven full sensor and navigation
outputs, including the image and keyframe feedback, matched byte for byte. This
ratio describes sensor acquisition alone.

A five-second finite-stop FMI experiment used the same instrumented browser
archive, 100 warmup steps and 400 timed survey steps. Declaring the actual stop
time reduced searches for the next event from 4,316 to 498 and derivative
evaluations from 55,438 to 51,920. Both runs localized 35 roots and reached the
same waypoint. The largest component-wise difference in physical position was
13.4 nm and in estimated position was 25.3 nm. Thread CPU time fell from 8.11
to 7.35 ms per tick. The open-ended game still uses its normal event scan interval.

The matched magnetic Piccard release included the 6S battery, six thrusters,
all survey sensors, SLAM, surface wakes and the standard 10 ms solver step.
Two interleaved runs per compiler used 150 warmup steps and 650 timed steps on
one CPU. The previous compiler took 7.30–7.57 ms of thread CPU per step.
Per-instance reuse of large pure functions and static integer lookup tables
reduced that to 4.12–4.27 ms, a 1.77× speedup. Wall-clock throughput increased
from 1.22–1.31× to 2.13–2.21× real time. The 95th-percentile step fell from
76–87 ms to 25–26 ms. Every position, waypoint and environment readback matched
at each of the 650 steps. The full optical image, acoustic returns, estimator,
mapping graph, vehicle motion, thrust and battery also matched bit for bit
at 20 sensor acquisition times.

### Piccard contact on the abyss floor

At the flooded Piccard start at ENU (−32, −30, −45.7) m, the sloping bed
lies 1.693 m below the body origin. The old contact routine visited the
viewport and all 131 boxes, with two terrain queries per shape, whenever the
origin was within 4.1 m of the bed. The terrain patch constructs the
triangles under the vehicle's 0.359 m bounding sphere once per evaluation.
It first tests the sphere against their planes and uses the same triangles
for each individual support point when contact is possible.

With the standalone browser Plant on one pinned CPU, steps 21–100 of that
flooded descent took 198.88 ms of thread CPU per 10 ms step before the change
and 4.45 ms with the terrain patch. Both runs produced the same sampled
poses and flood states. In separate paired WebAssembly contact-kernel runs,
286 poses covered the grid edges, flat harbor and sloping abyss, with 165
producing contact. Maximum difference across the six force and moment
components after the flat-facet specialization was 1.2e−11. The standalone
timings exclude navigation, wakes, graphics and multiplayer.

Over the entire 35 simulated seconds, including the slide and repeated
contacts on the sloped floor, the 131-box Plant took 10.57 ms of thread CPU
per tick. Seven finite cylinders, six plates and a viewport sphere on the
same terrain patch took 4.41 ms per tick. The simplified collision geometry
changes the resting attitude. At the wrecks the worker checks finite
triangles against plates and 24-sided circumscribed cylinders. Over 6,000
near-hull queries per run, Yatush took 0.168–0.194 ms versus 0.099–0.139 ms
with the former sphere guards. Satil took 0.035–0.039 versus 0.091–0.094 ms.

With the coupled submarine, full sonar, optical mapping, flooded dynamics and
wakes enabled, the first 40 steps at that same abyss position ran at 0.023×
real time before the terrain patch and 0.448× after it. Sampled position and
flood state agreed at steps 1, 20 and 40. Over 1,000 steps, including first
ground contact, the patched 131-box run averaged 0.747×. These are worker
physics measurements using the released WASI component with a local file
loader. The timing includes reading the position, damage, contact and sensor
outputs on every step.

With the 13 compact primitives, the same 1,000-step coupled abyss descent
averaged 1.02×, including ground contact. A separate 650-step open-water
survey with all acquisition and wakes enabled reached 2.72× after 150 warmup
steps (3.61 ms of thread CPU per 10 ms step). Neither number includes drawing.

### Piccard impact against the scanned wrecks

`scripts/check-piccard-impact.mjs` drives the free submarine into registered
panels at Satil and Yatush at 0.2 and 0.5 m/s, bow first and at a 34° angle.
The low-speed bow impacts previously returned at 0.231 m/s and generated
0.164 J of contact work. The previous force filter continued to push after
the vehicle started to separate. The solver now applies the scan wrench
directly at the witness and chooses normal damping from the directional wet
mass, contact arm and principal moments of inertia. Normal force is
repulsive and tangential friction opposes slip.

In standalone tests with the same mass and inertia, bow impacts returned at
0.026 m/s and 0.072–0.073 m/s respectively. All eight cases dissipated
energy (0.29–2.77 J of work removed by the contact wrench). The scan proxy
represents the measured hull. Its contact stiffness, friction and damping
are simulation assumptions.

### Piccard rotational response

The assumed 18 kg dry vehicle distributes its mass among the loaded barrel,
two side plates, battery tray and six thrusters. Submerged principal moments
also include ballast and axis-specific water added inertia. Rotational drag
includes a linear term, cross-flow drag from the frame and ducts, and resistance
from water moving past the hull. The mass distribution and drag coefficients
are geometry estimates. Tank measurements for this vehicle are unavailable.

The coast test releases the unpowered vehicle from a level carrier at 8 m
depth, moving with the local water, at ±1 rad/s about each axis. The table gives
the first time the speed falls to 0.5 rad/s, sampled every 5 ms. Roll and
pitch include hydrostatic restoring torque. Both directions agreed to one sample.

| Body axis | Dry moment (kg·m²) | Submerged moment at release (kg·m²) | Previous half-speed time (s) | Current half-speed time (s) |
| --- | ---: | ---: | ---: | ---: |
| Roll | 0.193 | 0.255 | 0.090 | 0.185 |
| Pitch | 0.499 | 0.854 | 0.190 | 0.310 |
| Yaw | 0.560 | 0.853 | 0.365 | 0.730 |

The six outboard ducts use their individual water-relative velocities, including
the tangential velocity from rotation. Their incremental drag contributes a
moment about the hull datum. The frame model uses the same local-velocity
principle in its strip estimate. [Smogeli et al., cross-flow drag formulation](https://www.fossen.biz/publications/2005%20Smogeli%20et%20al%20IMAM.pdf).

At 1 m/s forward through the water and an initial
yaw rate of ±1 rad/s, the revised split plant retained 0.671 rad/s after 0.25 s.
The earlier still-water duct approximation retained 0.922 rad/s in the same
test. The ducts alone initially supplied about 1.41 N·m opposing yaw. Run the
coast test with `--through-flow` to reproduce this case. At full helm the pilot
now requests 18°/s yaw in either direction.

On the same split plant the Acro gyro loop settled within 4% of the commanded
rate after returning the sticks to neutral in 1.17 s roll, 1.26 s pitch and
1.43 s yaw (0.35, 0.35 and 0.55 rad/s commands). During a full station-keeping
turn with the navigation FMU the maximum horizontal offset was 0.099 m, depth
error 0.022 m and pitch 0.34°. All eight registered wreck impact cases
continued to dissipate energy.

Run `scripts/check-piccard-angular-coast.mjs`, `scripts/check-piccard-manual-damping.mjs`,
`scripts/check-piccard-station.mjs` and `scripts/check-piccard-impact.mjs` with
Node and the standalone FMI directory as their first argument.

### Linux perf on the live Piccard survey

Chromium used Vulkan on a GeForce RTX 3090 with a Ryzen 9 5950X. The split
Yatush survey ran at 1280 × 720 on High, with 11 m/s wind, waves, the local
sailboat, wildlife, sonar, optical acquisition and the sonar map active.
After startup, Linux perf sampled user-space CPU cycles at 199 Hz across the
renderer and GPU-process threads for 20 seconds. The 7,179 samples had no
loss. This measures CPU execution, including Chromium's compositor. GPU
execution time requires a separate GPU trace.

The sub advanced 11.29 simulated seconds in 20.44 elapsed seconds during that
capture. Dedicated workers accounted for 18.2% of sampled cycles. Raster
worker and compositor threads spent appreciable time painting gradients,
dithering and scaling. A same-session comparison isolated the fullscreen CRT
overlay. Each pass retained the same filter appearance, active wind and
survey sensors.

| Twelve-second pass | Sampled CPU cycles (billions) | Gradient function share | Simulated seconds per elapsed second |
| --- | ---: | ---: | ---: |
| Original overlay | 79.5 | 5.46% | 0.87 |
| Overlay on a compositor layer | 63.8 | Below 0.25% reporting threshold | 0.85 |
| Original overlay again | 78.5 | 5.96% | 0.88 |

The layer saves approximately 19% of renderer and GPU-process CPU cycles in
this test. A static 800 × 540 pixel comparison produced identical RGB values.
Simulation throughput was similar across these passes. These are single
workstation measurements during concurrent builds.

With the final Microduck halftone, vignette and scanline styling, the same
12-second baseline/layer/baseline protocol produced 96.6, 65.5 and 100.0
billion sampled CPU cycles. The three simulation rates were 0.94×, 0.90×
and 0.91×. Caching the layer saved about one third of sampled CPU cycles
in that run. Desktop (1280 × 720, DPR 1) and phone (390 × 844, DPR 2)
reference fixtures matched Microduck in every RGB channel. [Microduck scene stylesheet](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/pollen/scene.css#L64-L66)

A separate perf trace of the split worker at Yatush used the same Modelica
equations compiled with function names, a 10 ms plant step and acquisitions
every 200 ms. Memory movement accounted for 10.5% of cycles in libc plus
3.5% in V8's WASM memory-copy helper. Stacks led back to generated Modelica
assignment and pure-function evaluation. Turning on WASM SIMD and compiling
at O3 produced identical output hashes but inconsistent timing across
Yatush and the abyss. The shipping split compiler flags remain unchanged.

### Split Piccard scheduling

The split Piccard previously accumulated one simulated second per wall second
regardless of the offline speed setting. It advanced the harbor only during
draws. It now uses the selected rate and runs bounded 10 ms step batches
between draws when work remains. Multiplayer fixes the requested rate at 1×.

Chromium ran a Yatush survey in a 980 × 620 window at High with the optical
view, sonar, DVL display and map enabled. Separate 6.5 s captures measured
the Piccard worker's completed simulation time. The browser and FMUs were the
same for each pair. Concurrent workstation load varied.

| Requested speed | Per-draw scheduling | Interleaved scheduling |
| --- | ---: | ---: |
| 1× | 0.69× | 0.88× |
| 10× | 0.42× | 1.38× |

At the 10× setting, the displayed frame rates at the end of those runs were
25.0 and 16.7 FPS. The sailboat solver took 47.5% of wall time on the main
thread after the scheduling change. Isolating the Piccard worker gave 1.68 ms
per 10 ms step (5.96×), including 1.19 ms for the plant and 0.28 ms averaged
over steps for navigation acquisition. The full scene still exceeds the 1 ms
budget needed for 10×.

A separate two-window Hobie/Piccard test verified that a host wind setting of
8 m/s reached the other player. Both windows advanced wind four times, the
regatta twenty times and their surface hull one hundred times per simulated
second. The Piccard progressed at 0.28× before and 0.43× after the scheduling
change in this shared-machine test.

### Split Piccard terrain lookup

On 25 November 2026 the split Piccard worker spent 2.31–2.47 ms of main-thread
CPU time per 10 ms physics step at the abyss cave. A flat constant table of
positive depths reduced this to 1.62–1.63 ms. The two runs per version
averaged **4.18× and 6.16× real time**, a 1.47× speedup. At the Yatush
approach the original took 1.38–1.40 ms and the new version 1.36–1.39 ms.
The change helps most where terrain rays and contact points query the
non-flat abyss bathymetry frequently.

Linux `perf record -e cpu-clock:u -F 997` on the previous deployed split pair
collected about 12,000 samples with no loss. The terrain lookup accounted for
9.93% of exclusive samples in the Plant and 9.36% in Navigation. Native
`memmove` and V8's WebAssembly memory-copy wrapper accounted for a further
12.00% and 5.90% across the worker. Previously the generated routine
constructed rows of signed millimetre elevations at each query. The new
Modelica source indexes a constant north-fast vector of positive millimetre
depths and converts just the two selected values to elevations. The generated
C can place the literal in read-only storage. All 2,115 tested grid index
pairs returned identical floating-point values or the same bounds error.

Run `node scripts/bench-piccard-split.mjs <fmi3-directory> cave 2400` and
repeat with `wreck` to reproduce the worker paths. The benchmark uses the
normal split worker with 80 warmup steps, four steps per message, 11 m/s wind,
active helm, 5 Hz survey, optical mapping and sonar. The recorded control and
candidate used identical current model sources apart from the terrain
generator, the same RC compiler with both downstream code-generation patches,
and the same Emscripten optimization level. The comparison used an A/B/B/A
order. The digest covers all posted telemetry and sensor frames, and matched
for every run at each site. The measurement excludes browser rendering and
inter-thread message delivery.

### Split Piccard generated memory traffic

A second Linux `perf` capture on the flat-depth-table worker attributed 18.91%
of samples to generated assignments, 10.76% to native memory copies and 4.09%
to the six-by-six Cholesky solve for rigid-body acceleration. Instrumenting
the generated C identified a 14,792-byte copy of the 1,849 integer depths
on each terrain lookup. Across 21 simulated seconds it accounted for about
8 GB of source-level copies. This byte count includes copies LLVM can remove.

The FMI C emitter can give an immutable table its own static register when
the checked storage plan owns that register and no other register reuses it.
Shared, caller-visible or subsequently updated storage retains its existing
copy behavior. On a 24-second cave replay, the A/B/B/A code-generation
experiment took 1.410 and 1.414 ms per physics step with the copy and 1.246
and 1.200 ms with the static register. The complete telemetry digest matched
for all four runs. These are single-worker CPU times on a shared workstation.

### Sloop cost during a split Piccard survey

The split harbor advances a surface sloop alongside the submarine. Linux perf
on its WASM solver identified the pressure integration and the sailcloth
evaluation as major CPU costs. The centered monohull now reuses its first
hydrostatic result when both sample lines have identical input water levels.
Offset hulls and unequal levels receive separate integrations. Rumoca's bounded
pure-function cache can now retain two small argument sets, so the mainsail and
jib can each reuse results when evaluating assertions.

In paired isolated runs the old sloop used 3.84–3.85 ms of thread CPU per 10 ms
step, and the optimized sloop used 2.08 ms. With the current Modelica source,
451,980 output values matched bit for bit across calm water, changing wind with
cross seas and nearby traffic, and independently driven water lines. The older
shipped model preceded other source changes. Against that artifact the largest
change in the test was 0.00343 N of contact load.

Four 6.5 s Chromium passes in baseline, candidate, candidate, baseline order
ran the full High split Piccard survey at Yatush with 10× selected. They
measured **0.33×, 0.82×, 0.47× and 0.52×** respectively. Both versions kept
the same wave and wind solvers, sailboat, Piccard plant and navigation, sensor
displays and simulation steps. Compiles were running concurrently on the
workstation. Separate six-second Linux perf captures of the scene advanced
at 0.59× and 0.89×. These results apply to `runtime=split`.

The production split pair was then rebuilt from the pinned `7107c18` compiler
and all four downstream patches. Its complete replay hashes matched the
previously deployed release-candidate build at both sites. During an A/B/B/A
run with concurrent builds, the earlier cave worker took 1.85 and 1.69 ms
per 10 ms tick and the new worker took 1.53 and 1.57 ms. At Yatush the
respective times were 1.30 and 0.98 ms versus 0.98 and 0.99 ms. The new
pair sustained about 6.45× worker CPU real time in the cave and 10.1× at
Yatush. The cave needs less than 1 ms per tick to sustain 10×. The latter
benchmark omits rendering and message delivery.

The existing 600 s standalone sloop autopilot test stayed on leg 1 with one
tack on the previously shipped artifact, the current source without these
optimizations and the optimized release. The two current-source runs agreed
exactly on all twelve sampled positions, headings, speeds and sail forces.

As competing builds wound down, repeating the same High survey in candidate,
baseline, baseline, candidate order produced **2.86×, 2.21×, 2.10× and
2.82×**. The corresponding surface-hull times were 1.26, 2.43, 2.43 and
1.29 ms per step. The optimized passes ended at 30.0 and 28.5 FPS.

### Articulated manta contact with craft

The manta uses ten articulated capsules. Each craft supplies one hull segment
or two for a catamaran. A bounding sphere rejects distant pairs. For nearby
pairs, the Modelica contact function also checks whether a capsule's projected
intervals overlap a hull segment expanded by the combined radii. It tests
the same hull frame and vertical scale as the closest-points solver. A
roundoff allowance keeps grazing candidates in the exact calculation. This
follows the two-stage bounding-volume approach described by Cohen et al.
and used for compound queries in Parry. [I-COLLIDE, 1995](https://www.cs.princeton.edu/courses/archive/spr01/cs598b/papers/cohen95.pdf).
[Parry bounding volumes](https://parry.rs/docs/user_guide/bounding_volumes/).

The table gives median thread CPU time per query in V8 for C emitted by
the pinned Rumoca compiler and built with Emscripten `-O2`. Both kernels
were warmed before six interleaved measurements each. Each row used 4,096
deterministic poses across single-hull, twin-hull and submersible craft. All
twelve force and moment components and the generated assertion flag agreed
bit-for-bit across the 20,480 cases.

| Pose set | Cases with force | Earlier, ns/query | With interval pruning, ns/query |
| --- | ---: | ---: | ---: |
| Distant | 0 | 50 | 49 |
| Direct encounter | 3,293 | 1,378 | 1,394 |
| Nearby flyby | 42 | 1,378 | 1,013 |
| Mixed nearby craft | 371 | 1,529 | 1,169 |
| Grazing contact | 1,221 | 1,269 | 1,057 |

These measurements cover a single contact pair. They exclude scene rendering
and integration of the rest of the simulation.

## Dedicated Piccard, current Yatush survey and collision profiling

The dedicated runtime on port 18416 advanced from 28.49 s to 116.27 s in 20.4581 wall seconds, **4.29×**. This was a 1280×720 High-quality Chromium survey at requested 10× with 11 m/s wind, optical camera, sonar and map active. Linux perf sampled user-space cycles at 199 Hz. Restricting the report and denominator to `DedicatedWorker` put 19.66% in libc memory moves, 4.61% in WASM `memcmp`, 3.93% in `rmc_discrete_owners`, 3.44% in `rmc_guarded_rhs_23` and 2.83% in `rmc_assign`. These are exclusive CPU samples. They do not assign every copy to a particular source array. The recorded start and finish HUD ratios were 4.86× and 3.31×, illustrating why elapsed simulated time is preferable to a single HUD sample.

An earlier instrumented run of the same role measured 3.68% of worker wall time in the JavaScript scan query bridge and 89.06% in FMI stepping, including Modelica contact forces. The split preview's additional sailboat is absent from this runtime. The split-only wave replay now takes 5.68 ms per 100 ms update in the solo case, and 11.45 ms with a live injected peer wake. A solo wave result cannot establish multiplayer or full-scene throughput. The asynchronous optical readback reduced the typical main-thread readback from 9.25 ms to about 0.70 ms in separate measurements.

The [collision review and workload definitions](COLLISION.md) cover the native primitive comparisons and a separate replay against both actual scans. The OpenModelica profile there uses CPU-clock samples on the native query process, a different compiler and denominator from this browser trace.

A second replay instrumented each WASM `memory.copy` instruction on the same deployed artifact (build `ecea1715abbcf6ef`). It counted copies only during `doStep`, following 40 warm-up steps, with wind, waves, wakes, sensors and the automatic survey active. Across the next 200 × 10 ms steps it counted 4.168 GB of logical copy traffic. The median was 7.61 MB/step and the maximum was 279.50 MB. Those counts do not imply an equal number of bytes reached DRAM. They also use a separate replay from the browser cycle profile.

The largest individual function by bytes was the imaging sonar's `formEcho` (1.017 GB, 24.4% of all copied bytes). Its inner loop adds energy to a range bin in a local array of 128 doubles. At two compiled sites alone, a one-bin update moved the whole 1,024-byte buffer 827,664 times. Across the two simulated seconds those two sites copied 847,527,936 bytes. The algorithm has 65 bearings and 15 elevation samples per bearing. The extra traffic is introduced by lowering the indexed update through a temporary. Whole-array copies elsewhere include event-entry snapshots and integration history with separate correctness requirements. The original and copy-instrumented runs produced matching sampled-output hashes.

In a private WASM experiment, replacing that buffer round trip with a same-bin load/store preserved the complete sonar raster, camera images, navigation observations and vehicle state across an 800-step moving Yatush replay. There were 46 distinct sonar frames. Two paired trials in opposite orders reduced sonar-acquisition CPU time from 20.63 to 19.49 ms and from 17.12 to 15.21 ms. Across **all** steps the changes were 2.592 to 2.597 ms and 2.094 to 2.017 ms respectively. This is evidence for reducing the sonar spikes. It does not justify projecting a 20.65% speedup from eliminating 20.65% of logical copy bytes.

Separate measured event overhead comes from preserving the full 156,024-double value array. In the 200-step replay it was copied 120 times to an event-entry snapshot and 121 times to the repeated-event detection history, totaling 300,814,272 bytes for those two sites alone. Keeping the Modelica event semantics requires capturing the right pre-event values and independently owned history. A compiler experiment should restrict snapshots to proven live/writable ranges or maintain a changed-page journal, then verify event roots, simultaneous events, rollback, peer wake, collisions and every sonar frame against the original.

The private single-bin change also ran through the full High-quality browser scene in alternating A/B/B/A order. The original ran at 4.30× and 4.56×, and the experimental version at 4.06× and 4.59×. These short samples overlap. The experiment supports improving individual acquisition ticks, with no demonstrated improvement to sustained browser throughput.

For the fresh browser trace, the nearest identifiable WASM frames above sampled libc copy routines were the FMI step entry including inlined callees (35.6% of those copy cycles), discrete equation evaluation (12.9%), the full imaging sonar ping (10.9%), event update (9.2%), and the full sensor frame (6.1%). These percentages use only sampled copy cycles as their denominator. The worker's 3.44% exclusive `rmc_guarded_rhs_23` sample share belongs to packaging the eight outputs of the 10 Hz wave update. It cannot be assigned entirely to the Fourier transform itself.

There is also a bounded-loop optimization in the Modelica source. The sonar joins adjacent returns only when their range changes by less than 1.8 m. With 128 bins across 18 m, that interval spans less than 12.8 bin widths and can include at most 13 bin centers. Enumerating at most those 13 candidate cells prevents the compiler from expanding the dynamic loop over all 128 possible indices. The exact range endpoints, accumulation order, ray count, update clock and source amplitude are preserved.

In an isolated V8 benchmark of the Ocean compiler's generated WASM, the mixed `formEcho` workload took 1.681 ms before and 0.820 ms after, dense returns took 3.602 and 1.319 ms, and near the maximum patch width took 4.202 and 1.092 ms. With no returns the result was 0.464 and 0.470 ms. All 255,480 output doubles from 120 frames agreed bit for bit. These timings cover the echo kernel only.

The dedicated Piccard FMU compared the baseline `ecea1715abbcf6ef` with candidate `2ac6370e5c9e1d5a`. Each run warmed up for 120 steps and timed the next 1,200 steps at 10 ms of simulation time per step. Both components ran on one pinned CPU in V8 with wind, waves, wakes, camera, sonar and navigation active. The harness alternated execution order every 40 steps, then repeated the trajectory with the order reversed. Values below are mean solver thread CPU milliseconds per step. The acquisition column includes the entire step when the 5 Hz sonar sample was due.

| Trajectory | First component in initial block | All steps, baseline → candidate | Acquisition steps, baseline → candidate |
| --- | --- | ---: | ---: |
| Autonomous survey | Baseline | 3.611 → 3.579 | 30.834 → 29.035 |
| Autonomous survey | Candidate | 2.144 → 2.056 | 17.982 → 16.574 |
| Manual Yatush dive | Baseline | 1.990 → 1.908 | 15.816 → 14.619 |
| Manual Yatush dive | Candidate | 1.817 → 1.713 | 14.789 → 13.235 |

Each replay produced 66 distinct sonar frames including warmup. The complete packed sonar raster, camera image, elevation samples, features, keyframes, navigation estimate, sensor channels and sampled vehicle motion matched the baseline byte for byte. A separate wake replay matched the wave fields sample for sample. Coupling a sailing sender's wake to the candidate Piccard produced a 0.0005082 m peak receiver-height perturbation. The candidate also includes the manta contact filter described above. The baseline and candidate both produced a peak Piccard contact force of 829.4 N and zero force on separation. These checks address solver cost and behavior. Browser rendering and wall-clock pacing are measured separately.

A private compiler experiment narrowed the outer repeated-event history from 1,248,192 to 38,304 bytes per sample using the values that can change across those passes. A separate event-entry specialization retained two disjoint ranges totaling 606,792 bytes. Together they saved 243 MB of the 4.168 GB of measured bulk copies per two simulated seconds. In eight paired runs all observed poses, sonar and camera frames, keyframes and navigation outputs matched. The autonomous survey used 2.6–4.6% less thread CPU. The moving manual dive ranged from 2.1% faster to 5.5% slower across run orders. During a separate 1,000-step audit the original and specialized comparisons returned the same result for both comparisons that occurred in 606 outer snapshots. Neither comparison found a cycle. The preview uses the original history logic. A general compiler implementation needs a true repeated-cycle regression and must preserve full rollback when a right-limit event can restore the whole vector.

The bounded sonar runtime is available in the local preview as `2ac6370e5c9e1d5a`. High-quality Chromium runs over survey time 23–83 s used 11 m/s wind and active sonar, camera and map. In candidate/baseline/baseline/candidate order they ran at 5.04×, 4.91×, 4.70× and 3.25× respectively on the shared host. These browser runs did not resolve a sustained speedup. Promotion was based on the paired solver CPU measurements, reduced acquisition cost, matched sensor data and passing contact/wake regressions. The 10× end-to-end target remains open.

### Hobie High offshore on the coupled sailing worker

With 10× playback requested, Chromium on this workstation advanced the Hobie
18.50 simulated seconds in 16.04 wall seconds (**1.15×**). The High preset
used a 1920 × 1080 viewport, 5.14 m/s wind, sea state 0.45 and the normal
wind and wake models. The served sailing core was `cbe1bd8f914c4460`.
Other builds were running. The HUD ranged from 14 to 27 FPS at the two
measurement endpoints.

A second warmed run used Linux `perf record -e cycles:u -F 169` on the
browser process tree and a concurrent V8 CPU profile on the particular
sailing worker. A trace marker in that worker identified its Linux thread.
Filtering hardware samples to that TID, using percentages relative to the
selected thread, gave 25.9% in libc memory movement, 6.6% directly in
sectional hull hydrostatics, 6.3% in trigonometric argument reduction,
3.8% and 3.4% in the cosine and sine kernels, 3.7% in the 64² wake step
and 3.1% in the mainsail cloth kernel. Flat hardware percentages exclude
time in callees. In the V8 stacks, 18.3% of samples included sectional
hydrostatics and 9.6% included the wake step. Of 1,387 samples containing
sine, cosine or their reduction kernels, 943 were under hull hydrostatics.

The sampled run advanced 22.40 simulated seconds in 20.14 wall seconds
(**1.11×**). The sailing worker consumed 17.00 CPU seconds and spent
2.21 seconds runnable off CPU. Its measured cost was 7.59 ms on CPU per
10 ms simulated, compared with the 1 ms budget at 10×. This is an offshore
sailing run. A wreck impact or a multi-vessel encounter needs its own
collision profile.

Conservative wet/dry bounds now skip the individual waterline sine evaluations
only for sections guaranteed dry or entirely submerged across the integration
strip. A direct kernel comparison returned identical loads for 8,000 randomized
poses. A 271-step coupled replay also matched bit-for-bit through changes in
sail trim, a peer's wake, and hull contact. On the same desktop, alternating
warmed browser runs measured 2.363× and 2.358× before, and 2.385× and 2.396×
after. A pinned component replay measured 4.211 vs 4.139 ms per 10 ms step.
A proposed symmetric wake lookup increased step time, and a different
trigonometric reduction changed an impact trajectory. Neither trial shipped.

Instruction counters in the offshore High component recorded 11.03 GB of
logical WASM copies in 200 steps after 40 warm-up steps. That is 55.15 MB
per step on average, with a 28.24 MB median. The instrumented and control
runs produced the same sampled-output SHA-256. These counts measure bytes
requested by memory.copy. Hardware samples above measure the CPU cost.

### Hobie hull contact during multiplayer replay

A pinned Linux hardware-cycle profile refreshed a nine-field peer packet at
the same 100 ms interval in each High sailing run. With the peer 300 m away,
the simulation consumed 5.68–6.11 ms CPU per 10 ms step, with zero contact
force. Sustained bow-on contact consumed 8.65–10.23 ms. It generated force
on 1,194 of 1,200 steps, peaking at 14.4 kN. The triangle distance kernel
then accounted for 24.0% of flat cycles.

The pontoon mesh has 12 ordered transverse rings. A vertex of the nearest
ring supplies an upper distance bound. Only skin triangles in ring intervals
that can beat this bound and the two end caps need exact triangle projection.
The original triangle order resolves ties. Meshes with a different face
order retain the full search. Signed distances and normals agreed bit-for-bit
with exhaustive search at 16,072 points. Coupled replays matched every
sampled boat pose and peer force through 1,680 steps, plus the separate wake
and sail trim replay.

Two alternating comparisons of the final build measured a mean of 7.80 ms
before and 6.63 ms after per 10 ms of simulated sustained contact, including
the rest of the sailing model. The optimized contact kernel used 9.6% of flat
cycles in a fresh Linux profile. This sustained overlap intentionally stresses
the narrow phase. Offshore the triangle search is already rejected.

A separate 20 ms desktop communication-step experiment agreed with 10 ms
to within 24 nanometres offshore but diverged by over a metre in repeated
contact. Desktop continues to use 10 ms communication steps.

### Dormand–Prince endpoint history

The endpoint of each integration interval copied the whole Modelica `pre()`
history when even one source was continuous. The FMI solver now reuses each
independent parameter-backed range between events. Continuous history,
sources written by other history transfers, and destinations with multiple
writers still update in their original order. The first interval of a new
communication step and the interval after an event refresh the reusable ranges.

During 200 warmed High steps with a pose read, logical copies attributed to
the integrator fell from **1.907 GB to 0.279 GB**. Across the component they
fell from 11.031 GB to 9.402 GB. The output checksum was identical. Over
1,800 offshore steps, alternating Linux `perf stat` runs retired 67.0 vs
66.1 billion instructions and used 25.9 vs 24.1 billion cycles on average.
A shorter pinned timing replay measured 4.08 vs 4.15 ms per step, and a
separate sustained-contact replay measured 5.36 vs 4.96 ms. The High
browser A/B runs varied with host load (1.50×/2.36× control and
2.10×/1.92× candidate). Both served the coupled sailing component at 1080p.
The 10× target remains open. The next largest copy sites are the wake step
(2.62 GB) and mainsail fabric (2.54 GB per 200 steps).

The patch applies on top of the pinned Rumoca fixes in `build.sh`. The
pinned IR suite passed 1,359 tests. Native FMI 2 and FMI 3 replays also
matched through changing inputs, periodic samples, and a state crossing.

### Wake spectrum row writes on Hobie High

Each complex wake mode and directional wind mode now writes its row element
once after computing both components. Moving the scalar work outside the
array updates lets Rumoca avoid copying several 64-element temporary rows.
The mode count, wind spectrum, water depth, hull sources, FFT and peer wake
inputs are unchanged.

Across 200 steps the wake kernel copied 1.98 GB, down from 2.62 GB.
All instrumented kernels together copied 8.76 GB, down from 9.40 GB.
The 271-step replay matched every sail, force, contact, pose and water tile
bit for bit. The standalone wake regression also passed for wind waves,
off-center probes, asymmetric hull immersion and the tow case.

Across four alternating Linux perf runs of 1,800 steps each, average
instructions fell from 66.11 to 64.51 billion. Average cycles were essentially
flat at 22.65 billion. In the 1080p desktop High browser, the baseline ran
at 2.53× and 2.57×, and the new component ran at 2.65× and 2.62× with
wind and peer wakes active. The largest remaining measured copy site is
the mainsail fabric solver at 2.54 GB per 200 steps.

### Sailcloth contact with the shrouds

Each wire pass moves sail vertices in the transverse direction. The X
and Z bounds of each mesh row therefore stay fixed for the three passes.
A row and its neighbor bound all the horizontal, vertical and diagonal
edges starting at that row. The new broad phase checks this bound before
running the original edge intersection and contact reaction.

The mainsail kernel copied 2.11 GB per 200 steps, down from 2.54 GB.
The coupled 271-step replay matched all wire reactions, including a 47.06 N
peak, both sails' vertices, wave fields and vessel contact bit for bit.
An ordered list of candidate wire crossings increased array-copy traffic,
and a packed mask produced almost identical browser rates. Both trials
were discarded.

Four alternating 1,800-step Linux perf runs in the repeat measurement gave
22.30 billion cycles and 64.49 billion instructions before row rejection,
and 22.20 billion cycles and 63.54 billion instructions afterward. In the
1080p High browser, two control runs measured 2.62× and 2.27×, and the two
candidate runs measured 2.69× and 2.70×. The spread between control runs
was larger than the standalone CPU improvement.

A fresh Linux perf recording on the published component covered 53.03
simulated seconds in 20.06 wall seconds (**2.64×**). The sailing worker
spent 19.83 seconds on CPU and 0.014 seconds runnable off CPU. That is
3.74 ms of CPU per 10 ms simulated in this offshore run. Sampling that
worker alone put 18.44% of cycles in the host memory-move routine, 7.43%
directly in sectional hydrostatics and 4.25% directly in trigonometric
argument reduction. Of 9,710 V8 samples, 22.85% included sectional
hydrostatics, 11.00% included the 64² wake, 6.43% included the mainsail
fabric and 2.49% included the jib. Of 1,792 stacks containing trigonometric
calls or argument reduction, 1,120 included sectional hydrostatics. The
browser held 30 FPS. The dedicated contact replay above covers sustained
vessel contact separately.

### Guard unused trigonometric work in sectional hydrostatics

The generated scalar kernel evaluated a sine before selecting one branch
of a Modelica conditional expression. Explicit guarded statements now
avoid the crest calculation when an entire integration column is certainly
dry, and skip the deck sine when the bounding water level already excludes
overtopping. The bow still computes the reported maximum foredeck depth.
Instrumenting the generated native kernels over 8,000 deterministic poses
counted 926,727 sine evaluations, down from 1,077,624. Every one of the
23 output values matched across these poses, including extreme phases and
inverted attitudes. The 271-step coupled High replay matched bit for bit.

Across two four-run alternating Linux perf blocks of 1,800 steps, median
cycles went from 22.65 to 22.47 billion and median instructions from 63.53
to 61.98 billion. The four High 1080p browser runs per build had medians
of 2.68× and 2.74×, with means of 2.66× and 2.67×. This version still uses
all the High wave modes, sail dynamics, contact and multiplayer inputs.

The published-route smoke fetched component index
`OceanSailing.fmu.c702c2121402669f.json` and ran at 2.37× over 20 seconds
at 30 FPS. The standalone hydrostatics, peer-surface and fleet-contact
checks passed. The existing windless surf-speed assertion still fails on
the earlier ring-contact build, the row-bounds build and this build. All
three produce the same six-second following-sea velocity of 6.1573 m/s
against the test threshold of 6.45 m/s, with identical recorded speed,
phase, force and ballast for all three headings/sea cases.
