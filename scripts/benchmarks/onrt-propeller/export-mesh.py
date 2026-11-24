"""Export native OpenFOAM cell edges and a longitudinal section at mesh phase zero."""
import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from vtkmodules.util.numpy_support import vtk_to_numpy
from vtkmodules.vtkCommonDataModel import vtkPlane
from vtkmodules.vtkFiltersCore import vtkCutter
from vtkmodules.vtkFiltersCore import vtkExtractEdges
from vtkmodules.vtkIOGeometry import vtkOpenFOAMReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("case", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
diameter = json.loads((args.case / "case.json").read_text())["diameter_m"]
reader = vtkOpenFOAMReader()
reader.SetFileName(str(args.case / "run.foam"))
reader.SkipZeroTimeOff()
reader.UpdateInformation()
reader.DisableAllPatchArrays()
reader.SetPatchArrayStatus("internalMesh", 1)
reader.UpdateTimeStep(0)
mesh = reader.GetOutput().GetBlock(0)
if not mesh or not mesh.GetNumberOfCells():
    raise ValueError("No native volume mesh at initial blade angle")
args.output.mkdir(parents=True, exist_ok=True)

def save_edges(dataset, name):
    edges = vtkExtractEdges()
    edges.SetInputData(dataset)
    edges.Update()
    geometry = edges.GetOutput()
    points = np.asarray(vtk_to_numpy(geometry.GetPoints().GetData()) / diameter, dtype="<f4")
    lines = geometry.GetLines()
    if not np.all(np.diff(vtk_to_numpy(lines.GetOffsetsArray())) == 2):
        raise ValueError("Expected two vertices per edge")
    indices = np.asarray(vtk_to_numpy(lines.GetConnectivityArray()), dtype="<u4")
    header = np.array([len(points), len(indices)], dtype="<u4")
    with (args.output / (name + ".bin.gz")).open("wb") as file:
        with gzip.GzipFile(fileobj=file, filename="", mode="wb", mtime=0) as stream:
            for array in (header, points, indices):
                stream.write(array.tobytes())
    print(name, mesh.GetNumberOfCells(), "cells,", len(indices)//2, "edges")

plane = vtkPlane()
plane.SetOrigin(0, 0, 0)
plane.SetNormal(0, 0, 1)
section = vtkCutter()
section.SetInputData(mesh)
section.SetCutFunction(plane)
section.GenerateTrianglesOff()
section.Update()
save_edges(section.GetOutput(), "section")
save_edges(mesh, "volume")
