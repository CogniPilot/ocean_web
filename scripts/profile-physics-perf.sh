#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root=${1:-build/pages}
role=${2:-sailing}
out=$(realpath -m "${3:-build/physics-profiles/$role}")
ticks=${4:-400}
if (( $# > 4 )); then shift 4; else set --; fi
mkdir -p "$out"
pipes=$(mktemp -d)
trap 'rm -rf -- "$pipes"' EXIT
mkfifo "$pipes/control" "$pipes/ack"
export OCEAN_PERF_CONTROL="$pipes/control" OCEAN_PERF_ACK="$pipes/ack"
export OCEAN_PHYSICS_TRACE="$out/trace.json"
perf_bin=${PERF:-perf}
node_bin=${NODE:-node}
wasm_flags=(--no-liftoff)
# Eager compilation of these larger guests can leave Node's module open
# unsettled before warmup. Keep optimized code and compile their functions lazily.
lazy_default=0
if [[ $role == submarine || $role == sailing ]]; then lazy_default=1; fi
if [[ ${OCEAN_WASM_LAZY:-$lazy_default} != 1 ]]; then wasm_flags+=(--no-wasm-lazy-compilation); fi
"$perf_bin" record -o "$out/perf.data" -e cycles:u -k mono -F 499 --no-inherit --mmap-pages 16 \
    --delay=-1 --control="fifo:$pipes/control,$pipes/ack" \
    -- "$node_bin" --perf-prof --perf-prof-path="$out" --logfile="$out/v8.log" "${wasm_flags[@]}" \
    scripts/profile-physics.mjs "$root" "$role" "$ticks" "$@" | tee "$out/timing.json"
"$perf_bin" inject --jit -i "$out/perf.data" -o "$out/perf.jit.data"
"$perf_bin" report -i "$out/perf.jit.data" --stdio --no-children --no-call-graph \
    --sort symbol --percent-limit 1 > "$out/hotspots.txt"
