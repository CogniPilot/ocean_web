# Point and compound-hull collision queries on the Red Sea wrecks

This optional benchmark compares Ocean Web’s production JavaScript triangle BVH with Parry 0.31.1’s native double-precision `TriMesh` on the shipped Yatush and Satil collision proxies. Each query asks for the nearest point on either side of the surface within 0.16 m. The runner checks every hit/miss and unsigned distance to a tolerance of 10 nm. Points on a shared edge can have several equally valid normals, so normals are outside this test.

From the repository root, use Node and a recent stable Rust toolchain with Cargo.

```sh
cd tools/bench-wreck-parry
cargo build --locked --release
node compare.mjs target/release/wreck-scan-parry-query
```

If you use `CARGO_TARGET_DIR`, pass the executable from that directory. The runner reads both meshes directly from the repository, applies the same degenerate-triangle filter to both implementations and deletes its temporary fixtures on exit.

For each wreck, 1,536 hull queries sample triangles uniformly by face index, then sample points uniformly within each triangle and displace them up to 0.264 m to either side. Another 1,536 queries lie 1–7 m outside a face of the mesh bounding box. A fixed seed makes the corpus repeatable. The JSON output gives the hit count, largest distance discrepancy in metres, and median elapsed nanoseconds per query over five timed batches after two warm-up batches. Each batch queries the group ten times. Timings exclude BVH construction, I/O and the correctness pass. They compare Node with optimized native Rust on these meshes. They do not predict browser WASM throughput or a whole-frame speedup.

To compare production JavaScript with Parry running in the same V8 process, build the optional WebAssembly library and pass it as the second argument.

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --locked --lib --target wasm32-unknown-unknown
node compare.mjs target/release/wreck-scan-parry-query target/wasm32-unknown-unknown/release/parry_wreck_wasm.wasm
```

The WASM timing includes one JS-to-WASM call per point. Mesh upload and tree construction occur before timing. Both Parry adapters return distance, while Ocean also computes a contact position and normal. The correctness pass checks the short-range spatial index against the unrestricted Ocean tree and verifies both against Parry.

With the WASM argument, the same command also replays 384 near and 384 clear Piccard poses at each wreck. Both adapters use the shipped hull dimensions, identical 24-sided duct polygons, two-sided wreck triangles and zero contact skin. Each returns a 14-bit mask. A differing bit fails the run and identifies the site and pose. The timer includes traversal, shape tests and one call into WASM per pose for Parry. Ocean computes witnesses as part of its shape tests, while Parry uses its intersection API. This measures the overlap query. Contact manifold generation, time of impact and force integration require separate tests.
