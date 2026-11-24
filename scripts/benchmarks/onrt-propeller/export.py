"""Export solved OpenFOAM fields for the WebGL pressure and wake viewer."""
import argparse
import json
from pathlib import Path

import numpy as np
from vtkmodules.util.numpy_support import vtk_to_numpy
from vtkmodules.vtkCommonDataModel import vtkStaticCellLocator
from vtkmodules.vtkFiltersCore import vtkTriangleFilter

from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("case", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--lattice", type=Path, help="directory containing the solved Rumoca volume and force history")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
meta = json.loads((args.case / "case.json").read_text())
foam = args.case / "run.foam"
foam.touch()
reader = vtkOpenFOAMReader()
reader.SetFileName(str(foam))
reader.UpdateInformation()
iteration = int(reader.GetTimeValues().GetRange()[1])
if not iteration:
    raise ValueError("no solved OpenFOAM field is available")
reader.EnableAllPatchArrays()
reader.SetTimeValue(iteration)
reader.Update()
out = reader.GetOutput()
it = out.NewIterator()
it.InitTraversal()
blocks = {}
while not it.IsDoneWithTraversal():
    blocks[it.GetCurrentMetaData().Get(out.NAME())] = it.GetCurrentDataObject()
    it.GoToNextItem()
volume, blade = blocks["internalMesh"], blocks["propeller"]
D = meta["diameter_m"]
tri = vtkTriangleFilter()
tri.SetInputData(blade)
tri.Update()
surface = tri.GetOutput()
points = vtk_to_numpy(surface.GetPoints().GetData())
indices = vtk_to_numpy(surface.GetPolys().GetConnectivityArray())
pressure = vtk_to_numpy(surface.GetPointData().GetArray("p")) * meta["rho_kg_m3"] / 1000

locator = vtkStaticCellLocator()
locator.SetDataSet(volume)
locator.BuildLocator()
cell_velocity = vtk_to_numpy(volume.GetCellData().GetArray("U"))
def at(point):
    index = locator.FindCell(point)
    return cell_velocity[index] if index >= 0 else None

if args.lattice:
    lattice = json.loads((args.lattice / "rumoca-volume.json").read_text())
    dims = np.array(lattice["dims"])
    origin = np.array(lattice["firstCenter_m"])
    dx = lattice["spacing_m"]
    grid = np.fromfile(args.lattice/"rumoca-volume.bin",dtype="<f4").reshape(*dims[::-1],4)
    if lattice["J"] != meta["J"] or lattice["rpm"] != meta["rpm"]:
        raise ValueError("case speed differs from the lattice run")
    def interpolate(query):
        loc = (np.array(query)-origin)/dx
        if np.any(loc<0) or np.any(loc>=dims-1):
            return None
        i,j,k = np.floor(loc).astype(int)
        frac = loc-[i,j,k]
        weights = np.array([1-frac,frac])
        return np.einsum("k,j,i,kjiu->u",weights[:,2],weights[:,1],weights[:,0],grid[k:k+2,j:j+2,i:i+2])
    def at(point):
        v = interpolate(point)
        return v[:3] if v is not None else None
    # The lattice surface rotates in the laboratory frame. Align it with the
    # exported instantaneous field even when the run ends between blade passes.
    loads=np.genfromtxt(args.lattice/"rumoca-loads.csv",delimiter=",",names=True)
    angle=-2*np.pi*float(loads[-1]["revolutions"])
    c,s=np.cos(angle),np.sin(angle)
    points=points @ np.array([[1,0,0],[0,c,s],[0,-s,c]])
    # Sample nearby lattice pressure at its vertices.
    pressure = np.array([interpolate(p)[3] for p in points])/1000

# Cross-sections sample the volume solution in the stationary frame.
offsets = [-.75, -.25, 0, .25, .5, 1, 1.5, 2, 3]
n = 49
y, z = np.meshgrid(np.linspace(-.8,.8,n), np.linspace(-.8,.8,n))
positions = np.array([np.column_stack((np.full(y.size,x), y.ravel(), z.ravel())) for x in offsets])
speeds = []
for pos in positions.reshape(-1,3)*D:
    u = at(pos)
    speeds.append(np.linalg.norm(u) if u is not None else -1)
speeds = np.array(speeds)
# Midpoint integration through the native cell velocity, with a step shorter
# than the finest cell. Stop when a trajectory reaches solid or the boundary.
segments = []
num_paths = 0
ds = .008*D
for radius in (.16,.32,.47,.59):
    for azimuth in np.arange(12)*np.pi/6:
        point = D*np.array([-1.25, radius*np.cos(azimuth), radius*np.sin(azimuth)])
        path = [point]
        for step in range(600):
            u = at(point)
            if u is None or np.linalg.norm(u)<1e-5:
                break
            mid = at(point+.5*ds*u/np.linalg.norm(u))
            if mid is None or np.linalg.norm(mid)<1e-5:
                break
            point = point+ds*mid/np.linalg.norm(mid)
            if step%3==2:
                path.append(point)
        if len(path)>1:
            num_paths += 1
            segments.extend(np.stack((path[:-1],path[1:]),axis=1).reshape(-1,3))
arrays = {}
with (args.output / "flow.bin").open("wb") as binary:
    for key, a, dtype in [
        ("blade",points/D,"<f4"),("pressure",pressure,"<f4"),("indices",indices,"<u4"),
        ("speed",speeds,"<f4"),("lines",np.asarray(segments)/D,"<f4")
    ]:
        a = np.asarray(a, dtype=dtype).ravel()
        if not np.all(np.isfinite(a)):
            raise ValueError("nonfinite field: "+key)
        arrays[key] = [binary.tell(),a.size]
        binary.write(a.tobytes())
def load_mean(name):
    history = np.loadtxt(args.case/"postProcessing/shaftLoads/0"/(name+".dat"))
    return float(history[history[:,0]<=iteration][-20:,1].mean())
shaft = meta["rpm"]/60
kt = -load_mean("force")/(meta["rho_kg_m3"]*shaft**2*D**4)
kq = load_mean("moment")/(meta["rho_kg_m3"]*shaft**2*D**5)
meta.update(arrays=arrays,iteration=iteration,cells=volume.GetNumberOfCells(),sliceOffsets=offsets,
            samples=n,sliceHalfWidth=.8,kt=kt,kq=kq,
            pressureLimit=float(np.quantile(np.abs(pressure),.99)),
            speedLimit=float(np.quantile(speeds[speeds>=0],.99)),
            streamlines=num_paths)
if args.lattice:
    last=loads[-lattice["stepsPerRev"]:]
    meta.update(solver="Rumoca",wallTreatment=lattice.get("wallTreatment","volume-no-slip"),cells=int(np.prod(dims)),kt=float(last["KT"].mean()),
        kq=float(last["KQ"].mean()),steps=lattice["steps"],revolutions=float(loads[-1]["revolutions"]),
        cellsPerDiameter=round(D/dx))
else:
    meta["solver"]="OpenFOAM"
(args.output/"flow.json").write_text(json.dumps(meta,indent=2)+"\n")
print(f"{meta['solver']}, {meta['cells']} cells, KT {meta['kt']:.4f}, KQ {meta['kq']:.4f}, {meta['streamlines']} streamlines")
