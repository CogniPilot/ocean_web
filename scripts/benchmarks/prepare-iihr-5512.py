"""Project the workshop half-hull grid and wave profile into Modelica inputs."""

import argparse
import json
from math import isclose
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path, help='directory holding the two benchmark downloads')
work = parser.parse_args().directory
data = list(map(float, (work / '5415_static.net').read_text().split()))
blocks, nx, ny, nz = map(int, data[:4])
count = nx * ny
if blocks != 1 or nz != 1 or len(data) != 4 + count * 3:
    raise ValueError('Expected the single-block 5415 workshop hull surface')

length = 3.048
scale = length / 5.72
draft = 0.248 * scale
coordinates = [data[4 + i * count:4 + (i + 1) * count] for i in range(3)]


def surface(sinkage_forward, sinkage_aft, elevation=0):
    points = []
    for x, y, z in zip(*coordinates):
        x *= scale
        sinkage = sinkage_forward + (sinkage_aft - sinkage_forward) * x / length
        points.append((x, y * scale, z * scale - draft - sinkage - elevation))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            yield points[a], points[a + 1], points[a + nx + 1]
            yield points[a], points[a + nx + 1], points[a + nx]


def intersect_plane(a, b, axis, position):
    fraction = (position - a[axis]) / (b[axis] - a[axis])
    return tuple(x + fraction * (y - x) for x, y in zip(a, b))


def clip(polygon, axis, position, direction):
    if not polygon:
        return []
    clipped = []
    a = polygon[-1]
    for b in polygon:
        a_inside = direction * (a[axis] - position) >= 0
        b_inside = direction * (b[axis] - position) >= 0
        if a_inside != b_inside:
            clipped.append(intersect_plane(a, b, axis, position))
        if b_inside:
            clipped.append(b)
        a = b
    return clipped


def volume_of_half(face):
    # Integrate z n_z over the wetted surface. The waterline cap (z=0)
    # and vertical strip cuts give zero contribution.
    if len(face) < 3:
        return 0
    a = face[0]
    integral = 0
    for b, c in zip(face[1:], face[2:]):
        projected_area_twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        integral += projected_area_twice * (a[2] + b[2] + c[2]) / 6
    return integral


def waterline(faces):
    for a, b, c in faces:
        intersections = [
            intersect_plane(p, q, 2, 0)
            for p, q in ((a, b), (b, c), (c, a))
            if (p[2] < 0) != (q[2] < 0)
        ]
        if len(intersections) == 2:
            yield sorted(intersections, key=lambda point: point[0])


def beam_at(line, x):
    beams = (
        intersect_plane(a, b, 0, x)[1]
        for a, b in line
        if a[0] <= x <= b[0] and a[0] < b[0]
    )
    return max(beams, default=0)


def build_geometry(forward, aft):
    faces = list(surface(forward, aft))
    line = list(waterline(faces))
    submerged = [polygon for face in faces if (polygon := clip(face, 2, 0, -1))]
    x_min = min(point[0] for face in submerged for point in face)
    x_max = max(point[0] for face in submerged for point in face)
    planes = [x_min + (x_max - x_min) * i / 6 for i in range(7)]
    volumes = []
    for start, end in zip(planes, planes[1:]):
        integral = sum(
            volume_of_half(clip(clip(face, 0, start, 1), 0, end, -1))
            for face in submerged
        )
        volumes.append(2 * abs(integral))
    return {
        'stations': [length / 2 - x for x in reversed(planes)],
        'beamHalf': [beam_at(line, x) for x in reversed(planes)],
        'volume': volumes[::-1] + [0] * 6,
    }


static_volume = sum(build_geometry(0, 0)['volume'])
if not isclose(static_volume, 0.0858, rel_tol=0.05):
    raise ValueError(f'Unexpected submerged volume {static_volume:g} m³ at nominal draft')
print(f'Nominal submerged volume {static_volume:.5f} m³')

# Measured running sinkage at the perpendiculars (Gothenburg Figure 4c).
forward, aft = 0.0093, 0.0024
geometry = build_geometry(forward, aft)
print(f'Running submerged volume {sum(geometry["volume"]):.5f} m³')
(work / 'geometry.json').write_text(json.dumps(geometry))

profile = []
for row in (work / 'profile-Fr028.dat').read_text().splitlines()[1:]:
    fraction, elevation = map(float, row.split(','))
    x = length * fraction
    # Bring the hull-relative profile to the undisturbed water datum.
    z = length * elevation - (forward + (aft - forward) * fraction)
    y = beam_at(waterline(surface(forward, aft, z)), x)
    if y <= 0:
        raise ValueError(f'Wave probe at station {fraction:g} has no hull intersection')
    profile.append([length / 2 - x, y, z])
if not profile:
    raise ValueError('The workshop wave profile has no measurements')
(work / 'profile-probes.json').write_text(json.dumps(profile))
