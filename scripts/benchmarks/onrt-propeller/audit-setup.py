"""Audit the executed blade kinematics, discretized solid and axial load convention."""
import argparse
import json
from pathlib import Path

import numpy as np
from vtkmodules.util.numpy_support import vtk_to_numpy
from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("case",type=Path,help="OpenFOAM case with solved Ux/Uy/Uz, face centres C and pressure")
parser.add_argument("cad_mask",type=Path)
parser.add_argument("wall_mask",type=Path,help="same resolution, rasterized from the actual OpenFOAM wall")
parser.add_argument("--rotation-run",type=Path,help="Rumoca run with recorded mask phase and omega")
args=parser.parse_args()
meta=json.loads((args.case/"case.json").read_text())
omega=-2*np.pi*meta["rpm"]/60
reader=vtkOpenFOAMReader()
reader.SetFileName(str(args.case/"run.foam"))
reader.UpdateInformation()
reader.EnableAllPatchArrays()
reader.EnableAllCellArrays()
end=int(reader.GetTimeValues().GetRange()[1])
reader.SetTimeValue(end)
reader.Update()
out=reader.GetOutput()
blocks=out.NewIterator()
blocks.InitTraversal()
while not blocks.IsDoneWithTraversal() and blocks.GetCurrentMetaData().Get(out.NAME())!="propeller":
    blocks.GoToNextItem()
if blocks.IsDoneWithTraversal():
    raise ValueError("missing propeller wall")
blade=blocks.GetCurrentDataObject()
def field(name):
    a=blade.GetCellData().GetArray(name)
    if a is None:
        raise ValueError(f"missing {name} on propeller at time {end}")
    return vtk_to_numpy(a).astype(float)
centres=field("C")
# Read function-object components evaluated inside the solver. A noSlip
# dictionary omits its values when written, so a generic reader can show zeros.
velocity=np.column_stack([field("U"+d) for d in "xyz"])
unit=np.cross([1.,0.,0.],centres)
spin=np.sum(unit*velocity)/np.sum(unit**2)
vector_error=np.linalg.norm(velocity-omega*unit,axis=1).max()
assert vector_error<2e-5, vector_error
print(f"OpenFOAM {len(centres)} wall faces: fitted omega {spin:.6f} rad/s; peak vector error {vector_error:.2g} m/s")

# The OpenFOAM patch winds out of the fluid. Integrate pressure on each face
# using its projected vector area and the original force evaluation points.
areas=[]
for i in range(len(centres)):
    cell=blade.GetCell(i)
    points=np.array([blade.GetPoint(cell.GetPointId(j)) for j in range(cell.GetNumberOfPoints())])
    arms=points-centres[i]
    areas.append(.5*np.cross(arms,np.roll(arms,-1,axis=0)).sum(axis=0))
dforce=meta["rho_kg_m3"]*field("p")[:,None]*areas
for name,pred in [("force",dforce.sum(axis=0)[0]),("moment",np.cross(centres,dforce).sum(axis=0)[0])]:
    # forces.dat scalar columns: time, total(x,y,z), pressure(x,y,z), viscous(x,y,z).
    for path in sorted((args.case/"postProcessing/shaftLoads").glob("*/"+name+".dat"),reverse=True):
        a=np.atleast_2d(np.loadtxt(path))
        row=a[a[:,0]==end]
        if len(row):
            ref=row[-1,4]
            break
    else:
        raise ValueError("missing shaft load at field time")
    np.testing.assert_allclose(pred,ref,rtol=2e-5)
    print(f"Axial pressure {name}: integrated {pred:.7g}, OpenFOAM {ref:.7g}")

def mask(path):
    with path.open("rb") as stream:
        res,w,n=np.fromfile(stream,"<i4",3)
        table=np.fromfile(stream,"u1").reshape(n,w,w,w).astype(float)/255
    return res,table

res,cad=mask(args.cad_mask)
wall_res,wall=mask(args.wall_mask)
if res!=wall_res or cad.shape!=wall.shape:
    raise ValueError("geometry masks must use identical lattice coordinates and phase count")
cell_cm3=(100*meta["diameter_m"]/res)**3
for name,a in [("CAD",cad),("OpenFOAM wall",wall)]:
    volume=a.sum(axis=(1,2,3))*cell_cm3
    print(f"{name} mask {res} cells/D: {volume[0]:.3f} cm3 at zero phase; range {volume.min():.3f}..{volume.max():.3f} cm3")
print(f"Fractional-solid intersection / union across phases: {np.minimum(cad,wall).sum()/np.maximum(cad,wall).sum():.4f}")

if args.rotation_run:
    _,table=mask(args.rotation_run/"rotor.mask")
    history=np.genfromtxt(args.rotation_run/"rumoca-loads.csv",delimiter=",",names=True)
    steady=history[history["revolutions"]>=.5]
    if len(steady)<2 or steady["revolutions"][-1]-steady["revolutions"][0]<1:
        raise ValueError("need at least one full-speed revolution")
    # Recover blade orientation from the mask actually looked up at each
    # step. The fourth angular harmonic tracks the four physical blade tips.
    coord=np.arange(table.shape[1])+.5-table.shape[1]/2
    yz=coord[None,:]+1j*coord[:,None]
    harmonic=np.sum(table.sum(axis=3)*yz**4,axis=(1,2))
    phase=steady["mask_phase"]
    low=np.floor(phase).astype(int)
    frac=phase-low
    observed=(1-frac)*harmonic[low%len(table)]+frac*harmonic[(low+1)%len(table)]
    angle=np.unwrap(np.angle(observed))/4
    mask_rate=np.polyfit(steady["time_s"],angle,1)[0]
    assert np.allclose(steady["omega_rad_s"],omega,rtol=1e-8)
    assert abs(mask_rate/omega-1)<.002
    print(f"Rumoca full-speed wall target {steady['omega_rad_s'].mean():.6f} rad/s; measured mask spin {mask_rate:.6f} rad/s")
