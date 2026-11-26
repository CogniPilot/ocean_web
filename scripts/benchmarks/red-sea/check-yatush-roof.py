"""Check the photographed roofs and open bow hatch in Yatush's distant LOD."""
import argparse
import json
from pathlib import Path
import runpy

import numpy as np
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector

Glb = runpy.run_path(str(Path(__file__).with_name("hull-lod.py")))["Glb"]


def height(glb, points):
    surface = glb.doc["meshes"][0]["primitives"][0]
    verts = glb.array(surface["attributes"]["POSITION"])
    faces = glb.array(surface["indices"]).reshape(-1, 3)
    mesh = trimesh.Trimesh(verts, faces, process=False)
    rays = np.tile([0, -1, 0], (len(points), 1))
    _, ids, hits = RayMeshIntersector(mesh).intersects_id(points, rays, return_locations=True, multiple_hits=False)
    result = np.full(len(points), np.nan)
    result[ids] = hits[:, 1]
    return result


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("site", type=Path)
    cli.add_argument("--compare", type=Path, help="Optional older distant LOD for comparison")
    args = cli.parse_args()
    dive, far = Glb(args.site / "dive.glb"), Glb(args.site / "far.glb")
    cap, other = (g.doc["meshes"][0]["primitives"][1] for g in (dive, far))
    for key in ("POSITION", "NORMAL"):
        assert np.array_equal(dive.array(cap["attributes"][key]), far.array(other["attributes"][key]))
    assert np.array_equal(dive.array(cap["indices"]), far.array(other["indices"]))

    x, z = (v.ravel() for v in np.meshgrid(np.arange(-8.6, 8.61, 0.05), np.arange(-2.3, 2.31, 0.05)))
    origins = np.column_stack([x, np.full(len(x), 8.0), z])
    ref = height(dive, origins)
    regions = {
        "wheelhouseRoof": (x >= 0.58) & (x <= 2.1) & (abs(z) <= 1.4),
        "aftCabinRoof": (x >= -5.48) & (x <= -2.65) & (abs(z) <= 1.23) & (ref > 2.9),
        "foreHatchOpening": (x >= 4.6) & (x <= 5.16) & (abs(z) <= 0.34),
    }

    def compare(glb):
        values = height(glb, origins)
        stats = {}
        for name, mask in regions.items():
            delta = np.abs(values[mask] - ref[mask])
            valid = delta[np.isfinite(delta)]
            stats[name] = {
                "rays": int(mask.sum()),
                "closedOpenRays": int(np.count_nonzero(np.isnan(ref[mask]) & np.isfinite(values[mask]))),
                "lostRoofOrDepthOver20cm": int(np.count_nonzero(np.isfinite(ref[mask]) &
                                                               (~np.isfinite(delta) | (delta > 0.2)))),
                "p95HeightErrorMetres": float(np.quantile(valid, 0.95)) if len(valid) else None,
            }
        return stats

    measurements = compare(far)
    assert measurements["wheelhouseRoof"]["lostRoofOrDepthOver20cm"] == 0
    assert measurements["aftCabinRoof"]["lostRoofOrDepthOver20cm"] <= 3
    assert measurements["aftCabinRoof"]["p95HeightErrorMetres"] < 0.04
    assert measurements["foreHatchOpening"]["closedOpenRays"] == 0
    path = args.site / "mesh-report.json"
    report = json.loads(path.read_text())
    report["distantRoofCheck"] = measurements
    path.write_text(json.dumps(report, indent=2) + "\n")
    print("Distant survey", measurements)
    if args.compare:
        print("Earlier model", compare(Glb(args.compare)))


if __name__ == "__main__":
    main()
