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

## Why the 80 m gate preview falls behind

On November 20 the local single-FMU preview used world index `d2b8ae5490a96980`. The comparison used the Pages build's `7da70130b10a9b8d` index served locally. Both ran the full scene. A 10 ms physics tick has a 10 ms wall-clock budget for 1× simulation. The following Node measurements exclude rendering, networking and audio. Each run warmed up for 100 ticks and timed the next 120 with identical inputs.

| Build | Mean tick | Median | p95 | Simulated seconds per wall second |
| --- | ---: | ---: | ---: | ---: |
| Pages | 16.1 ms | 7.5 ms | 77.2 ms | 0.62 |
| Local gate preview | 100.1 ms | 43.1 ms | 436.3 ms | 0.10 |

These were reverse-order repeats on a shared Ryzen 9 5950X. In the first pair, pinned to one core during concurrent profiling, the means were higher, 54.6 and 206.1 ms respectively. Use the paired runs to establish the regression. Neither run predicts a particular phone's frame rate. Reading three pose outputs on the local build took 1.19 ms median. Most of the delay occurred inside the guest's step.

A separate V8 sampling profile of the local guest collected 16,706 samples over 100 steps after 40 warmup steps. Algebraic refresh was on 90.9% of stacks, complete projection on 75.0%, and scalar equation isolation on 59.3%. These inclusive shares overlap. Two isolation programs calling the hull hydrostatics function accounted for 3,834 samples together (23.0% of the entire profile). The generated call computes eight outputs including lift, moments and six immersed volumes. The scalar solver repeatedly visits that tuple. Event update appeared on 9.7% of stacks. Lowering sonar frequency alone would leave the dominant local solver path intact.

| Local trajectory, 2 m/s initial speed | Mean tick | p95 | Contact evidence |
| --- | ---: | ---: | --- |
| Offshore | 115.5 ms | 453.6 ms | Zero shore force |
| Island approach | 198.2 ms | 755.1 ms | 47 of 180 ticks with shore force |
| Sustained rocks | 329.2 ms | 1349.7 ms | 159 of 180 ticks, 33.5 kN peak |
| Pass 8 m farther from pin | 89.2 ms | 240.5 ms | Zero mark force |
| Strike pin, ticks with force above 1 N | 206.8 ms | 521.0 ms | 1.02 kN peak, 2.36 m maximum pin excursion |

The shore rows exclude 30 warmup timings. Impact and miss used the same heading and speed in calm wind. The impact row includes 81 loaded ticks after warmup. Different trajectories activate different equation branches and integrator work. A slower contact trajectory does not directly measure the time spent inside the geometric intersection function.

### Browser and mobile

Chromium ran at 393 × 852 CSS pixels using touch emulation and SwiftShader. Over 180 frames the local build delivered 15.3 FPS, p95 frame time of 83 ms and 0.051× simulation speed. The Pages build served locally achieved 27.9 FPS, 48.5 ms and 0.542×. The local drawing buffer initially measured 451 × 979, versus 314 × 681 for Pages. Both builds adapt resolution during the run.

With the local drawing buffer fixed at 314 × 681, holding reflection and refraction at their initial capture reduced mean draw calls from 144 to 106 and p95 frame time from 71.7 to 58.8 ms. Simulation advanced at 0.056× and 0.058× respectively. This diagnostic froze water captures in both space and time. It demonstrates potential frame-time savings, but freezing the reflections would give an incorrect moving view. GPU timings on a physical phone remain unmeasured.

### Where to spend the fidelity budget

