"""Tessellate Tokyo 2015 ONRT IGES and integrate the design-waterline offsets.

Usage: python prepare-onrt.py HULL.igs PROPELLER.igs OUTPUT_DIRECTORY
Requires Gmsh 4.15 Python bindings. Input CAD files stay outside the runtime.
"""
import argparse
import hashlib
import json
import struct
from collections import defaultdict
from pathlib import Path

import gmsh

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("hull", type=Path)
parser.add_argument("propeller", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
for path, expected in [(args.hull, "88fa3e79e0c89613742d49c72c5ddf4fc6464ceb1a8cf58a9720aa5d4cd58b5d"),
                       (args.propeller, "82f7cd050e1914972f512c6668bfa3b1e3fb559d15d37796a23c97e403730523")]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Unexpected workshop CAD revision: {path}")
args.output.mkdir(parents=True, exist_ok=True)
length, fp = 3.147, 1.625  # Body x forward, origin at published LCB
groups = defaultdict(list)
submerged = []


def load(path, size):
    gmsh.clear()
    gmsh.open(str(path))
    for key, value in {"MeshSizeMax": size, "MeshSizeMin": size / 10,
                       "MeshSizeFromCurvature": 16, "MeshSizeExtendFromBoundary": 0}.items():
        gmsh.option.setNumber("Mesh." + key, value)
    gmsh.model.mesh.generate(2)
    ids, coords, _ = gmsh.model.mesh.getNodes()
    points = dict(zip(ids, zip(coords[::3], coords[1::3], coords[2::3])))
    for _, tag in gmsh.model.getEntities(2):
        _, indices = gmsh.model.mesh.getElementsByType(2, tag)
        for triangle in zip(indices[::3], indices[1::3], indices[2::3]):
            yield tag, [points[node] for node in triangle]


gmsh.initialize()
gmsh.option.setNumber("General.Terminal", 0)
for tag, triangle in load(args.hull, 14):
    if tag in (124, 125, 127, 128):  # actuator disk reference faces
        continue
    vertices = [(fp - x * length / 1000, y * length / 1000, z * length / 1000)
                for x, y, z in triangle]
    if tag in (1, 2, 3, 4) or 54 <= tag <= 65:
        submerged.append(vertices)
        group = "bottom"
    elif tag in (34, 35, 36, 130):
        group = "starboardRudder"
    elif tag in (83, 84, 85, 132):
        group = "portRudder"
    elif 27 <= tag <= 31 or tag in (112, 114, 116, 117, 118):
        group = "house"
    elif 5 <= tag <= 26 or tag in (113, 115, 119, 120):
        group = "topsides"
    else:
        group = "appendages"
    # Three.js coordinates (forward, up, starboard); reflect the winding.
    groups[group].append((tag, [(x, z, y) for x, y, z in reversed(vertices)]))

for tag, triangle in load(args.propeller, 3):
    # Model-scale propeller is in millimetres with its shaft on CAD Y.
    groups["propeller"].append((tag, [(y / 1000, z / 1000, x / 1000) for x, y, z in triangle]))
gmsh.finalize()


def cross_section(x):
    segments = []
    for triangle in submerged:
        cuts = []
        for a, b in zip(triangle, triangle[1:] + triangle[:1]):
            if (a[0] < x) != (b[0] < x):
                t = (x - a[0]) / (b[0] - a[0])
                cuts.append((a[1] + t * (b[1]-a[1]), a[2] + t * (b[2]-a[2])))
        if len(cuts) == 2:
            segments.append(cuts)
    if not segments:
        return 0, 0
    # Slice at all CAD edge levels. Between vertices the half-breadth
    # is linear. Pair the crossings to retain bulb and flared sections.
    levels = sorted({min(0, z) for pair in segments for _, z in pair} | {0})
    area = 0
    for low, high in zip(levels, levels[1:]):
        z = (low + high) / 2
        ys = sorted(a[0] + (b[0]-a[0])*(z-a[1])/(b[1]-a[1])
                    for a, b in segments if (a[1] < z) != (b[1] < z))
        area += (high-low) * sum(b-a for a, b in zip(ys[::2], ys[1::2]))
    width = max((abs(y) for pair in segments for y, z in pair if abs(z) < 0.0001), default=0)
    return area, width


xmin = min(x for tri in submerged for x, _, _ in tri)
xmax = max(x for tri in submerged for x, _, _ in tri)
stations = [xmin + (xmax-xmin)*i/6 for i in range(7)]
volumes = []
for a,b in zip(stations, stations[1:]):
    dx = (b-a)/32
    volumes.append(dx * sum(cross_section(a+(i+.5)*dx)[0] for i in range(32)))
beams = [cross_section(min(xmax-.00001,max(xmin+.00001,x)))[1] for x in stations]
if abs(sum(volumes) - 0.0726) > 0.003 or not 0.18 < max(beams) < 0.20:
    raise ValueError(f"CAD section check failed: {volumes}, {beams}")
wake = {"stations": stations, "beamHalf": beams, "volume": volumes+[0]*6}
(args.output/"wake.json").write_text(json.dumps(wake, indent=2)+"\n")

# Compact indexed draw groups, precision 0.1 mm, independently articulated.
parts = {}
with (args.output/"geometry.bin").open("wb") as out:
    for name, triangles in groups.items():
        lookup = {}
        indices = []
        for face, triangle in triangles:
            for p in triangle:
                key = tuple(round(value*10000) for value in p)
                indices.append(lookup.setdefault((face, key), len(lookup)))
        parts[name] = {"offset": out.tell(), "vertices": len(lookup), "indices": len(indices)}
        for _, vertex in lookup:
            out.write(struct.pack("<3h", *vertex))
        out.write(struct.pack(f"<{len(indices)}H", *indices))
(args.output/"parts.json").write_text(json.dumps(parts, indent=2)+"\n")
print(f"Bare hull CAD volume {sum(volumes):.6f} m3; peak station beam {2*max(beams):.5f} m")
