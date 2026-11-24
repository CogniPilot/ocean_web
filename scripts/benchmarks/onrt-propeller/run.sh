#!/usr/bin/env bash
set -euo pipefail
case_dir=$(realpath "${1:?Pass a prepared open-water case directory}")
image=opencfd/openfoam-default@sha256:1ba02114b1c025c370f2e269a07677c16c9bea8d990fcd75ac8378aff9d41b50
device_args=()
if grep -q 'solver OpenCL;' "$case_dir/system/fvSolution"; then
  image=onrt-openfoam-opencl:2412
  docker build -t "$image" "$(dirname "$0")/openfoam-gpu"
  device_args=(--device "${OPENFOAM_GPU_DEVICE:-nvidia.com/gpu=all}")
fi
docker run --rm "${device_args[@]}" --user "$(id -u):$(id -g)" -v "$case_dir:/case" "$image" bash -ec '
  cd /case
  blockMesh > log.blockMesh 2>&1
  snappyHexMesh -overwrite > log.snappyHexMesh 2>&1
  if [ -f constant/dynamicMeshDict ]; then
    checkMesh > log.checkMesh 2>&1
    grep -q "Mesh OK" log.checkMesh
    if grep -q "solver OpenCL;" system/fvSolution; then
      export CUDA_CACHE_PATH=/case/.cuda-cache VIENNACL_CACHE_PATH=/case/.viennacl-cache
      mkdir -p "$CUDA_CACHE_PATH" "$VIENNACL_CACHE_PATH"
      pimpleFoam > log.transient 2>&1
      exit
    fi
    decomposePar > log.decompose 2>&1
    mpirun -np 4 pimpleFoam -parallel > log.transient 2>&1
    reconstructPar -newTimes > log.reconstruct 2>&1
    exit
  fi
  topoSet > log.topoSet 2>&1
  checkMesh > log.checkMesh 2>&1
  grep -q "Mesh OK" log.checkMesh
  simpleFoam > log.simpleFoam 2>&1
  postProcess -latestTime -func writeCellCentres > log.centres 2>&1
  foamToVTK -latestTime -ascii -legacy -fields "(p U)" > log.vtk 2>&1
'
