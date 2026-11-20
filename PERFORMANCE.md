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

## Reusing conjugate modes for hull displacement

The submerged hull volume is real, so its Fourier coefficient at the opposite wavevector is the complex conjugate. The yaw lever arm changes sign there. Reusing these values skips almost half the twelve-strip integrations while continuing to advance each traveling wave independently on the 64 × 64 grid.

An alternating standalone benchmark of two WASM builds from the same Rumoca compiler measured 20.78 ms median and 21.27 ms p95 per 100 ms of wave evolution for the original solver. Reusing the conjugate rows took 18.82 ms median and 19.35 ms p95. The tow turned, pitched and heeled with unequal, time-varying immersion in a wind sea and current. All 393,792 comparisons of elevations, displacement spectra, hull samples, incident waves and reaction loads matched exactly. Timings exclude input writes and output reads. Run `node scripts/compare-wake.mjs BASELINE_DIR CANDIDATE_DIR` with the two generated browser module directories to repeat the comparison.

In the combined FMI 3 LS-WASM build, four alternating comparisons reversed which component initialized first. Each timed 60 batches of ten 10 ms steps per model after warmup. The original took 40.59 s in total and the conjugate-row implementation took 40.55 s for the same 24 simulated seconds. The first session ran faster in every process, whichever implementation it contained. Forty-two outputs matched at all 65 sampling boundaries in each run. This experiment demonstrates a repeatable speedup in the standalone wave model and no material throughput gain in the integrated simulator. The public build retains the original spectral integration.
