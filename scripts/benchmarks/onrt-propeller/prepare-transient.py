"""Prepare a rigid rotating cylindrical open-water mesh from a prepared port propeller case."""
import argparse
import json
import math
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("steady", type=Path)
parser.add_argument("case", type=Path)
parser.add_argument("--gpu", action="store_true", help="solve the moving-mesh linear systems with OpenCL")
args = parser.parse_args()
case = args.case
case.mkdir(parents=True, exist_ok=False)
for folder in ["0", "system"]:
    shutil.copytree(args.steady / folder, case / folder)
for name in ["triSurface", "transportProperties", "turbulenceProperties"]:
    src = args.steady / "constant" / name
    dst = case / "constant" / name
    if src.is_dir():
        shutil.copytree(src, dst)
    else:
        shutil.copy(src, dst)
meta = json.loads((args.steady / "case.json").read_text())
rpm, diameter = meta["rpm"], meta["diameter_m"]
turn = 60 / rpm
steps_per_turn = 240
frames_per_turn = 8
turns = 12
meta.update(stepsPerTurn=steps_per_turn, framesPerTurn=frames_per_turn, runPeriods=turns,
            startsFromRest=True, inletRampSeconds=turn)
(case / "case.json").write_text(json.dumps(meta, indent=2) + "\n")


def write(path, body):
    (case / path).write_text(f"FoamFile {{ version 2.0; format ascii; class dictionary; object {Path(path).name}; }}\n" + body + "\n")


# A cylindrical outer slip boundary is invariant under shaft rotation. The
# entire mesh can move rigidly, without an interpolation interface at the tip.
vertices, blocks, inlet, outlet, sides, arcs = [], [], [], [], [], []
for x in (-3, 6):
    for radius in (math.sqrt(2) * .75, 2):
        for k in range(4):
            a = (2*k+1)*math.pi/4
            vertices.append(f"({x} {radius*math.cos(a)} {radius*math.sin(a)})")
quads = [[0, 1, 2, 3]]
for i in range(4):
    j = (i+1) % 4
    quads.append([i, i+4, j+4, j])
    sides.append(f"({i+4} {j+4} {j+12} {i+12})")
    a = (i+1)*math.pi/2
    for x, off in [(-3, 4), (6, 12)]:
        arcs.append(f"arc {i+off} {j+off} ({x} {2*math.cos(a)} {2*math.sin(a)})")
for i, quad in enumerate(quads):
    far = [v+8 for v in quad]
    fmt = lambda vs: "("+" ".join(map(str, vs))+")"
    blocks.append(f"hex {fmt(quad+far)} ({12 if not i else 10} 12 72) simpleGrading (1 1 1)")
    inlet.append(fmt(quad[::-1]))
    outlet.append(fmt(far))
write("system/blockMeshDict",f"""scale {diameter};
vertices ({' '.join(vertices)});
blocks ({' '.join(blocks)});
edges ({' '.join(arcs)});
boundary (inlet {{type patch; faces ({' '.join(inlet)});}}
          outlet {{type patch; faces ({' '.join(outlet)});}}
          sides {{type patch; faces ({' '.join(sides)});}});
""")
omega = -2*math.pi/turn
profile = [(i*turn/16, (i/16)**2*(3-2*i/16)) for i in range(17)]
profile.append((turn*(turns+1), 1))
write("constant/dynamicMeshDict",f"""dynamicFvMesh dynamicMotionSolverFvMesh;
motionSolverLibs (fvMotionSolvers); motionSolver solidBody;
solidBodyMotionFunction rotatingMotion; origin (0 0 0); axis (1 0 0);
omega table ({' '.join(f'({t:.12g} {omega*f:.12g})' for t,f in profile)});
""")
speed = meta['J']*diameter/turn
u = (case/"0/U").read_text()
start = u.index("internalField")
(case/"0/U").write_text(u[:start]+f"""
internalField uniform (0 0 0);
boundaryField {{
 inlet {{ type uniformFixedValue; uniformValue table ({' '.join(f'({t:.12g} ({speed*f:.12g} 0 0))' for t,f in profile)}); value uniform (0 0 0); }}
 outlet {{ type zeroGradient; }}
 sides {{ type slip; }}
 propeller {{ type movingWallVelocity; value uniform (0 0 0); }}
}}
""")
write("system/controlDict",f"""application pimpleFoam; startFrom startTime; startTime 0;
stopAt endTime; endTime {turn*turns:.15g}; deltaT {turn/steps_per_turn:.15g};
writeControl timeStep; writeInterval {steps_per_turn//frames_per_turn};
timePrecision 10; writeFormat binary; runTimeModifiable false;
functions {{ shaftLoads {{type forces; libs (forces); patches (propeller); rho rhoInf;
 rhoInf {meta['rho_kg_m3']}; CofR (0 0 0); writeControl timeStep; writeInterval 1; }} }}
""")
p = case/"system/fvSchemes"
p.write_text(p.read_text().replace("steadyState;", "backward;").replace("bounded Gauss","Gauss"))
write("system/fvSolution","""
solvers {
 p {solver GAMG; smoother GaussSeidel; tolerance 1e-7; relTol 0.05;}
 pFinal {$p; relTol 0;}
 "(U|k|omega).*" {solver smoothSolver; smoother symGaussSeidel; tolerance 1e-7; relTol 0.05;}
}
PIMPLE {correctPhi no; nOuterCorrectors 2; nCorrectors 1; nNonOrthogonalCorrectors 1;}
""")
write("system/decomposeParDict","numberOfSubdomains 4; method scotch;")

if args.gpu:
    p = case/"system/fvSolution"
    p.write_text(p.read_text().replace("solver smoothSolver;", "solver OpenCL;"))
    with (case/"system/controlDict").open("a") as config:
        config.write('\nlibs ("libonrtOpenCL.so");\n')
    meta["linearSolver"] = "OpenCL velocity and turbulence, GAMG pressure"
    (case/"case.json").write_text(json.dumps(meta, indent=2)+"\n")
