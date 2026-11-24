#!/usr/bin/env bash
set -euo pipefail
case_dir=$(realpath "${1:?Pass a prepared open-water case directory}")
image=opencfd/openfoam-default@sha256:1ba02114b1c025c370f2e269a07677c16c9bea8d990fcd75ac8378aff9d41b50
docker run --rm --user "$(id -u):$(id -g)" -v "$case_dir:/case" "$image" bash -ec '
  cd /case
  blockMesh > log.blockMesh 2>&1
  snappyHexMesh -overwrite > log.snappyHexMesh 2>&1
  topoSet > log.topoSet 2>&1
  checkMesh > log.checkMesh 2>&1
  grep -q "Mesh OK" log.checkMesh
  simpleFoam > log.simpleFoam 2>&1
  postProcess -latestTime -func writeCellCentres > log.centres 2>&1
  foamToVTK -latestTime -ascii -legacy -fields "(p U)" > log.vtk 2>&1
'
