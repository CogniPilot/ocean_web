# Diver policy score gradient

From the repository root, run `tools/diver-policy-vjp/build.sh` with Rust, Cargo and Rumoca on PATH. The build uses the project's Rumoca checkout at .deps/rumoca-upstream for the native evaluator. Set RUMOCA to choose the compiler executable. The build compiles DiverPolicyScore.mo, creates build/diver-policy-vjp/diver-policy-vjp and checks all fifteen and twenty actor-weight derivatives for three- and four-action policies against central differences of the compiled scalar score.

Send one JSON object per line to the persistent process. Each feature row holds five policy observations, each perturbation row holds one independent standard-normal draw per action dimension, and each advantage belongs to the corresponding sample. Sigma is the positive scalar exploration standard deviation before tanh. Gradients are averaged over the batch; rows correspond to actions and columns to observation features. For example, sending

```json
{"features":[[1,2,0,0,0]],"advantages":[2],"perturbations":[[0.5,-1,0]],"sigma":0.5}
```

returns

```json
{"gradient":[[2,4,0,0,0],[-4,-8,0,0,0],[0,0,0,0,0]]}
```

The helper seeds Rumoca's reverse-mode vector–Jacobian product of the scalar policy log likelihood with the observed advantage. Use an ascent update for the actor weights. Rollout rewards enter through those supplied advantages. Invalid requests return an error on the corresponding output line and leave the process available for the next batch.

## Paired returns and optimizer

`DiverOptimizer.mo` also supplies the numerical operations for two NDJSON requests. The native process batches inputs and evaluates the compiled scalar programs.

- Send `{"op":"returns","gamma":0.5,"rewards":[[1,2,3],[3,0,1]]}` for discounted reward-to-go per decision and the full paired difference as the advantage. This example gives advantages `[[-0.5,3,2],[0.5,-3,-2]]` and mean initial discounted return 3.
- For `op: "update"`, supply the gradient request fields and the current `weights`, `m`, `v` (action-count by five matrices), and completed `step`. The response contains the updated four values, the gradient and its Euclidean norm. Optional `lr`, `beta1`, `beta2` and `epsilon` default to 0.032, 0.9, 0.99 and 1e-7.

## Train and fly the diver

The checked-in actor runs the Modelica equations in `viewer/board/DiverSwimPolicy.mo`. Rumoca emits a source FMU, and a WASI C compiler links it into a reactor for the browser and Node. The host transfers joint targets and observations at 100 Hz. The actor selects four stroke parameters at 2.5 Hz. It can command all fourteen joint targets and receives no body force or pose override.

Run these commands from the repository root with Node, Rumoca, Rust/Cargo, a WASI C compiler and wasm-ld on PATH.

```sh
node tools/diver-policy-vjp/build-controller.mjs
tools/diver-policy-vjp/build.sh
node scripts/train-diver-swim.mjs train build/diver-swim-candidate.json
node scripts/train-diver-swim.mjs evaluate build/diver-swim-candidate.json
```

The trainer saves the best validation checkpoint using an atomic rename. To select that candidate for play, copy its JSON to `viewer/assets/diver-policy/swim-weights.json` and serve the viewer. Rebuilding the controller does not overwrite the weights. Set `RUMOCA`, `WASI_CC` and `WASM_LD` to select local binaries and `DIVER_RL_WORKERS` to change the number of CPU rollout workers. For local comparison, evaluation reads the shipped CPU ScubaDiver FMU and reports speed error (m/s), yaw-rate error (rad/s), attitude departure (rad) and positive joint power (W).

Training uses 18 Adam updates with 16 paired positive/negative exploration rollouts per update, randomizing current, initial orientation and stroke phase. Each rollout lasts 4 s, with ten independent latent-action samples. Sixteen commands cover forward and backward swimming, left and right turns, combined commands, both rate ranges and coasting. Validation and held-out evaluation each use 32 separate 5.6 s trials. The reported errors average the second half of each trial. This benchmark exercises submerged open-water locomotion. Contacts, transitions ashore and sustained real-diver energy expenditure require separate validation.

