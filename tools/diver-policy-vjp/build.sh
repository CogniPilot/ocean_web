#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
dest="${1:-$root/build/diver-policy-vjp}"
mkdir -p "$dest"
"${RUMOCA:-rumoca}" compile "$here/DiverPolicyScore.mo" -m DiverPolicyScore --emit solve-json -o "$dest/score.json"
"${RUMOCA:-rumoca}" compile "$here/DiverOptimizer.mo" -m DiverOptimizer --emit solve-json -o "$dest/optimizer.json"
target="${CARGO_TARGET_DIR:-$root/build/diver-policy-cargo}"
cargo build --locked --target-dir "$target" --manifest-path "$here/Cargo.toml"
install -m 755 "$target/debug/diver-policy-vjp" "$dest/diver-policy-vjp"
"$dest/diver-policy-vjp" --verify
