"""Run a flooded-duct/closed-chamber regression and a three-grid sensitivity check."""

import argparse
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import trimesh


def make_fixture(path):
    parts = []

    def plate(size, center):
        box = trimesh.creation.box(extents=size)
        box.apply_translation(center)
        parts.append(box)

    for y in (-1, 1, 3):
        plate((4, 0.08, 2), (0, y, -3))
    for z in (-4, -2):
        plate((4, 4, 0.08), (0, 1, z))
    for x in (-2, 2):
        plate((0.08, 2, 2), (x, 2, -3))
    trimesh.util.concatenate(parts).export(path)


def probe(path, points):
    record = json.loads((path / "field.json").read_text())
    size = record["dimensions"]
    field = (
        np.fromfile(path / "velocity.i16", "<i2").reshape(*size[::-1], 3)
        * record["velocityScale"]
    )
    grid = (
        np.asarray(points) @ np.array(record["axes"]).T - record["firstCenter"]
    ) / record["spacingM"]
    base = np.floor(grid).astype(int)
    fraction = grid - base
    values = np.zeros((len(points), 3))
    for dx, dy, dz in np.ndindex(2, 2, 2):
        offset = np.array([dx, dy, dz])
        xyz = base + offset
        weights = np.where(offset, fraction, 1 - fraction).prod(axis=1)
        values += weights[:, None] * field[xyz[:, 2], xyz[:, 1], xyz[:, 0]]
    return record, values


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("fmu", type=Path)
    p.add_argument("directory", type=Path)
    args = p.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    mesh = args.directory / "flooded-duct.stl"
    make_fixture(mesh)
    probes = [[-2, 0, -3], [0, 0, -3], [2, 0, -3], [0, 2, -3]]
    experiments = [(0.25, 90), (0.16, 90), (0.125, 90), (0.25, 270)]
    results = []
    for h, bearing in experiments:
        output = args.directory / f"dx-{h}-bearing-{bearing}"
        subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("solve.py")),
                str(args.fmu),
                str(mesh),
                str(output),
                "--spacing",
                str(h),
                "--bearing",
                str(bearing),
                "--speed",
                ".3",
                "--floor",
                "-6",
                "--margin",
                "3",
                "--viscosity",
                ".03",
            ],
            check=True,
        )
        meta, velocity = probe(output, probes)
        assert meta["inletOutletMassImbalance"] < 0.001
        assert np.max(np.abs(velocity[3])) < 0.0001
        sign = 1 if bearing == 90 else -1
        assert np.min(sign * velocity[:3, 0]) > 0.1
        results.append(
            {"spacingM": h, "bearingTrueDeg": bearing, "velocityENU": velocity.tolist()}
        )
    ve = [np.array(run["velocityENU"]) for run in results]
    relative = np.max(np.linalg.norm(ve[2][:3] - ve[1][:3], axis=1)) / 0.3
    reverse = abs(ve[0][1, 0] + ve[3][1, 0]) / 0.3
    assert relative < 0.08, "finest pair open-duct probe sensitivity regression"
    assert reverse < 0.03, "open duct direction-symmetry regression"
    print(
        json.dumps(
            {
                "syntheticDuct": results,
                "finestPairProbeChangeOverInflow": relative,
                "reversedBearingCenterMismatchOverInflow": reverse,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
