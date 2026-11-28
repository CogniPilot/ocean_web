#!/usr/bin/env bash
# Apply the marine model patches used by the source and browser builds.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root/.deps/marine-models"
# Backport modelica_models PR #44 (6f9a0f3) until the next library pin.
for patch in \
  "$root/patches/marine-forestay-crossing.patch" \
  "$root/patches/marine-wreck-sensor-mounts.patch" \
  "$root/patches/marine-sonar-patch-width.patch" \
  "$root/patches/marine-wake-row-updates.patch" \
  "$root/patches/marine-triangle-convex.patch" \
  "$root/patches/marine-shroud-row-bounds.patch"; do
  if ! git apply --reverse --check "$patch" 2>/dev/null; then
    git apply "$patch" || git apply --reverse --check "$patch"
  fi
done
