"""Rasterize the same shaft-aligned workshop CAD surface as the reference case."""
import argparse
from contextlib import ExitStack
from pathlib import Path
import math
import numpy as np
from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader, vtkSTLReader
from vtkmodules.vtkFiltersCore import vtkTriangleFilter, vtkPolyDataNormals
from vtkmodules.vtkCommonDataModel import vtkStaticCellLocator
from vtkmodules.vtkCommonCore import reference
from vtkmodules.vtkImagingStencil import vtkPolyDataToImageStencil, vtkImageStencilToImage
from vtkmodules.util.numpy_support import vtk_to_numpy

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("surface",type=Path,help="OpenFOAM .foam case for a matched wall, or a CAD .stl for the independent meshing comparison")
parser.add_argument("output",type=Path)
parser.add_argument("--resolution",type=int,default=12,help="lattice cells per propeller diameter")
parser.add_argument("--normal-tensors",type=Path,help="write nearest-facet normal projectors for a mixed-cell free-slip sensitivity run")
args=parser.parse_args()
D=.1066
resolution=args.resolution
if resolution<8 or resolution>64:
    parser.error("choose 8 to 64 cells per diameter")
dx=D/resolution
if args.surface.suffix == ".foam":
    reader=vtkOpenFOAMReader()
    reader.SetFileName(str(args.surface))
    reader.UpdateInformation()
    reader.EnableAllPatchArrays()
    reader.Update()
    case=reader.GetOutput()
    blocks=case.NewIterator()
    blocks.InitTraversal()
    while not blocks.IsDoneWithTraversal() and blocks.GetCurrentMetaData().Get(case.NAME())!="propeller":
        blocks.GoToNextItem()
    if blocks.IsDoneWithTraversal():
        raise ValueError("OpenFOAM mesh has no propeller wall patch")
    triangles=vtkTriangleFilter()
    triangles.SetInputData(blocks.GetCurrentDataObject())
    triangles.Update()
    surface=triangles.GetOutput()
else:
    reader=vtkSTLReader()
    reader.SetFileName(str(args.surface))
    reader.Update()
    surface=reader.GetOutput()
if not surface.GetNumberOfCells():
    raise ValueError("empty blade geometry")
sub=6
# Sample the solid in its rotating frame at a finer pitch than the fluid lattice.
half=math.ceil(.62*resolution)
width=2*half
voxel=dx/sub
size=width*sub
origin=(-half*dx+voxel/2,)*3
stencil=vtkPolyDataToImageStencil()
stencil.SetInputData(surface)
stencil.SetOutputOrigin(origin)
stencil.SetOutputSpacing((voxel,)*3)
stencil.SetOutputWholeExtent(0,size-1,0,size-1,0,size-1)
image=vtkImageStencilToImage()
image.SetInputConnection(stencil.GetOutputPort())
image.SetInsideValue(1)
image.SetOutsideValue(0)
image.SetOutputScalarTypeToUnsignedChar()
image.Update()
solid=vtk_to_numpy(image.GetOutput().GetPointData().GetScalars()).reshape(size,size,size)
# Four identical blades. Record a quarter turn in 120 phases. Mesh points and
# the flow solver both locate the shaft between the central four yz cells.
frames=120
yy,zz=np.meshgrid((np.arange(size)+.5-size/2)*voxel,(np.arange(size)+.5-size/2)*voxel)
header=np.array([resolution,width,frames],dtype="<i4")
with ExitStack() as stack:
    out=stack.enter_context(args.output.open("wb"))
    header.tofile(out)
    if args.normal_tensors:
        normal_out=stack.enter_context(args.normal_tensors.open("wb"))
        header.tofile(normal_out)
        normals=vtkPolyDataNormals()
        normals.SetInputData(surface)
        normals.ComputeCellNormalsOn()
        normals.ComputePointNormalsOff()
        normals.SplittingOff()
        normals.Update()
        normal_surface=normals.GetOutput()
        face_normals=vtk_to_numpy(normal_surface.GetCellData().GetNormals())
        locator=vtkStaticCellLocator()
        locator.SetDataSet(normal_surface)
        locator.BuildLocator()

    for phase in range(frames):
        a=phase*math.pi/(2*frames)
        iy=np.floor((yy*np.cos(a)+zz*np.sin(a))/voxel+size/2).astype(int)
        iz=np.floor((-yy*np.sin(a)+zz*np.cos(a))/voxel+size/2).astype(int)
        valid=(iy>=0)&(iz>=0)&(iy<size)&(iz<size)
        rotated=solid[iz.clip(0,size-1),iy.clip(0,size-1),:]*valid[:,:,None]
        fractions=rotated.reshape(width,sub,width,sub,width,sub).mean(axis=(1,3,5))
        quantized=np.rint(fractions*255).astype("u1")
        quantized.tofile(out)
        if args.normal_tensors:
            tensors=np.zeros((width,width,width,6),dtype="<f4")
            tensors[quantized==255,:3]=1
            ca,sa=np.cos(a),np.sin(a)
            rotate=np.array([[1,0,0],[0,ca,-sa],[0,sa,ca]])
            for iz,iy,ix in np.argwhere((quantized>0)&(quantized<255)):
                xyz=(np.array([ix,iy,iz])+.5-width/2)*dx
                face,subid,dist=reference(0),reference(0),reference(0.)
                closest=[0.,0.,0.]
                locator.FindClosestPoint(xyz @ rotate,closest,face,subid,dist)
                x,y,z=rotate @ face_normals[int(face)]
                tensors[iz,iy,ix]=[x*x,y*y,z*z,x*y,x*z,y*z]
            tensors.tofile(normal_out)
print(f"Phase-zero occupied volume {solid.sum()*voxel**3:.7g} m3")
