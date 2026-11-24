"""Compare one matched open-water case to the SIMMAN IIHR port propeller measurements."""
import argparse
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("efd", type=Path, help="Open_Water_EFD.dat from the SIMMAN ONRT archive")
parser.add_argument("foam", type=Path)
parser.add_argument("lattice", type=Path)
args = parser.parse_args()
port = args.efd.read_text().split('ZONE T="Port"', 1)[1].split("\nZONE ", 1)[0]
curve = np.fromstring(port.split("DT=", 1)[1].split(")", 1)[1], sep=" ").reshape(5, -1)
foam = json.loads((args.foam / "case.json").read_text())
lattice = json.loads((args.lattice / "rumoca-volume.json").read_text())
j, rate, diameter = foam["J"], foam["rpm"]/60, foam["diameter_m"]
index, = np.flatnonzero(np.isclose(curve[0], j))
if not np.isclose(lattice["J"], j) or not np.isclose(lattice["rpm"], foam["rpm"]):
    raise ValueError("Advance ratio or shaft speed differs between solvers")

loads = np.genfromtxt(args.lattice / "rumoca-loads.csv", delimiter=",", names=True)
last = lattice["stepsPerRev"]
if len(loads) < last or loads["step"][-1] != lattice["steps"]:
    raise ValueError("Incomplete lattice history")
for channel, name, power, sign, efd in [
        ("KT", "force", 4, -1, curve[1,index]), ("KQ", "moment", 5, 1, curve[2,index])]:
    path = args.foam / "postProcessing/shaftLoads/0" / (name+".dat")
    history = np.loadtxt(path)
    dimensional = sign*history[-20:,1].mean()
    reference = dimensional/(foam["rho_kg_m3"]*rate**2*diameter**power)
    prediction = loads[channel][-last:].mean()
    print(f"J={j:g} {channel}  IIHR {efd:.5f}  "
          f"OpenFOAM {reference:.5f} ({100*(reference/efd-1):+.2f}%)  "
          f"Rumoca {prediction:.5f} ({100*(prediction/efd-1):+.2f}%)")
