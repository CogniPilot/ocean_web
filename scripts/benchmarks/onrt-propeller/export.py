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

# Uniform display samples, in the same inertial frame as the solved velocity.
# X varies fastest in the exported arrays. Keep an explicit fluid-domain mask.
from vtkmodules.util.numpy_support import numpy_to_vtk
from vtkmodules.vtkCommonCore import vtkPoints
from vtkmodules.vtkCommonDataModel import vtkPolyData, vtkDataObject
from vtkmodules.vtkFiltersCore import vtkProbeFilter, vtkCellDataToPointData
from vtkmodules.vtkFiltersGeneral import vtkGradientFilter

resolution = 20
nx, ny, nz = 81, 33, 33
grid_origin = np.array([-1., -.8, -.8])
zz, yy, xx = np.indices((nz, ny, nx))
query = (np.column_stack((xx.ravel(), yy.ravel(), zz.ravel())) / resolution + grid_origin) * D
if args.lattice:
    # The Rumoca rotor is phase-shifted from the stationary OpenFOAM blade mesh.
    # Sample that mesh in its original orientation to mask out the solid.
    unrotated = query @ np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    valid = np.array([locator.FindCell(p) >= 0 for p in unrotated])
    gradients = [np.gradient(grid[...,i], dx) for i in range(3)]  # z, y, x
    curl = np.stack((gradients[2][1]-gradients[1][0], gradients[0][0]-gradients[2][2],
                     gradients[1][2]-gradients[0][1]), axis=-1)
    def sample_lattice(values):
        address = (query-origin)/dx
        assert np.all(address >= 0) and np.all(address < dims-1)
        base = np.floor(address).astype(int)
        frac = address-base
        result = np.zeros((len(query),values.shape[-1]))
        for offset in np.ndindex(2,2,2):
            i,j,k = (base+offset).T
            weight = np.prod(np.where(offset,frac,1-frac),axis=1)
            result += weight[:,None]*values[k,j,i]
        return result
    samples = sample_lattice(grid)
    velocity, fluid_pressure = samples[:,:3], samples[:,3]/1000
    rotation = sample_lattice(curl)
else:
    # Differentiate the stationary-frame velocity on the native unstructured mesh
    # before resampling. Differentiating nearest-cell display values creates spikes.
    derivative = vtkGradientFilter()
    derivative.SetInputData(volume)
    derivative.SetInputScalars(vtkDataObject.FIELD_ASSOCIATION_CELLS, 'U')
    derivative.ComputeGradientOff()
    derivative.ComputeVorticityOn()
    interp = vtkCellDataToPointData()
    interp.SetInputConnection(derivative.GetOutputPort())
    vtk_points = vtkPoints()
    vtk_points.SetData(numpy_to_vtk(query,deep=True))
    cloud = vtkPolyData()
    cloud.SetPoints(vtk_points)
    probe = vtkProbeFilter()
    probe.SetInputData(cloud)
    probe.SetSourceConnection(interp.GetOutputPort())
    probe.SetCellLocatorPrototype(vtkStaticCellLocator())
    probe.Update()
    sampled = probe.GetOutput().GetPointData()
    def values(key):
        return vtk_to_numpy(sampled.GetArray(key))
    valid = values('vtkValidPointMask').astype(bool)
    velocity, rotation = values('U'), values('Vorticity')
    fluid_pressure = values('p')*meta['rho_kg_m3']/1000
fields = {'velocity': np.linalg.norm(velocity,axis=1), 'fluidPressure': fluid_pressure,
          'vorticity': np.linalg.norm(rotation,axis=1)}
if not args.lattice:
    fields['turbulenceK'] = values('k')
# Quantize each field independently. Zero is reserved for masked samples.
# The full numerical range is retained; the color scale uses the 99th percentile.
field_meta = {}
with (args.output/'volume.bin').open('wb') as output:
    for key, data in fields.items():
        sample = data[valid]
        if not np.all(np.isfinite(sample)):
            raise ValueError('Nonfinite volume field: '+key)
        low, high = float(sample.min()), float(sample.max())
        step = (high-low)/65534 or 1.
        packed = np.zeros(len(query),dtype='<u2')
        packed[valid] = 1+np.rint((sample.astype(float)-low)/step).astype(np.uint16)
        field_meta[key] = dict(offset=output.tell(), min=low, max=high, step=step,
                               colorLimit=float(np.quantile(np.abs(sample),.99)),
                               initial=float(np.quantile(sample,.90)))
        output.write(packed.tobytes())
meta['volumeGrid'] = dict(dims=[nx,ny,nz], origin=grid_origin.tolist(), spacing=1/resolution, fields=field_meta)

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
travel_times = []
path_ends = []
ds = .008*D
for radius in (.16,.32,.47,.59):
    for azimuth in np.arange(12)*np.pi/6:
        point = D*np.array([-1.25, radius*np.cos(azimuth), radius*np.sin(azimuth)])
        path = [point]
        elapsed = 0.0
        for step in range(600):
            u = at(point)
            if u is None or np.linalg.norm(u)<1e-5:
                break
            mid = at(point+.5*ds*u/np.linalg.norm(u))
            speed = np.linalg.norm(mid) if mid is not None else 0.0
            if speed < 1e-5:
                break
            point = point+ds*mid/speed
            elapsed += ds/speed
            if step%3==2:
                path.append(point)
                travel_times.append(elapsed)
        if len(path)>1:
            path_ends.append(len(travel_times))
            segments.extend(np.stack((path[:-1],path[1:]),axis=1).reshape(-1,3))
arrays = {}
with (args.output / "flow.bin").open("wb") as binary:
    for key, a, dtype in [
        ("blade",points/D,"<f4"),("pressure",pressure,"<f4"),("indices",indices,"<u4"),
        ("speed",speeds,"<f4"),("lines",np.asarray(segments)/D,"<f4"),
        ("travelSeconds",travel_times,"<f4"),("pathEnds",path_ends,"<u4")
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
            streamlines=len(path_ends))
if args.lattice:
    last=loads[-lattice["stepsPerRev"]:]
    meta.update(solver="Rumoca",wallTreatment=lattice.get("wallTreatment","volume-no-slip"),cells=int(np.prod(dims)),kt=float(last["KT"].mean()),
        kq=float(last["KQ"].mean()),steps=lattice["steps"],revolutions=float(loads[-1]["revolutions"]),
        cellsPerDiameter=round(D/dx))
else:
    meta["solver"]="OpenFOAM"
(args.output/"flow.json").write_text(json.dumps(meta,indent=2)+"\n")
print(f"{meta['solver']}, {meta['cells']} cells, KT {meta['kt']:.4f}, KQ {meta['kq']:.4f}, {meta['streamlines']} streamlines")
