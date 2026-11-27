# Collision detection in Ocean and modelica_models

## What the measurements say

Piccard has two collision paths worth benchmarking separately. Its browser worker searches static wreck and cave triangles and passes up to eight witnesses into the FMU. The Modelica plant evaluates contact forces, including the moment from an off-center impact. The reusable Modelica library also provides analytic moving-shape queries. A timing for any one of these operations cannot be extrapolated to the other two.

In one High-quality Yatush browser trace at requested 10×, the worker completed 2,689 steps of 10 ms in 12.07 s. The host contact update took 444.5 ms (3.68%, 0.165 ms/step), while FMI stepping took 10,749.6 ms (89.06%). FMI stepping includes the forces and other plant dynamics. Even eliminating the entire host contact update would improve this trace by at most about 1.04×. Collision latency matters more when sliding against a complicated scan, and faulty contacts can cost solver evaluations as well as giving visibly poor motion.

A separate replay moves Piccard tangentially over a 20 cm patch on each actual hull, with both wrecks and the abyss cave registered. Eleven batches of 120 warmed queries produced the following results on the Ryzen 5950X under shared load. Each open-water batch missed every surface, and every scrape pose returned a contact. These are medians of batch means. The selected patches do not characterize an entire wreck. Run `node scripts/bench-wreck-queries.mjs` from this checkout.

| Query | Yatush | Satil |
|---|---:|---:|
| Open water, 100 m along local surface normal | 1.99 µs | 0.66 µs |
| Sliding past the selected plate | 503.78 µs | 61.66 µs |

For scale, sustained 10× with a 10 ms physics step allows **1 ms of wall time per step**. The Yatush scrape consumed roughly half that budget solely in witness selection. Profile the local triangles surviving the hull bound and the primitive tests per triangle there. Prebuilding the mesh tree can shorten initial load, but cannot explain this warmed measurement.

## Head-to-head on the actual wreck scans

For a like-for-like geometric query, both Ocean’s JavaScript BVH and native Parry 0.31.1 were given the same vertices, triangle indices, query points and 0.16 m maximum distance. The contract was the nearest point on a two-sided surface. We compared hit status and distance for each query, allowing equally near features to use different witnesses. Each wreck contributed 1,536 queries around both sides of randomly sampled faces and 1,536 clear of the site bounds.

| Static mesh and workload | Ocean JS | Native Parry f64 |
|---|---:|---:|
| Yatush, near hull | 13.62 µs | 1.58 µs |
| Satil, near hull | 16.31 µs | 1.32 µs |
| Yatush, clear | 62.3 ns | 35.2 ns |
| Satil, clear | 50.3 ns | 38.2 ns |

All 6,144 hit/miss classifications matched and maximum hit-distance difference was 3.56e−15 m. BVH construction and I/O were outside the timers. Parry’s near-hull advantage on these meshes is large enough to warrant a browser WASM comparison. This test includes differences in BVH implementation, memory representation, Node and native Rust. It exercises the nearest-point operation used by Piccard’s viewport. Hull–triangle contact collection, clipping and response are additional operations. The full scrape timings above cannot be divided by these ratios to predict a frame rate. [Build and run this comparison](tools/bench-wreck-parry/README.md)

### November 26 replay on the current meshes

A Linux hardware-cycle profile of the original short-range query attributed 54% of the samples to tree traversal and 17% to triangle projection. Ocean now stores static tree bounds contiguously, uses a closest-point triangle region test, and looks up short-range candidates in padded bins. A cap on the index size falls back to the tree for large or sparse meshes. Shape casts and unrestricted searches continue to traverse the tree.

On one pinned core, 12 alternating paired rounds gave these median times per near-hull point. In a separate head-to-head, native and WebAssembly Parry used the same meshes, two-sided surfaces and 0.16 m cutoff. The WebAssembly column includes one call from V8 per point.

| Wreck | Ocean before → after (paired) | Speedup | Ocean / Parry WASM / Parry native (same corpus) |
|---|---:|---:|---:|
| Yatush | 5.51 → 3.07 µs | 1.79× | 2.52 / 2.33 / 1.24 µs |
| Satil | 5.38 → 2.02 µs | 2.67× | 2.18 / 2.11 / 1.11 µs |

