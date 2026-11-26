"""Test a level Piccard route from alongside Yatush into the photographed roofed cabin."""

import argparse
import importlib.util
import json
import re
from pathlib import Path

import numpy as np
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector

spec = importlib.util.spec_from_file_location("hull_lod", Path(__file__).with_name("hull-lod.py"))
hull_lod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hull_lod)

def piccard_half_extents():
    """Enclose the contact solids in the route frame, glTF X across, Y up, Z forward."""
    solids = (Path(__file__).resolve().parents[3] / "Wreck/PiccardSolids.mo").read_text()
    dome = np.fromstring(re.search(r"dome\[4\]=\{([^}]+)\}", solids)[1], sep=",")
    table = re.search(r"primitives\[count,7\]=\[([^\]]+)\]", solids)[1]
    rows = np.array([np.fromstring(line, sep=",") for line in table.split(";")])
    # Our finite cylinders and plates all align with the FLU axes.
    extents = rows[:, 3:6]
    lo = np.minimum((rows[:, :3] - extents).min(axis=0), dome[:3] - dome[3])
    hi = np.maximum((rows[:, :3] + extents).max(axis=0), dome[:3] + dome[3])
    return (hi - lo)[[1, 2, 0]] / 2


HALF_EXTENTS = piccard_half_extents()
# Original survey coordinates, kept independent of the derived glTF origin.
CABIN_ROUTE = np.array([
    [0.151575, 2.300160, 3.537716],
    [0.151575, 2.300160, 0.537716],
    [0.151575, 1.820160, 0.537716],
    [0.151575, 1.820160, 0.417716],
    [0.151575, 1.460160, 0.417716],
    [0.991575, 1.460160, 0.417716],
    [0.991575, 1.460160, 0.177716],
])


def intersects_box(triangles, lo, hi):
    """Triangle–AABB separating axis test for the continuous rectangular sweep."""
    shortlist = ((triangles.max(axis=1) >= lo) & (triangles.min(axis=1) <= hi)).all(axis=1)
    vertices = triangles[shortlist] - (lo + hi) * 0.5
    if not len(vertices):
        return False
    half = (hi - lo) * 0.5
    edges = np.roll(vertices, -1, axis=1) - vertices
    axes = [np.cross(edges[:, 0], edges[:, 1])]
    for unit in np.eye(3):
        axes.extend(np.cross(edges[:, edge], unit) for edge in range(3))
    overlapping = np.ones(len(vertices), dtype=bool)
    for axis in axes:
        projected = np.einsum("ijk,ik->ij", vertices, axis)
        limit = np.abs(axis) @ half
        overlapping &= (projected.min(axis=1) <= limit) & (projected.max(axis=1) >= -limit)
    return overlapping.any()


def survey_mesh(glb):
    vertices, faces = [], []
    for primitive in glb.doc["meshes"][0]["primitives"]:
        positions = glb.array(primitive["attributes"]["POSITION"])
        indices = glb.array(primitive["indices"]).reshape(-1, 3).astype(np.int64)
        faces.append(indices + sum(len(p) for p in vertices))
        vertices.append(positions)
    return trimesh.Trimesh(np.vstack(vertices), np.vstack(faces), process=False)


def verify(mesh, points):
    triangles = mesh.triangles
    def blocked(margin):
        extent = HALF_EXTENTS + margin
        return any(intersects_box(triangles, np.minimum(a, b) - extent,
                                  np.maximum(a, b) + extent)
                   for a, b in zip(points[:-1], points[1:]))

    if blocked(0.03):
        raise ValueError("The Piccard envelope or its 3 cm margin hits the wreck along the route")
    lower, upper = 0.03, 0.5
    for _ in range(12):
        mid = (lower + upper) / 2
        if blocked(mid):
            upper = mid
        else:
            lower = mid
    # A camera in open water can also have a clear sweep. Check that our
    # destination has actual overhead, deck and the two side walls.
    dirs = np.array([[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
    ends, idx, _ = RayMeshIntersector(mesh).intersects_location(
        np.tile(points[-1], (4, 1)), dirs, multiple_hits=False
    )
    if len(idx) != 4:
        raise ValueError("Missing scanned cabin enclosure at the route endpoint")
    ranges = np.empty(4)
    ranges[idx] = np.linalg.norm(ends - points[-1], axis=1)
    if (ranges > [2.65, 2, 3.85, 3.85]).any():
        raise ValueError("The endpoint is outside the photographed cabin")
    return {"extraClearanceEachAxisM":round(lower, 4), "endpointUpDownSideRangesM":ranges.round(4).tolist()}


def surface_error(source, target, seed):
    # Compare independently sampled surface area, beyond the single checked route.
    points, _ = trimesh.sample.sample_surface(source, 10000, seed=seed)
    distances = np.concatenate([
        trimesh.proximity.closest_point(target, chunk)[1]
        for chunk in np.array_split(points, 50)
    ])
    return dict(zip(("median", "p95", "p99", "maxSample"),
                    np.quantile(distances, [0.5, 0.95, 0.99, 1]).round(6).tolist()))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("asset", type=Path)
    args = p.parse_args()
    path = args.asset / "mesh-report.json"
    report = json.loads(path.read_text())
    points = CABIN_ROUTE - np.array(report["sourceOriginGltfXYZMetres"])
    result = {"envelopeDimensionsGltfXYZM":(2*HALF_EXTENTS).tolist(), "routeGltfXYZM":points.round(4).tolist()}
    meshes = {}
    for level in ("dive", "collision"):
        meshes[level] = survey_mesh(hull_lod.Glb(args.asset / (level + ".glb")))
        result[level] = verify(meshes[level], points)
    report["collisionSurfaceDistanceM"] = {
        "areaSamplesPerDirection":10000,
        "diveToCollision":surface_error(meshes["dive"], meshes["collision"], 3291),
        "collisionToDive":surface_error(meshes["collision"], meshes["dive"], 9307),
    }
    report["piccardCabinRoute"] = result
    path.write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