Set `DIVER_RL_RUNTIME` to an alternate directory containing a compiled ScubaDiver, its metadata and `instance.mjs`. Each run snapshots those four files for every rollout worker and records the trained plant SHA-256 in the checkpoint. To check simultaneous pitch, roll, turning and forward fin actuation on the installed browser plant, run `node scripts/check-diver-learned-controls.mjs`.

On the `b11573455699` diver plant, validation selected update 6 of 18. The 32 separate held-out cases gave these averages.

| Controller | Forward speed error (m/s) | Yaw rate error (rad/s) | Attitude departure (rad) | Positive joint power (W) |
| --- | ---: | ---: | ---: | ---: |
| Initial actor | 0.09925 | 0.07004 | 0.1357 | 32.49 |
| Trained actor | 0.09222 | 0.06407 | 0.1334 | 39.34 |
| Built-in gait | 0.15242 | 0.13312 | 0.2676 | 181.63 |

The learned weights select propulsion amplitude, differential stroke, fin trim and hand-sculling amplitude. During reverse travel the hips and knees draw back the feathered fins, while each elbow changes its palm orientation during the arm sweep. The plant applies three-dimensional drag at each moving palm and transfers its reaction through the shoulder and elbow Jacobians. `node scripts/check-diver-reverse.mjs` verifies actual forward/backward displacement, arms-only propulsion in both directions, neutral commands, and the exact doubled speed and angular-rate requests. Separate Modelica pitch/roll feedback mixes the user's attitude commands into the fin targets. To test a candidate before installing it, set `DIVER_RL_WEIGHTS` when running the signed control regression. All reported physics rollouts and score gradients used the CPU. Rumoca's `cuda-ode` backend rejected the swimmer's event partitions; a successful CUDA emission for the isolated score equation alone does not execute or accelerate the swimmer.

## Live browser training

Each lane runs an independent articulated ScubaDiver plant compiled by Rumoca. Static hosting runs FMI WebAssembly physics. A local CUDA runner can advance all lanes on an NVIDIA device. The training worker publishes the same rig packet as the live diver. Each lane starts 18 m below the surface over a 120 m seabed. The fixed validation cases use repeatable currents. The exploratory pairs use separately drawn currents, matched within the pair, and opposite Gaussian noise. **Count → Auto** times disposable simulation steps on growing batches and selects a population before the first validation rollout. Count presets include 1, 4, 16, 32 and 64. **Manual** accepts any positive whole number within backend capacity. At counts outside multiples of four, the worker collects its paired exploration histories in successive batches of exactly the selected size. The CUDA service measures available device memory and workspace per lane. Browser CPU physics supports batches up to 256 and Auto also respects the browser’s device-memory hint when available. Grid placement only affects rendering. Each instance uses the full diver skin and equipment. The renderer shares geometry and materials across the grid and poses each instance from its own physical joints. Selecting a swimmer centers the close-up.

DiverSwimPolicy.mo supplies the trial current, random draws, observations, policy, joint targets, reward and metric averages. DiverLiveUpdate.mo computes six-step discounted reward differences, the analytic Gaussian score gradient and the Adam weight update. Both optimizer backends execute this same Modelica source. On GPU, the training host dispatches one WGSL invocation per actor coefficient, reads back the updated weights and moments, and checks that they are finite. On CPU, it executes the FMI WASM version in Float64. With CUDA physics selected, every physical time step, including event handling, executes through the generated FMI co-simulation kernel. Initialization, policy observations and joint target evaluation use the host. Policy update device selection is independent of the physics backend. The host schedules tasks, submits data, selects the highest validation score and publishes snapshots. Each round lasts 2.4 simulated seconds per environment for exploration and another 2.4 seconds for validation. With four lanes, the validation set covers forward motion and a helicopter turn. The sequence of exploration tasks includes reverse, mixed fin strokes, strafe, pitch, roll, BCD and torch use. Short-run validation scores measure performance on those specific conditions.