All 6,144 hit decisions agreed and the largest distance difference was 1.56 × 10⁻¹⁵ m.

The compound-hull replay checks which of Piccard’s 14 parts overlap a wreck at each pose. It uses the same vertices for the thruster ducts, the same plates and viewport sphere, and zero contact skin in both engines. Each wreck contributes 384 near poses and 384 clear poses with changing orientation. All **21,504 part decisions** agreed after correcting a finite-triangle test. The old test could report both skid bars touching an oblique wreck face even though a separating axis existed.

| Wreck | Near poses touching | Ocean JS, µs/near pose | Parry WASM, µs/near pose |
|---|---:|---:|---:|
| Yatush | 370 / 384 | 78.4 | 36.7 |
| Satil | 362 / 384 | 40.1 | 33.3 |

Both paths return the same overlap mask in one V8 process. Ocean uses its witness-producing narrow phase while Parry uses its boolean intersection routine. This makes early rejection of individual hull parts worth testing, particularly on Yatush. To compare sustained contact response, the next benchmark needs to match the cost of producing contact points and updating them as the hull slides.

In a separate Ocean-only sliding test, 36 paired batches of 240 poses measured the complete witness selection. The previous and corrected implementations took 167.0 and 149.1 µs/pose at Yatush, and 43.8 and 50.1 µs/pose at Satil on this shared host. The Satil result is a regression. Standalone and coupled FMUs both registered impacts and separated from both wrecks in the physical replay. [Replay instructions](tools/bench-wreck-parry/README.md)

## Native engine comparison

On the same desktop we replayed 521 binary64 queries per pair type with the real native APIs of four engines, including two Modelica compilers. Each timing is the median of seven samples of 200 passes, with engine order rotated and affinity fixed to logical CPU 17. The host had other work running. All five paths agreed with the analytic signed gap to within 1.42e−14 m.

| Native query path | Sphere–sphere, ns/query | Sphere–box, ns/query |
|---|---:|---:|
| MuJoCo 4.0.1 registered primitive routine | 23.9 | 34.6 |
| Parry 0.31.1 f64 contact dispatch | 87.6 | 139.1 |
| Ocean’s Rumoca compiler, native FMI 3 set/get | 114.1 | 143.0 |
| Coal 3.0.3 signed-distance dispatch | 220.7 | 264.5 |
| OpenModelica generated C and runtime | 2,383.5 | 3,806.4 |

Both Modelica entries evaluate the same geometry source. The Rumoca adapter sets the inputs and reads a signed gap through the public Model Exchange API. Each engine may calculate different auxiliary witnesses or route the query through a different dispatcher. Only the signed gap is compared. Native results do not include V8, WebAssembly, the GPU, collision response or broad-phase traversal. The large difference between the two Modelica compilers is concrete evidence that the translation and runtime matter for these primitives.

## What we already do well

| Part | Current approach | Consequence |
|---|---|---|
| Static scene | Each scan has a binary axis-aligned bounding box tree. It splits on the longest extent. A coarse body guard rejects whole sites. One transformed hull box finds overlapping leaves. | A sub in open water pays a small fixed cost. Concavities, cabin openings and two-sided plates survive when represented by the scan proxy. |
| Vehicle geometry | The viewport has a sphere query. Thin plates and circumscribed 24-sided cylinders use body-local geometry. Candidate triangles are transformed once and reused across sub parts. | Physics detail can be tuned independently of the render mesh. The cylinder approximation has a known maximum radial excess of about 0.86%. |
| Analytic primitives | The Modelica functions return a signed gap, unit normal, and two witness arms. Sphere–box has a face shortcut, a separate edge/corner path, and an interior convention. | A planner can ask for clearance, and a dynamics model can apply force at the actual contact point. The implementation needs no iterative convex solver for these pairs. |
| Response | The scan contact law accounts for translational and rotational effective mass at the witness. The reusable multibody path supplies opposite forces and accounts for their moment arms. | This preserves the mechanical distinction between a bow strike and a central push. It also lets us test geometry separately from force and angular response. |

