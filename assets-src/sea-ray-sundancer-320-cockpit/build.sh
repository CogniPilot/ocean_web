#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd "$(dirname "$0")" && pwd)
repo_dir=$(cd "$source_dir/../.." && pwd)
output_dir=$(mktemp -d)
trap 'rm -rf -- "$output_dir"' EXIT
export SUN_DANCER_COCKPIT_SOURCE="$source_dir"
export SUN_DANCER_COCKPIT_OUTPUT="$output_dir"

"${FREECAD_CMD:-FreeCADCmd}" -c <<'PY'
import os
from pathlib import Path
try:
    exec((Path(os.environ["SUN_DANCER_COCKPIT_SOURCE"]) / "build-cad.py").read_text())
except Exception:
    import traceback
    traceback.print_exc()
    raise SystemExit(1)
PY
test -s "$output_dir/cockpit-tessellation.json"
"${BLENDER:-blender}" --background --python-exit-code 1 --python "$source_dir/export-blender.py"
cp "$output_dir/SeaRaySundancer320Cockpit.FCStd" "$output_dir/SeaRaySundancer320Cockpit.blend" "$source_dir/"
cp "$output_dir/sea-ray-sundancer-320-cockpit.glb" "$repo_dir/viewer/assets/"