Under **Controls → Live training**, choose **Pre-trained swimmer** to initialize the policy from the bundled learned checkpoint, **Scratch** to zero the 8 × 15 matrix and optimizer moments, or **My swimmer** to continue from the weights currently driving your diver. All three use the same Modelica joint controller, observation features, hydrodynamics and reward. Scratch preserves the authored stroke primitives. Each new run resets Adam's moments. Stop or Close after an update sends the best validated weights to the occupied swimmer and enables Learned swim. Save weights exports a copy. The plots show the candidate and best validation reward and the candidate's mean absolute forward speed error per round.

Build the CPU optimizer with `node tools/diver-policy-vjp/build-controller.mjs build/diver-live-update viewer/assets/diver-policy DiverLiveUpdate` and the GPU optimizer with `node tools/diver-policy-vjp/build-live-gpu.mjs PATH_TO_RUMOCA_WEB/rumoca_bind_wasm.js`. The latter requires the full-web bindings exposing prepare_gpu_value_function. The generated shader metadata records compiler version, commit and Modelica source hash.

Run `node scripts/check-diver-training-gpu.mjs http://localhost:18416/` against a locally served viewer to verify a real dispatch, changed weights and CPU/GPU parity. Set PLAYWRIGHT_MODULE and CHROMIUM when the launcher is outside the repository. With 12 deterministic lane histories and 120 actor coefficients, the NVIDIA Ampere hardware test measured a maximum absolute weight difference of 4.63e-8 and a gradient difference of 2.74e-7. The independent four-lane GPU-worker smoke test advanced 32 articulated simulation steps and returned four finite rig packets of 97 scalars each. Set DIVER_BENCH=1 to also measure three complete one-round trials on each backend, using the same initial weights, seed, four lanes and physical simulation duration.

The CPU physics backend keeps independent FMI state for each swimmer inside one shared WebAssembly reactor. Policies also keep independent FMI state in a second reactor. Scratch buffers and compiled code are reused between synchronous calls. Reset and stop release completed rollouts. Run `node scripts/check-diver-training-lanes.mjs` to verify 64 interleaved policies and plants against an isolated trajectory, including command isolation, memory count, disposal and a fresh start.

On the Ryzen 9 5950X, 64 initialized swimmers used 30.125 MiB of linear memory for their physics reactor and 6.0625 MiB for their policy reactor. In a Chromium worker, a complete 64-lane validation and the following exploratory rollout delivered 15,872 lane steps at 315 lane steps/s. This measures aggregate throughput across lanes. The first 64 poses arrived 146 ms after the worker reported ready. GPU weight updates were selected and the CPU ran all articulated physical steps in this measurement.

### Local CUDA physics

Use the same generated numeric FMI 3 co-simulation component for the CUDA module, the native runner and the browser metadata. In the Rumoca checkout with the CUDA FMI entry, compile an extracted source FMU using `node examples/codegen/cuda-fmi3/build.mjs EXTRACTED_FMU DEVICE_BUILD`. Configure the LLVM and CUDA tool locations described in that example. In Ocean Web, build the generic runner using `CUDA_INCLUDE=… CJSON_ROOT=… tools/fmi-cuda-batch/build.sh EXTRACTED_FMU/sources RUNNER_BUILD`.

With the normal viewer already served locally, start the same-origin training endpoint and verify it against the browser FMU.

```sh
node tools/serve-training.mjs 18311 http://127.0.0.1:18308/ ScubaDiver RUNNER_BUILD/runner DEVICE_BUILD/ensemble.cubin viewer/fmi3/ScubaDiver.json
node scripts/check-diver-device-physics.mjs http://127.0.0.1:18311/
```

The runner reports its GPU, available bytes and allocation size per lane. The browser checks the FMU instantiation token and the device dispatch sequence. The runner, HTTP transport and population calibration use FMI inputs and outputs by name. A different model supplies its own plant, control policy, observations, reward and rig. CUDA requires the native service on the machine serving the simulation. A standalone phone browser can run the WASM plant and use WebGPU for the optimizer when available.
