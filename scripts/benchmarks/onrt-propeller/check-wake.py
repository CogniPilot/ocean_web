"""Compare axial velocity and swirl on common open-water wake probes."""
import argparse
import json
from pathlib import Path

import numpy as np
from vtkmodules.util.numpy_support import vtk_to_numpy
from vtkmodules.vtkCommonDataModel import vtkStaticCellLocator
from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("case",type=Path)
parser.add_argument("lattice",type=Path)
args=parser.parse_args()
meta=json.loads((args.case/"case.json").read_text())
run=json.loads((args.lattice/"rumoca-volume.json").read_text())
assert (meta["J"],meta["rpm"])==(run["J"],run["rpm"])
reader=vtkOpenFOAMReader()
reader.SetFileName(str(args.case/"run.foam"))
reader.UpdateInformation()
reader.SetTimeValue(reader.GetTimeValues().GetRange()[1])
reader.Update()
volume=reader.GetOutput().GetBlock(0)
velocity=vtk_to_numpy(volume.GetCellData().GetArray("U"))
locator=vtkStaticCellLocator()
locator.SetDataSet(volume)
locator.BuildLocator()
nx,ny,nz=run["dims"]
grid=np.fromfile(args.lattice/"rumoca-volume.bin","<f4").reshape(nz,ny,nx,4)
origin=run["firstCenter_m"]
D=meta["diameter_m"]
angles=np.arange(64)*2*np.pi/64
print("x/D,foam_axial_mean_m_s,lattice_axial_mean_m_s,axial_RMSE_m_s,foam_swirl_mean_m_s,lattice_swirl_mean_m_s")
for station in [.5,1,2]:
    pairs=[]
    # Equal-area annuli keep the disk mean independent of the number of azimuth probes.
    for r in .5*D*np.sqrt((np.arange(12)+.5)/12):
        for a in angles:
            c,s=np.cos(a),np.sin(a)
            point=np.array([station*D,r*c,r*s])
            cell=locator.FindCell(point)
            if cell<0:
                raise ValueError("wake probe outside the water mesh")
            coord=(point-origin)/run["spacing_m"]
            i,j,k=np.floor(coord).astype(int)
            f=coord-[i,j,k]
            w=np.array([1-f,f])
            u=np.einsum("k,j,i,kjiu->u",w[:,2],w[:,1],w[:,0],grid[k:k+2,j:j+2,i:i+2,:3])
            v=velocity[cell]
            pairs.append([v[0],u[0],(u[0]-v[0])**2,c*v[2]-s*v[1],c*u[2]-s*u[1]])
    means=np.mean(pairs,axis=0)
    means[2]=np.sqrt(means[2])
    print(",".join(f"{v:.5f}" for v in [station,*means]))