* Keep the boat's two hulls, leeward immersion, sheet limits, full-length battens and paired contact forces. Verify them with heel, yaw, righting moment and sheet-tension histories. Reusing identical force evaluations in the compiler can save time at full model resolution.
* Spend additional water resolution close to the bows and along an active wake. Compare crest spacing, wave height, hull resistance and energy balance on the same reach before adopting a finer solver. A uniformly finer ocean would charge every vehicle for bow detail everywhere.
* Keep sonar and navigation at survey fidelity on an occupied sub. Test selecting one active vehicle per peer and scheduling sensors only for vehicles using them. A control selector that leaves every vehicle in the compiled solve cannot deliver the same saving. Measure complete survey time and pose error on the sub; measure helm latency on a sail-only run.
* Separate camera effects from physics. A slower capture cadence and smaller render targets can improve frame pacing. Nearby hull and mark contact must continue to sample the actual Modelica state on every required solver step.
* For peer-to-peer racing, agree on a world seed, simulation tick, weather inputs and wake contributions. Share keyframes with late joiners. Let the coordinator confirm race events and shared-body impacts, and render snapshots between updates. Raw frame rate and each device's wall clock are unsuitable as the wave phase.

To reproduce an isolated run, use `node scripts/profile-world.mjs PATH_TO_PREPARED_WORLD 180 rocks`. Positional scenarios include the approach from the first tick. The default scenario includes warmup. Set `OCEAN_CPU_PROFILE=/tmp/ocean.cpuprofile` for a separate V8 sampling run.

### Compiler result on identical model equations

The Rumoca C generator now recognizes compact multi-output pure calls in scalar isolation programs. It keeps the last successful result in the FMU instance, keyed on the exact bytes of every typed argument. A changed input causes reevaluation. Calls with assertion predicates take the existing path. The cache is bounded and excludes large fields. This targets repeated evaluation of hull hydrostatics while retaining the model equations and solver step.

The table compares the same 80 m race model and compiler options with and without the generator change. Two independent FMU instances advanced in alternating order, with identical rudder, sheet and wind changes. Each scenario compared 118 force, moment, pose, displaced-volume, wake, estimator and buoy output scalars at every one of 150 steps. All **53,100 scalar comparisons were bit-identical**. Timing excludes the first 20 steps per case. These runs took place under concurrent build and benchmark load.

| Scenario | Previous mean / p95 (ms) | With cache, mean / p95 (ms) | Mean cost reduction |
| --- | ---: | ---: | ---: |
| Offshore | 104.3 / 382.4 | 81.9 / 296.8 | 21.5% |
| Pin approach and impact | 321.7 / 1098.7 | 305.8 / 1108.5 | 4.9% |
| Rock approach and impact | 495.4 / 1517.7 | 464.6 / 1442.4 | 6.2% |

The pin p95 did not improve in this run. The optimized world remains above the 10 ms budget. Reproduce the comparison using `node scripts/compare-world-contact.mjs BASELINE_RUNTIME CANDIDATE_RUNTIME`. The compiler's 268 code-generation library tests also passed.

### Wind fidelity experiment

Three standalone builds used the same gust equations, 96 m periodic patch, seed, 10 m/s east and 4 m/s north mean wind, and 4 Hz updates. Over 16 seconds, 16 moving receiver locations per tick yielded 1,024 vector comparisons against direct evaluation of the continuous gust equations. The rows measure spatial interpolation error relative to this model. They do not validate its real-world meteorology or a boat's long-term trajectory.

| Grid | Cell width | Median update | RMS vector error | p95 / maximum error |
| --- | ---: | ---: | ---: | ---: |
| 24 × 24 | 4 m | 1.26 ms | 0.102 m/s | 0.192 / 0.863 m/s |
| 32 × 32 | 3 m | 2.19 ms | 0.054 m/s | 0.108 / 0.376 m/s |
| 48 × 48 | 2 m | 4.47 ms | 0.025 m/s | 0.046 / 0.206 m/s |

A 32 × 32 field is a promising rendering and roughness grid. A better physical fidelity trade is to evaluate the continuous gust model at the occupied boat and drone independently of the display grid. That would also give different graphics tiers a common wind at the same position and tick. The current preview keeps the 48 × 48 production grid. Even saving 2.28 ms four times per second would recover only about 9 ms per simulated second in this standalone test. The much larger deficit is in the integrated solver.
