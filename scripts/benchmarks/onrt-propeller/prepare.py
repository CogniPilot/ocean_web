"""Prepare the W2025 port-propeller open-water MRF case for OpenFOAM v2412."""
import argparse
import hashlib
import json
import math
import tempfile
from pathlib import Path
from zipfile import ZipFile

import gmsh
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="Wageningen 2025 dimensional IGES archive")
parser.add_argument("case", type=Path)
parser.add_argument("--advance", type=float, default=0.8, help="advance ratio J")
parser.add_argument("--rpm", type=float, default=538)
parser.add_argument("--refinement", type=int, choices=[2, 3, 4], default=2)
args = parser.parse_args()
if args.case.exists() and any(args.case.iterdir()):
    parser.error("choose an empty case directory to preserve existing results")
if not (0.1 <= args.advance <= 1.7 and args.rpm > 0):
    parser.error("choose a positive shaft speed and J within the published curve")
if hashlib.sha256(args.archive.read_bytes()).hexdigest() != "dc060002dd9631c185159279fc70644dba970976834b3edcf4e4fc639020b707":
    parser.error("expected the February 2025 v5 geometry archive")
case = args.case
D = .1066
n = args.rpm / 60
speed = args.advance * n * D
omega = -2 * math.pi * n  # Viewed from astern, port top blade travels inboard.
for folder in ["0", "system", "constant/triSurface"]:
    (case / folder).mkdir(exist_ok=True, parents=True)

with tempfile.TemporaryDirectory() as tmp, ZipFile(args.archive) as archive:
    filename = next(s for s in archive.namelist() if s.endswith("/dim/onrt_dim_ps_propeller.igs"))
    cad = Path(tmp) / "propeller.igs"
    cad.write_bytes(archive.read(filename))
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.open(str(cad))
    # The two circular hub end faces define the shaft centreline in the IGES.
    ends = np.array([gmsh.model.occ.getCenterOfMass(2, i) for i in (1, 2)])
    axis = ends[1] - ends[0]
    axis /= np.linalg.norm(axis)
    up = np.cross(axis, [0, 1, 0])
    basis = np.array([axis, np.cross(up, axis), up])
    gmsh.option.setNumber("Mesh.MeshSizeMax", 1.1)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 24)
    gmsh.model.mesh.generate(2)
    nodes, coords, _ = gmsh.model.mesh.getNodes()
    coords = (coords.reshape(-1, 3) - ends.mean(axis=0)) @ basis.T * .001
    points = dict(zip(nodes, coords))
    diameter = 2 * np.max(np.hypot(coords[:, 1], coords[:, 2]))
    if abs(diameter - D) > .0005:
        raise ValueError(f"measured propeller diameter {diameter} differs from {D}")
    _, triangles = gmsh.model.mesh.getElementsByType(2)
    with (case / "constant/triSurface/propeller.stl").open("w") as stl:
        print("solid propeller", file=stl)
        for tri in triangles.reshape(-1, 3):
            a, b, c = [points[i] for i in tri]
            normal = np.cross(b-a, c-a)
            length = np.linalg.norm(normal)
            if length < 1e-15:
                continue
            print("facet normal", *(normal/length), "\nouter loop", file=stl)
            for vertex in (a, b, c):
                print("vertex", *vertex, file=stl)
            print("endloop\nendfacet", file=stl)
        print("endsolid propeller", file=stl)
    gmsh.finalize()


def write(path, body, kind="dictionary"):
    name = Path(path).name
    header = f"FoamFile {{ version 2.0; format ascii; class {kind}; object {name}; }}\n"
    (case / path).write_text(header + body + "\n")


