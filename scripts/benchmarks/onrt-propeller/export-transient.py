"""Export time-resolved PIMPLE fields and blade-patch pressures on the tank-frame display grid."""
import argparse
import json
import re
from pathlib import Path

import numpy as np
from vtkmodules.util.numpy_support import numpy_to_vtk, vtk_to_numpy
from vtkmodules.vtkCommonCore import vtkPoints
from vtkmodules.vtkCommonDataModel import vtkDataObject, vtkPolyData, vtkStaticCellLocator
from vtkmodules.vtkFiltersCore import vtkCellDataToPointData, vtkProbeFilter, vtkTriangleFilter
from vtkmodules.vtkFiltersGeneral import vtkGradientFilter
from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader

from lattice_playback import sample, streamlines

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("case", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
meta = json.loads((args.case / "case.json").read_text())
log = args.case / "log.transient"
if log.exists():
    device = None
    wall_seconds = None
    completed = False
    with log.open() as stream:
        for line in stream:
            if line.startswith("OpenFOAM linear systems on OpenCL GPU "):
                device = line.removeprefix("OpenFOAM linear systems on OpenCL GPU ").strip()
            elif line.startswith("ExecutionTime"):
                clock = re.search(r"ClockTime = ([.0-9]+) s", line)
                if clock:
                    wall_seconds = float(clock[1])
            elif line.strip() == "End":
                completed = True
    if not completed:
        raise ValueError("OpenFOAM has not finished the transient")
    if wall_seconds is not None:
        meta["solveWallSeconds"] = wall_seconds
    if device:
        meta.update(computeDevice=device, linearSolver="OpenCL velocity and turbulence, GAMG pressure")
out = args.output
out.mkdir(parents=True, exist_ok=True)
D, rpm, rho = meta["diameter_m"], meta["rpm"], meta["rho_kg_m3"]
turn = 60/rpm
foam = args.case / "run.foam"
foam.touch()
reader = vtkOpenFOAMReader()
reader.SetFileName(str(foam))
reader.SkipZeroTimeOff()
reader.UpdateInformation()
reader.EnableAllPatchArrays()
times = vtk_to_numpy(reader.GetTimeValues()).astype(float)
expected = np.arange(meta["runPeriods"] * meta["framesPerTurn"] + 1)*turn/meta["framesPerTurn"]
if len(times)!=len(expected) or not np.allclose(times,expected,atol=1e-6,rtol=0):
    raise ValueError(f"Incomplete OpenFOAM time directories: {len(times)} of {len(expected)}")

# Enough padding for instantaneous streamlines to leave the display window.
spacing=D/20
start=np.array([-1.5,-1.2,-1.2])*D
z,y,x=np.indices((49,49,111))
query=start+np.column_stack([x.ravel(),y.ravel(),z.ravel()])*spacing
pts=vtkPoints()
pts.SetData(numpy_to_vtk(query,deep=True))
cloud=vtkPolyData()
cloud.SetPoints(pts)
window=np.s_[8:41,8:41,10:91]
seeds=D*np.array([[-1.25,r*np.cos(a),r*np.sin(a)] for r in (.16,.32,.47,.59) for a in np.arange(12)*np.pi/6])
take=np.arange(len(seeds)*4)
tracer=seeds[take%len(seeds)].copy()
tracer[:,0]+=D*3.25*((take*.61803398875)%1)
history={}
descriptors={}
frames=[]
geometry=bytearray()
previous=None
for i,t in enumerate(times):
    reader.UpdateTimeStep(t)
    scene=reader.GetOutput()
    it=scene.NewIterator()
    it.InitTraversal()
    blocks={}
    while not it.IsDoneWithTraversal():
        blocks[it.GetCurrentMetaData().Get(scene.NAME())]=it.GetCurrentDataObject()
        it.GoToNextItem()
    mesh=blocks["internalMesh"]
    tri=vtkTriangleFilter()
    tri.SetInputData(blocks["propeller"])
    tri.Update()
    surface=tri.GetOutput()
    wall=vtk_to_numpy(surface.GetPointData().GetArray("p")).astype(float)*rho/1000
    current_blade=vtk_to_numpy(surface.GetPoints().GetData()).astype(float)/D
    if i==0:
        blade=current_blade.copy()
        indices=vtk_to_numpy(surface.GetPolys().GetConnectivityArray()).copy()
        off_axis=np.argmax(np.hypot(blade[:,1],blade[:,2]))
        initial_angle=np.arctan2(blade[off_axis,2],blade[off_axis,1])
        old_angle=initial_angle
        turns=0.
    angle=np.arctan2(current_blade[off_axis,2],current_blade[off_axis,1])
    turns-=np.arctan2(np.sin(angle-old_angle),np.cos(angle-old_angle))/(2*np.pi)
    old_angle=angle
    if t>=turn and abs(turns-(t/turn-.5))>.002:
        raise ValueError(f"Blade phase inconsistent with imposed shaft motion at {t}")
    derivative=vtkGradientFilter()
    derivative.SetInputData(mesh)
    derivative.SetInputScalars(vtkDataObject.FIELD_ASSOCIATION_CELLS,"U")
    derivative.ComputeGradientOff()
    derivative.ComputeVorticityOn()
    interp=vtkCellDataToPointData()
    interp.SetInputConnection(derivative.GetOutputPort())
    probe=vtkProbeFilter()
    probe.SetInputData(cloud)
    probe.SetSourceConnection(interp.GetOutputPort())
    probe.SetCellLocatorPrototype(vtkStaticCellLocator())
    probe.Update()
    values=probe.GetOutput().GetPointData()
    def field(key):
        return vtk_to_numpy(values.GetArray(key))
    valid=field("vtkValidPointMask").astype(bool).reshape(z.shape)
    u=field("U").reshape(*z.shape,3)
    valid_window=valid[window].ravel()
    fields={"velocity":np.linalg.norm(u,axis=-1),"vorticity":np.linalg.norm(field("Vorticity"),axis=1).reshape(z.shape),
            "fluidPressure":field("p").reshape(z.shape)*rho/1000, "turbulenceK":field("k").reshape(z.shape)}
    for key,v in fields.items():
        values_here=v[window].ravel()[valid_window].astype(float)
        if not np.all(np.isfinite(values_here)):
            raise ValueError(f"Nonfinite {key} at {t}")
        lo,hi=values_here.min(),values_here.max()
        step=(hi-lo)/65534 or 1.
        packed=np.zeros(len(valid_window),dtype='<u2')
        packed[valid_window]=1+np.rint((values_here-lo)/step).astype(np.uint16)
        with (out/("turn-"+key+".bin")).open("wb" if i==0 else "ab") as dest:
            packed.tofile(dest)
        desc=dict(min=lo,max=hi,step=step)
        history.setdefault(key,[]).append(desc)
        descriptors[key]=dict(**desc,initial=float(np.quantile(values_here,.90)),
                              colorLimit=float(np.quantile(abs(values_here),.99)))
    def fluid(points):
        idx=np.rint((points-start)/spacing).astype(int)
        within=np.all((idx>=0)&(idx<np.array(z.shape[::-1])-1),axis=1)
        a,b,c=idx[within].T
        within[within]=valid[c,b,a]
        return within
    lines=streamlines(u,start,spacing,D,fluid,seeds)
    if previous is not None:
        dt=t-times[i-1]
        mid=tracer+dt*.5*sample(previous,tracer,start,spacing)
        tracer+=dt*.5*(sample(previous,mid,start,spacing)+sample(u,mid,start,spacing))
    invalid=~fluid(tracer) | (tracer[:,0]>2.95*D)
    tracer[invalid]=seeds[take[invalid]%len(seeds)]
    frames.append(dict(time=float(t),turns=turns,offset=len(geometry)))
    geometry.extend(wall.astype('<f4').tobytes())
    geometry.extend((tracer/D).astype('<f4').tobytes())
    geometry.extend(lines.tobytes())
    previous=u.copy()
    if i%8==0: print(f"Exported OpenFOAM sample {i+1}/{len(times)} at {turns:.2f} turns",flush=True)
(out/'turn-geometry.bin').write_bytes(geometry)
arrays={}
with (out/'flow.bin').open('wb') as dest:
    for key,values,dtype in [('blade',blade,'<f4'),('indices',indices,'<u4'),('pressure',wall,'<f4'),
                             ('lines',[],'<f4'),('travelSeconds',[],'<f4'),('pathEnds',[],'<u4')]:
        a=np.asarray(values,dtype=dtype).ravel()
        arrays[key]=[dest.tell(),a.size]
        a.tofile(dest)
def coefficient(name,sign,power):
    data=np.loadtxt(args.case/'postProcessing/shaftLoads/0'/(name+'.dat'))
    recent=data[:,0]>times[-1]-turn+1e-8
    return sign*data[recent,1].mean()/(rho*(rpm/60)**2*D**power)
meta.update(solver="OpenFOAM",cells=mesh.GetNumberOfCells(),arrays=arrays,revolutions=0,
            kt=coefficient('force',-1,4),kq=coefficient('moment',1,5),speedLimit=descriptors['velocity']['colorLimit'],
            volumeGrid=dict(dims=[81,33,33],origin=[-1,-.8,-.8],spacing=.05,fields=descriptors),
            sequence=dict(frames=frames,fields=history,tracers=len(tracer),paths=len(seeds),verticesPerPath=lines.shape[1]))
(out/'flow.json').write_text(json.dumps(meta,indent=2)+'\n')