Implementations are in [wreck selection](viewer/wreck-contact.mjs), [convex–triangle queries](viewer/convex-scan.mjs) and [Modelica scan contact](Wreck/scanContact.mo).

## What comparable engines and the literature suggest

**Parry and Rapier.** Parry exposes primitive queries, acceleration structures, shape casting and an explicit workspace for persistent manifolds. A tracked contact carries two local witnesses and feature IDs. Rapier consumes contacts in a separate dynamics solver. Ocean remembers a previous normal per triangle–part pair, then groups nearly parallel contacts irrespective of their positions. A triangle ID can change as a skid crosses a perfectly flat deck. Conversely, two distant skids can share a normal while supporting different loads. Track both features, position and normal. Retain representatives at the spatial extremes and verify support torque as a tilted hull comes to rest. Use an explicit accepted-step cache so repeated or rejected Modelica evaluations see the same geometry. [Parry manifold dispatch](https://docs.rs/parry3d/0.31.1/parry3d/query/trait.PersistentQueryDispatcher.html) · [Tracked contacts](https://docs.rs/parry3d/0.31.1/parry3d/query/struct.TrackedContact.html) · [Catto, Contact Manifolds](https://box2d.org/files/ErinCatto_ContactManifolds_GDC2007.pdf) · [Rapier pipeline](https://rapier.rs/docs/user_guides/rust/advanced_collision_detection/)

**MuJoCo.** MuJoCo finds prospective body pairs with sweep-and-prune and traverses body-local bounding hierarchies before detailed queries. It filters by geometry, body relationships, masks and margins. Its registered primitive functions provide a strong native performance baseline. Our explicitly wired body pairs save discovery work for small predictable scenes. Their shape rows still form a nested pair loop. For a moving fleet, benchmark direct enumeration against a short swept-box list first, varying ship count, geometry count and spatial clustering. Preserve the force activation range when pruning. In the reusable Modelica library the default cutoff is 50 smoothing lengths, or 5 mm. Ocean's scan selection margin is a separate 45 mm. [MuJoCo collision selection](https://mujoco.readthedocs.io/en/stable/computation/index.html#selection)

**Box and convex contacts.** A separating-axis test for two oriented boxes needs at most fifteen distinct candidate directions before degeneracies. Separation testing alone does not give the Euclidean gap on a diagonal or a stable face patch. Face clipping and edge–edge witnesses address different contact configurations. Box–box is currently unsupported in the reusable Modelica dispatch, even though the Ocean scan path can already test plates against triangles. For arbitrary convex shapes, GJK distance and a separate penetration/manifold procedure make sense. Keep doors and hollow wrecks as triangle collections or carefully chosen compounds. A convex hull of an entire wreck fills the interior. [Gottschalk, Lin & Manocha, OBBTree](https://www.cs.cornell.edu/courses/cs667/2005sp/readings/gottschalk96.pdf) · [Gilbert, Johnson & Keerthi](https://doi.org/10.1109/56.2083) · [Montanari et al., degenerate simplices](https://ora.ox.ac.uk/bookmarks/uuid%3A69c743d9-73de-4aff-8e6f-b4dd7c010907)

**Internal edges.** Cook triangle adjacency and constrain normals at smooth internal edges, preserving actual corners and boundaries. A two-triangle flat deck has no physical ridge along its diagonal. The sign guarantee for angle-weighted pseudonormals assumes a closed surface. Open and double-sided scan fragments need explicit sidedness and border handling. Replay the same skid across both triangulations of a flat plate and measure the spurious lateral impulse and yaw. A persistent normal alone can hide a legitimate crossing. [Parry two-sided edge handling](https://docs.rs/parry3d/0.31.1/parry3d/shape/struct.TriMeshFlags.html#associatedconstant.FIX_INTERNAL_EDGES_TWO_SIDED) · [Bærentzen & Aanæs](https://orbit.dtu.dk/en/publications/signed-distance-computation-using-the-angle-weighted-pseudonormal/)

## Recent papers with concrete experiments

| Work | What to borrow | Ocean experiment and limitation |
|---|---|---|
| Montaut et al., *GJK++* (IEEE Transactions on Robotics, 2024) | Tests acceleration strategies for general convex distance. The authors supply the implementation in Coal and report speedups up to 2× on their corpus. | Compare cold and coherent hull–hull queries on identical convex proxies with matching witness requirements. Sphere–box already has an analytic solution. [Paper, data and implementation](https://simple-robotics.github.io/publications/gjk-acceleration/) |
| Belgrod et al., *Time of Impact Dataset for Continuous Collision Detection and a Scalable Conservative Algorithm* (dataset, 2024) | Publishes full scenes, broad-phase and time-of-impact ground truth. Detecting the collision eventually can still give the wrong first-impact time. | Test a fast sub crossing a thin bulkhead and a rotating hoist. Track missed hits, conservative early hits, time error and excess candidates separately. Their primitive interpolation must match the benchmark contract. [Authors’ ground-truth archive](https://archive.nyu.edu/handle/2451/74508) |
| Yuan et al., *C⁵D* (ACM Transactions on Graphics, 2025) | Uses cone casting and conservative advancement for convex shapes undergoing constant affine motion. Suits a CPU worker. | Use motion-expanded bounds to identify risky pairs, then verify the time of impact only for those pairs. Rotating rigid-body trajectories can curve between the endpoints. Bound that error or subdivide before borrowing a guarantee. [Paper](https://doi.org/10.1145/3731151) · [Rigid-IPC on curved trajectories](https://ipc-sim.github.io/rigid-ipc/) |
| *Real-Time Triangle-SDF Continuous Collision Detection* (SCA, 2025) | Tests a triangle against a signed-distance field through the step and examines thin-feature failures. | Consider a field for a genuinely solid rock formation. A signed field for an open wreck requires a defensible interior and enough grid resolution to preserve hatches. Compare memory, false contacts and minimum traversable opening. [Author PDF](https://www.alexandremercieraubin.com/Work/papers/SCA25_TriSDF_ccd.pdf) |
| Chen et al., *Floating-Point Robustness in Parametric Surface Continuous Collision Detection* (SIGGRAPH, 2026) | Constructs rational ground truth by prescribing impact outcomes, including nearly degenerate cases. | Construct grazing, barely separated and exactly tangent tests at several scales and translations. Its parametric-surface solver has a different input domain from our triangle scans. The reusable contribution here is how to establish truth independently of engine agreement. [Authors’ publication](https://xw-c.github.io/publication/sig26/) |

## Where specialization could win

1. **Reduce candidate work before optimizing individual formulas.** Known body pairs and a fixed set of sub primitives allow precomputed local bounds, cached transforms and small fixed buffers. Compare direct loops against a second body-part hierarchy on both wreck patches. Record candidates per level, query p95/p99, and disagreements with an exhaustive oracle. On the standalone manta, conservative per-capsule bounds already improved the nearby mixed WebAssembly workload by about 24% with identical wrenches. Its direct-contact cost was roughly unchanged. [Manta benchmark](PERFORMANCE.md)
2. **Make the compiler exploit fixed dimensions.** In a native OpenModelica sphere–box profile, `calc_base_index_va` consumed 22.0% of sampled CPU time, `generic_array_get` 14.3%, and `GC_malloc_kind` 8.4% (2,012 samples). The generated C uses runtime array operations for three-vectors. Scalar replacement and fixed-shape code generation are worth testing on identical Modelica source. The browser uses Rumoca, so its compiler and WebAssembly target require their own measurements.
3. **Spend continuous detection selectively.** When relative translation plus each body's angular travel at its extremities can cover a thin feature during a step, expand bounds conservatively and confirm a time of impact. A broad-phase candidate alone cannot prevent tunneling. Cache static geometry across steps and invalidate pose-dependent caches on respawn, ownership handoff and asset replacement.
4. **Measure stable contacts and simulation throughput together.** Test a sub scraping a bulkhead, resting across two rails, crossing a triangle seam and moving through an open hatch. Measure minimum clearance, max penetration, angular velocity, net impulse, sustained torque, solver work and full-step times. For engine comparisons use the same proxies, precision, sidedness, margins, motion and requested outputs. Report tree construction and warm/cold traversals separately.

Coal is the next reference for general convex distance and is included in the native primitive comparison. Jolt is a useful additional reference for real-time compound-body casts and contact persistence. Tight Inclusion or the published time-of-impact dataset gives a correctness reference for thin-plate crossings. The classification task, signed-distance query, time-of-impact query and full dynamics step should each have their own table. [Coal](https://github.com/coal-library/coal) · [Jolt Physics](https://github.com/jrouwe/JoltPhysics) · [Tight Inclusion](https://continuous-collision-detection.github.io/)

## Posed diver against a locally planar seabed

The diver replay uses the live ScubaDiver FMU to pose the dressed collision skin during glide, forward kick, turn, pitch, roll and a mixed command. The 1,883 triangles reference 807 unique vertices. For each of six poses it rotates the mesh into three different terrain frames and changes the clearance through −60, −22, −6, +5, +24 and +85 mm. Each engine receives the same 108 interleaved queries.

The comparison requests the minimum signed distance from the posed surface to a half-space. Its minimum lies at a referenced vertex. A convex hull of the same points therefore gives the exact same gap for this particular query, including penetration. Parry and Coal use their convex-hull/half-space queries. MuJoCo uses its compiled mesh geom and plane through `mj_geomDistance`. The Modelica reference scans all posed vertex heights using the native function emitted by Rumoca. Vertex projection, hull construction, model compilation and fixture I/O occur before timing. Each measurement is the median of seven batches of 128 complete replays after two warm-up batches.

| Native signed gap | Median per query | Maximum absolute gap error |
|---|---:|---:|
| MuJoCo 4.0.1 | 196 ns | 30 nm |
| Parry 0.31.1, f64 | 219 ns | 5.6 × 10⁻¹⁷ m |
| Coal 3.0.3 | 402 ns | 5.6 × 10⁻¹⁷ m |
| Rumoca, full 807-vertex Modelica scan | 2,387 ns | 5.6 × 10⁻¹⁷ m |

The production JS replay uses the original skin topology against two finite terrain triangles. It refits all link BVHs, checks self-contact, clips terrain contact patches and selects a link and witness. With start and end poses equal, it agreed on all 54 contacts and 54 separations. Its maximum penetration error was 5.6 × 10⁻¹⁷ m. Median elapsed time per pose was **0.911 ms**, including **0.292 ms** for a separately timed refit alone. Refit plus self-contact with an empty scene took **0.397 ms**. These measurements exclude skinning, FMU integration, force response and frame rendering.

A flat terrain patch permits a fast support query to reject separated poses. An accepted contact still needs the terrain triangle boundary, link and witness. Verify that any proposed fast path preserves those outputs on shared terrain edges and fast-moving fins. The timings here do not cover concave wrecks, collisions between limbs, curved motion or a general time-of-impact contract across the four engines.

Reproduce on a single core with the three native toolchains, Rust, Node and Rumoca. The recorded run used an AMD Ryzen 9 5950X, Node 24, `-O3` native builds and the 18-DOF wasm plant.

```sh
COAL_DIR=/path/to/coal/prefix MUJOCO_DIR=/path/to/mujoco/sdk RUMOCA=/path/to/rumoca \
    tools/collision-benchmark/diver/build.sh /tmp/diver-plane
taskset -c 6 node tools/collision-benchmark/diver/replay.mjs /tmp/diver-plane /path/to/fmi3
```

## MicroDuck walking contact and dry diver dynamics at 64 instances

MicroDuck’s paired articulated benchmark evaluates **eight moving foot contacts and all 20 generalized accelerations** at each step. On eight physical CPU cores, Rumoca advanced all 64 robots at **1.82× real time**. Native MuJoCo with the same compliant foot law reached **20.24×**. Isolating the feet and three centre-of-mass coordinates reversed the ordering slightly. This comparison identifies the articulated solve as the larger performance opportunity for this small robot.

| 64 independent instances | Step | Rumoca, 1 core | MuJoCo, 1 core | Rumoca, 8 cores | MuJoCo, 8 cores | Real time per instance, 8 cores (Rumoca / MuJoCo) |
|---|---:|---:|---:|---:|---:|---:|
| MicroDuck, floating base + 14 driven hinges, active soles | 1 ms | 16,282 | 164,770 | 116,238 | 1,295,379 | 1.82× / 20.24× |
| MicroDuck, recorded articulation + three solved translations, active soles | 1 ms | 1,935,537 | 1,855,000 | 14,523,958 | 13,644,900 | 226.94× / 213.20× |
| Dry diver, floating base + 14 driven hinges, no collision | 10 ms | 16,698 | 171,881 | 122,047 | 1,374,562 | 19.07× / 214.78× |

Throughput columns count aggregate independent physics steps per wall second. Per-instance real time equals throughput × step duration / 64. Each worker runs a static share of complete trajectories. The benchmark times native CPU computation and state integration. It excludes compilation, fixture preparation, rendering, networking, policy inference, and result validation. The reported run used double precision, GCC 15.3.0, `-O3 -DNDEBUG -ffp-contract=off`, MuJoCo 4.0.1, Rumoca `7107c18`, and modelica_models `68818e8` on a shared Ryzen 9 5950X. One thread used CPU 8. Eight threads were bound to physical cores 8–15. Each engine received one warm-up, followed by alternating run order. The articulated duck median uses five measurements. The other medians use seven. On eight cores the measured articulated-duck ranges were 137.1–140.2 ms Rumoca and 12.0–12.8 ms MuJoCo per 16,000 steps. [MultiBodyLie source](https://github.com/CogniPilot/modelica_models/blob/68818e807a347f325f35560ce87c7980bdbeefe9/MultiBodyLie/package.mo)

### Articulated MicroDuck

The fixture comes from the actual four-second, 50 Hz pretrained Modelica walk-and-turn recording. It starts 64 separate 250 ms windows throughout the gait. Each lane takes its root pose and 14 moving joint angles and velocities from that window. Root velocity comes from adjacent recorded poses. Each hinge receives its measured motor torque, linearly interpolated at 1 ms. Both engines integrate their own translation, orientation and joints using semi-implicit Euler and the same quaternion update. After initialization, the recording supplies torque only. The jaw is included in the imported head inertia. The 15 rigid bodies total 0.73724318 kg. The robot retains its measured joint mounts, axes, centre-of-mass offsets and full inertia tensors. Each hinge has 0.00157322268 kg·m² of reflected inertia. Gravity is 9.80665 m/s². [Robot definition](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/robot.xml) · [Recorded gait](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/recordings/pretrained-walk.json)

Each sole has four 3 mm spheres on a 70 × 40 mm rectangle. Both engines regenerate each sphere’s world position and point velocity on the moving foot and evaluate its distance to a level, rigid floor. The authored compliant law uses 10,000 N/m stiffness per sphere, 0.5 s/m damping, 0.8 Coulomb friction, 0.1 mm penetration smoothing and 0.01 m/s tangential regularization. The native baseline obtains every candidate distance from MuJoCo’s plane/sphere narrow phase, then applies the same normal and friction force law in C. Rumoca compiles the upstream Modelica `groundWrench` function directly. Both use MuJoCo’s forward kinematics and site Jacobians to obtain the sole velocities and project the resulting force and torque onto generalized coordinates. Rumoca computes accelerations with MultiBodyLie’s CRBA/RNEA kernel and dense Cholesky solve. MuJoCo uses its own mass matrix, factorization, bias and acceleration routines. The matched law replaces the stock MuJoCo constraint solver. Other body or self collisions, electrical/thermal dynamics, joint stops, and closed-loop policy feedback are outside this workload. The published browser demo also offers a softer all-body contact configuration. [Sole geometry and motor parameters](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/sources/MicroduckComponents.mo) · [Contact law](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/sources/GroundContact.mo) · [Browser configuration](https://github.com/CogniPilot/microduck_web/blob/f567b8c452d5c759436a568ffad5632dc1046916/site/README.md)

Across 16,000 integrated steps the maximum inter-engine differences were 6.63 × 10⁻¹³ m in root position, 9.83 × 10⁻¹² rad in root orientation, 8.05 × 10⁻¹² rad in hinge angle and 3.15 × 10⁻⁹ N in foot load. The largest difference across the 20 acceleration components was 5.54 × 10⁻⁶ (m/s² or rad/s²). Using a 0.1 N support threshold, 3,431 steps had only left support, 3,730 only right, 5,016 both, and 3,823 neither. Mean normal load was 0.952 bodyweights. The lowest trunk was 72.5 mm above the floor and the largest tilt was 33.25°. Mean endpoint horizontal travel was 38.83 mm, versus 22.51 mm in the original windows. The short torque replays establish inter-engine agreement under active contact. Their measured drift limits conclusions about autonomous walking over longer horizons.

### Long foot-contact replay and dry diver

The reduced MicroDuck test spans 3.5 seconds per lane with 64 staggered start times, 7 ms apart, and initial height perturbations from −0.315 to +0.315 mm. Its 15 measured body transforms provide the relative path of both soles around the mass-weighted centroid. Relative positions interpolate linearly and orientations interpolate along quaternion geodesics. Attitude and articulation follow the recording. Three translations evolve freely in response to the two feet and gravity. Joint limits, rotational dynamics and motor torques do not enter this reduction. Both engines independently integrate the centroid and compare every foot wrench and state. With identical inputs, peak wrench discrepancies were 2.14 × 10⁻¹⁴ N and 8.89 × 10⁻¹⁶ N·m. Across the independent rollouts root positions differed by at most 8.30 nm per axis. Maximum penetration reached 3.42 mm. Mean support was 0.99976 bodyweights. The centroid travelled 325 mm horizontally on average compared with 292 mm in the capture, with 16.7 mm RMS three-dimensional trajectory error.

The dry diver extends the established native 14-hinge fixture to 64 independently initialized trajectories of 100 steps each. Both engines receive identical time-varying body-frame root and hinge efforts, angular and linear velocities, initial quaternions and initial joint positions. They integrate at 10 ms using the same semi-implicit and quaternion update. This isolates free-body inertial coupling, excluding gravity, water, muscles, collisions and training policies. Peak root position difference was 7.78 × 10⁻¹⁶ m, hinge difference 4.62 × 10⁻¹⁴ rad and generalized acceleration difference 3.19 × 10⁻¹². See the posed diver replay above for a separate seabed collision measurement. [Dry diver fixture](scripts/benchmarks/diver-dynamics/README.md)

### Reproduction and Newton/Warp coverage

The wrapper exports fixture data with Node, compiles the unmodified Modelica functions with Rumoca, and runs native C using MuJoCo’s shared library. The public inputs are pinned to microduck_web `f567b8c`. The runner verifies their SHA-256 hashes and exits unsuccessfully on a numerical disagreement or missing walking contacts.

```sh
export MICRODUCK_WEB=/path/to/microduck_web
export RUMOCA=/path/to/rumoca
export MODELICA_MODELS=/path/to/modelica_models
OMP_NUM_THREADS=1 taskset -c 8 tools/collision-benchmark/microduck/run.sh /path/to/mujoco
OMP_NUM_THREADS=8 OMP_PLACES=cores OMP_PROC_BIND=true \
  taskset -c 8-15 tools/collision-benchmark/microduck/run.sh /path/to/mujoco
```

A same-work Newton/Warp GPU result remains unmeasured. Newton’s documented minimum runtime includes Python and Warp. Its example benchmark and ASV suite launch Python workloads. No standalone native Newton runner for this articulated tree, torque recording and foot law was available for the Python-free comparison. [Newton installation](https://newton-physics.github.io/newton/latest/guide/installation.html) · [Newton benchmark entry points](https://newton-physics.github.io/newton/latest/guide/performance.html)