# Open-water box in diameters. The stream enters along positive shaft x.
write("system/meshQualityDict", '#includeEtc "caseDicts/mesh/generation/meshQualityDict.cfg"')
write("system/blockMeshDict", f"""
scale {D};
vertices ((-3 -2 -2)(6 -2 -2)(6 2 -2)(-3 2 -2)(-3 -2 2)(6 -2 2)(6 2 2)(-3 2 2));
blocks (hex (0 1 2 3 4 5 6 7) (72 32 32) simpleGrading (1 1 1));
boundary (
 inlet {{type patch; faces ((0 4 7 3));}}
 outlet {{type patch; faces ((1 2 6 5));}}
 sides {{type patch; faces ((0 1 5 4)(3 7 6 2)(0 3 2 1)(4 5 6 7));}}
);
""")
write("system/snappyHexMeshDict", f"""
#includeEtc "caseDicts/mesh/generation/snappyHexMeshDict.cfg"
castellatedMesh true; snap true; addLayers false;
geometry {{
 propeller.stl {{type triSurfaceMesh; name propeller;}}
 rotor {{type searchableCylinder; point1 (-0.034 0 0); point2 (0.034 0 0); radius 0.071;}}
}}
castellatedMeshControls {{
 maxLocalCells 3000000; maxGlobalCells 3000000; minRefinementCells 0;
 nCellsBetweenLevels 3; features (); resolveFeatureAngle 35;
 refinementSurfaces {{ propeller {{level ({args.refinement} {args.refinement}); patchInfo {{type wall;}} }} }}
 refinementRegions {{ rotor {{mode inside; levels ((1e15 {args.refinement-1}));}} }}
 locationInMesh (-0.2 0.011 0.013); allowFreeStandingZoneFaces true;
}}
meshQualityControls {{#includeEtc "caseDicts/mesh/generation/meshQualityDict.cfg"
}}
mergeTolerance 1e-7;
""".replace('{#includeEtc','{\n#includeEtc'))
write("system/topoSetDict", """
actions (
 {name rotorCells; type cellSet; action new; source cylinderToCell;
  p1 (-0.034 0 0); p2 (0.034 0 0); radius 0.071;}
 {name rotor; type cellZoneSet; action new; source setToCellZone; set rotorCells;}
);
""")
write("constant/MRFProperties", f"""
propellerFrame {{cellZone rotor; active yes; nonRotatingPatches (); origin (0 0 0); axis (1 0 0); omega {omega};}}
""")
write("constant/transportProperties", "transportModel Newtonian; nu [0 2 -1 0 0 0 0] 1.054e-6;")
write("constant/turbulenceProperties", "simulationType RAS; RAS {RASModel kOmegaSST; turbulence on; printCoeffs on;}")
intensity = .01
k = 1.5*(speed*intensity)**2
turb_omega = math.sqrt(k)/(.09**.25*.07*D)
for field, dims, initial, inlet, outlet, side, wall in [
    ("U", "0 1 -1", f"({speed} 0 0)", "fixedValue", "zeroGradient", "slip", "noSlip"),
    ("p", "0 2 -2", "0", "zeroGradient", "fixedValue", "zeroGradient", "zeroGradient"),
    ("k", "0 2 -2", str(k), "fixedValue", "zeroGradient", "zeroGradient", "kqRWallFunction"),
    ("omega", "0 0 -1", str(turb_omega), "fixedValue", "zeroGradient", "zeroGradient", "omegaWallFunction"),
    ("nut", "0 2 -1", "0", "calculated", "calculated", "calculated", "nutkWallFunction"),
]:
    bcs = []
    for patch, bc in zip(["inlet","outlet","sides","propeller"], [inlet,outlet,side,wall]):
        bcs.append(f"{patch} {{ type {bc}; value uniform {initial}; }}")
    write("0/"+field, f"dimensions [{dims} 0 0 0 0];\ninternalField uniform {initial};\nboundaryField {{"
          + "\n".join(bcs)+"}", "volVectorField" if field=="U" else "volScalarField")
write("system/controlDict", """
application simpleFoam; startFrom startTime; startTime 0; stopAt endTime; endTime 300;
deltaT 1; writeControl timeStep; writeInterval 100; purgeWrite 2; writeFormat binary;
runTimeModifiable false;
functions {
 wallStress {type wallShearStress; libs (fieldFunctionObjects); patches (propeller); writeControl writeTime;}
 wallComponents {type components; libs (fieldFunctionObjects); field U; writeControl writeTime;}
 shaftLoads {type forces; libs (forces); patches (propeller); rho rhoInf; rhoInf 998.6;
 CofR (0 0 0); writeControl timeStep; writeInterval 1;}
}
""")
write("system/fvSchemes", """
ddtSchemes {default steadyState;}
gradSchemes {default cellLimited Gauss linear 1;}
divSchemes {default none; div(phi,U) bounded Gauss linearUpwind grad(U);
 div(phi,k) bounded Gauss upwind; div(phi,omega) bounded Gauss upwind;
 div((nuEff*dev2(T(grad(U))))) Gauss linear;}
laplacianSchemes {default Gauss linear limited 0.5;}
interpolationSchemes {default linear;}
snGradSchemes {default limited 0.5;}
wallDist {method meshWave;}
""")
write("system/fvSolution", """
solvers {
 p {solver GAMG; smoother GaussSeidel; tolerance 1e-7; relTol 0.05;}
 "(U|k|omega)" {solver smoothSolver; smoother symGaussSeidel; tolerance 1e-7; relTol 0.08;}
}
SIMPLE {nNonOrthogonalCorrectors 1; consistent yes;}
relaxationFactors {fields {p 0.25;} equations {U 0.6; k 0.5; omega 0.5;}}
""")
(case / "case.json").write_text(json.dumps(dict(J=args.advance, rpm=args.rpm, diameter_m=D,
    measured_mesh_diameter_m=diameter, rho_kg_m3=998.6, refinement=args.refinement), indent=2)+"\n")
