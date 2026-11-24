"""Compare one isolated port propeller operating point with IIHR's open-water experiment."""
import argparse
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("efd", type=Path, help="Open_Water_EFD.dat from the SIMMAN ONRT archive")
parser.add_argument("foam", type=Path)
parser.add_argument("lattice", type=Path)
parser.add_argument("--json", action="store_true", help="Emit the full comparison as JSON")
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
period = lattice["stepsPerRev"]
if (len(loads) < 2*period or loads["step"][-1] != lattice["steps"]
        or not np.all(np.diff(loads["step"][-2*period:]) == 1)
        or loads["revolutions"][-2*period] < 0.5):
    raise ValueError("Need two complete, consecutive revolutions after the shaft ramp")
measured = {"KT": curve[1,index], "KQ": curve[2,index], "eta": curve[4,index]}
foam_mean, foam_previous, lattice_mean, lattice_previous = {}, {}, {}, {}
components = {}
for channel, name, power, sign in [("KT", "force", 4, -1), ("KQ", "moment", 5, 1)]:
    history = np.loadtxt(args.foam / "postProcessing/shaftLoads/0" / (name+".dat"))
    if len(history) < 40 or not np.all(np.diff(history[-40:,0]) == 1):
        raise ValueError("Need two consecutive 20-iteration OpenFOAM windows")
    scale = sign/(foam["rho_kg_m3"]*rate**2*diameter**power)
    total, pressure, viscous = scale*history[-20:, [1,4,7]].mean(axis=0)
    if not np.isclose(pressure+viscous,total,atol=1e-8,rtol=1e-5):
        raise ValueError("Pressure and viscous contributions do not sum to the reported total")
    components[channel] = {"pressure": pressure, "viscous": viscous}
    foam_mean[channel] = total
    foam_previous[channel] = scale*history[-40:-20,1].mean()
    lattice_mean[channel] = loads[channel][-period:].mean()
    lattice_previous[channel] = loads[channel][-2*period:-period].mean()

for window in (foam_mean, foam_previous, lattice_mean, lattice_previous):
    window["eta"] = j*window["KT"]/(2*np.pi*window["KQ"])
report = {"J": j, "simulation_rpm": foam["rpm"], "IIHR": measured,
          "OpenFOAM": foam_mean, "Rumoca": lattice_mean, "OpenFOAM_components": components,
          "previous_20_iterations_OpenFOAM": foam_previous, "previous_revolution_Rumoca": lattice_previous}
if args.json:
    print(json.dumps(report, indent=2, allow_nan=False))
else:
    for channel, efd in measured.items():
        reference, prediction = foam_mean[channel], lattice_mean[channel]
        print(f"J={j:g} {channel}  IIHR {efd:.5f}  "
              f"OpenFOAM {reference:.5f} ({100*(reference/efd-1):+.2f}%)  "
              f"Rumoca {prediction:.5f} ({100*(prediction/efd-1):+.2f}%)")
