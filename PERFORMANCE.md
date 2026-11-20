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
