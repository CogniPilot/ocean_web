#!/usr/bin/env bash
set -euo pipefail

WHALER_ASSET_SOURCE=$(cd "$(dirname "$0")" && pwd)
export WHALER_ASSET_SOURCE
whaler_build=$(mktemp -d)
trap 'rm -rf "$whaler_build"' EXIT
export WHALER_CAD_MESH="$whaler_build/cad-mesh.json"

"${FREECAD_CMD:-FreeCADCmd}" -c <<'PYTHON'
import os, runpy
_ = runpy.run_path(os.path.join(os.environ["WHALER_ASSET_SOURCE"], "tessellate_freecad.py"), run_name="__main__")
exit()
PYTHON
test -s "$WHALER_CAD_MESH"

"${BLENDER:-blender}" --background "$WHALER_ASSET_SOURCE/BostonWhaler190.blend" \
  --python-exit-code 1 --python "$WHALER_ASSET_SOURCE/export_blender.py"
