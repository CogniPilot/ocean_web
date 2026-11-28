#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd "$(dirname "$0")" && pwd)
repo_dir=$(cd "$source_dir/../.." && pwd)
output_dir=$(mktemp -d)
trap 'rm -rf -- "$output_dir"' EXIT

export CRUISER_WINDSHIELD_SOURCE="$source_dir"
export CRUISER_WINDSHIELD_OUTPUT="$output_dir"
freecad=${FREECAD_CMD:-FreeCADCmd}
blender=${BLENDER:-blender}

"$freecad" -c <<'PY'
import os
from pathlib import Path
try:
    exec((Path(os.environ["CRUISER_WINDSHIELD_SOURCE"]) / "build-cad.py").read_text())
except Exception:
    import traceback
    traceback.print_exc()
    raise SystemExit(1)
PY
test -s "$output_dir/windshield-tessellation.json"
"$blender" --background --python-exit-code 1 --python "$source_dir/export-blender.py"
cp "$output_dir/CabinCruiserWindshield.FCStd" "$output_dir/CabinCruiserWindshield.blend" "$source_dir/"
cp "$output_dir/cabin-cruiser-windshield.glb" "$repo_dir/viewer/assets/"
