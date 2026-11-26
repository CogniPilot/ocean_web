"""Check the exported lower-hull volume and upward rays; count the photographed shell's open edges separately."""

import argparse
import importlib.util
import json
from pathlib import Path
import numpy as np
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector

module = Path(__file__).with_name("hull-lod.py")
spec = importlib.util.spec_from_file_location("hull_lod", module)
hull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hull)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("profile", type=Path)
    p.add_argument("recording", type=Path)
    a = p.parse_args()
    h = hull.HullProfile(json.loads(a.profile.read_text()))
    report_file = a.recording / "mesh-report.json"
    report = json.loads(report_file.read_text())
    t = np.linspace(0.02, 0.98, 21)
    # Test positions inside each station interval, away from the mathematically zero-width rim.
    xs = np.concatenate(
        [
            np.linspace(lo, hi, 5, endpoint=False)[1:]
            for lo, hi in zip(h.st[:-1, 0], h.st[1:, 0])
        ]
    )
    x = np.repeat(xs, len(t))
    left = np.interp(x, h.st[:, 0], h.st[:, 2])
    right = np.interp(x, h.st[:, 0], h.st[:, 3])
    point = (
        np.array(
            [
                x,
                np.interp(x, h.st[:, 0], h.st[:, 1]),
                left + (right - left) * np.tile(t, len(xs)),
            ]
        ).T
        - h.origin
    )
    for name in ["dive", "far", "collision"]:
        obj = hull.Glb(a.recording / (name + ".glb"))
        scan, cap = obj.doc["meshes"][0]["primitives"]
        plate = trimesh.Trimesh(
            obj.array(cap["attributes"]["POSITION"]),
            obj.array(cap["indices"]).reshape(-1, 3),
            process=False,
        )
        assert plate.is_watertight and plate.is_winding_consistent and plate.volume > 0
        test = RayMeshIntersector(plate)
        hits = 0
        for d in [[0, 1, 0], [0.24, 1, 0.12], [-0.18, 1, -0.26]]:
            d = np.broadcast_to(d, point.shape)
            idx = test.intersects_first(np.asarray(point - 20 * d, dtype="f8"), d)
            if np.any(idx < 0):
                raise ValueError(
                    f"{name} contains an open underside at {point[idx < 0][0]}"
                )
            hits += len(idx)
        # Horizontal probes immediately above the trimming line catch a light
        # leak between the hull skin and the lower plate on either flank.
        cut = np.interp(xs, h.st[:, 0], h.st[:, 1])
        left = np.interp(xs, h.st[:, 0], h.st[:, 2])
        right = np.interp(xs, h.st[:, 0], h.st[:, 3])
        flank_hits = 0
        for side, sign in [(left, 1), (right, -1)]:
            origins = np.column_stack([xs, cut + 0.012, side - 2 * sign]) - h.origin
            d = np.broadcast_to([0.0, 0.0, sign], origins.shape)
            idx = test.intersects_first(origins, d)
            if np.any(idx < 0):
                raise ValueError(f"{name} is open on the lower hull flank")
            flank_hits += len(idx)
        verts = obj.array(scan["attributes"]["POSITION"]) + h.origin
        faces = obj.array(scan["indices"]).reshape(-1, 3)
        w, inv = np.unique(np.round(verts, 5), axis=0, return_inverse=True)
        t = inv[faces]
        edges = np.vstack((t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]))
        edges, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
        open_edges = edges[counts == 1]
        # Check the photographed edges that reach the lower cut, distinct from original windows/mesh borders.
        ep = w[open_edges]
        gap = np.abs(ep[:, :, 1] - np.interp(ep[:, :, 0], h.st[:, 0], h.st[:, 1]))
        at_cut = ep[(gap < 0.0003).all(axis=1)]
        positive_cut_gap = []
        if len(at_cut):
            samples = np.concatenate([at_cut[:, 0], at_cut.mean(axis=1), at_cut[:, 1]])
            z = samples[:, 2]
            x = samples[:, 0]
            positive_cut_gap = np.maximum.reduce(
                (
                    np.zeros(len(z)),
                    np.interp(x, h.st[:, 0], h.st[:, 2]) - z,
                    z - np.interp(x, h.st[:, 0], h.st[:, 3]),
                )
            )
        report[name]["undersideVerification"] = {
            "watertightVolumeM3": float(plate.volume),
            "nearCutHorizontalRayHits": flank_hits,
            "upwardRayHits": hits,
            "upwardRayCount": hits,
            "openEdgesInSurvey": int(len(open_edges)),
            "surveyLowerCutEdges": int(len(at_cut)),
            "maxCutLateralOverhangM": float(max(positive_cut_gap, default=0)),
        }
        print(name, report[name]["undersideVerification"], flush=True)
    if report.get("uvCheck", {}).get("maxUvDeviation", float("inf")) > 1e-5:
        raise ValueError(
            "Reconstructed face UV interpolation does not match the original triangle"
        )
    report_file.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
