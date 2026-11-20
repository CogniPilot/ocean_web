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
