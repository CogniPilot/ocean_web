"""Solve or reuse one harbor mean-current field and atomically select it for this server."""
import argparse
import array
import fcntl
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def encode(value):
    return json.dumps(value, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()


def select(root, descriptor):
    with tempfile.NamedTemporaryFile(dir=root, delete=False) as temp:
        temp.write(encode(descriptor))
    path = Path(temp.name)
    path.chmod(0o644)
    path.replace(root / "active.json")


def generate(cache, key, grid_file, fmu, runner, inlet, identity):
    entry = cache / key
    manifest = entry / "field.json"
    if manifest.exists():
        record = json.loads(manifest.read_bytes())
        if (record["key"] == key and record["identity"] == identity
                and record["diagnostics"]["converged"] is True
                and all(digest(entry / name) == checksum for name, checksum in record["sha256"].items())):
            return "reused"
        raise ValueError(f"Invalid cached field at {entry}")
    grid = json.loads(grid_file.read_bytes())
    faces = [grid[k] for k in ("eastFaces", "northFaces", "upFaces")]
    if any(len(axis) < 3 or not all(math.isfinite(x) for x in axis)
           or not all(a < b for a, b in zip(axis, axis[1:])) for axis in faces):
        raise ValueError("Invalid grid face coordinates")
    cells = math.prod(len(axis) - 1 for axis in faces)
    mask = bytes(grid["wallMask"])
    if len(mask) != cells or any(v > 127 for v in mask):
        raise ValueError("Invalid grid walls")
    with tempfile.TemporaryDirectory(dir=cache) as scratch:
        staging = Path(scratch) / "field"
        staging.mkdir()
        subprocess.run([sys.executable, str(runner), str(fmu), str(grid_file),
                        str(inlet[0]), str(inlet[1]), str(staging)], check=True)
        diag = json.loads((staging / "diagnostics.json").read_bytes())
        if diag.get("converged") is not True:
            raise ValueError("Solver did not converge")
        velocity = staging / "velocity.f32"
        if velocity.stat().st_size != cells * 12:
            raise ValueError("Incomplete three-component field")
        values = array.array("f")
        with velocity.open("rb") as stream:
            values.fromfile(stream, 3 * cells)
        if sys.byteorder != "little":
            values.byteswap()
        if not all(map(math.isfinite, values)):
            raise ValueError("Nonfinite flow")
        velocity.chmod(0o644)
        (staging / "walls.u8").write_bytes(mask)
        record = dict(format="harbor-current-v1", key=key, identity=identity,
                      incident=[*inlet, 0], faces=faces, diagnostics=diag,
                      sha256={name: digest(staging / name) for name in ("velocity.f32", "walls.u8")})
        (staging / "field.json").write_bytes(encode(record))
        staging.rename(entry)
    return "computed"


def publish(root, fmu, grid, east, north):
    if not all(map(math.isfinite, (east, north))):
        raise ValueError("Current components must be finite")
    inlet = [east or 0.0, north or 0.0]
    root.mkdir(parents=True, exist_ok=True)
    # Serialize selectors as well as cache misses. A failed solve leaves the previous field active.
    with (root / ".publish.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not any(inlet):
            select(root, {"format": "harbor-current-v1", "incident": [0, 0, 0]})
            return "calm"
        runner = Path(__file__).with_name("run.py")
        identity = dict(mesh=digest(grid), fmu=digest(fmu), runner=digest(runner),
                        incident=inlet, format="harbor-current-v1")
        key = hashlib.sha256(encode(identity)).hexdigest()
        result = generate(root, key, grid, fmu, runner, inlet, identity)
        select(root, dict(format="harbor-current-v1", incident=[*inlet, 0], field=key,
                          manifestSha256=digest(root / key / "field.json")))
        return f"{result} {key}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("viewer/assets/harbor-current"))
    parser.add_argument("--grid", type=Path, default=Path("build/harbor-flow/grid.json"))
    parser.add_argument("--fmu", type=Path, default=Path("build/harbor-flow/HarborCurrentSolver.fmu"))
    parser.add_argument("--east", type=float, help="Eastward inlet velocity in m/s")
    parser.add_argument("--north", type=float, help="Northward inlet velocity in m/s")
    parser.add_argument("--speed", type=float, help="Inlet speed in m/s, paired with --bearing")
    parser.add_argument("--bearing", type=float, help="True bearing the water flows toward, clockwise from north")
    args = parser.parse_args()
    if args.speed is not None or args.bearing is not None:
        if args.speed is None or args.bearing is None or args.east is not None or args.north is not None:
            parser.error("Supply either --speed and --bearing or east/north components")
        if not math.isfinite(args.speed) or args.speed < 0 or not math.isfinite(args.bearing):
            parser.error("Expected finite bearing and finite nonnegative speed")
        angle = math.radians(args.bearing % 360)
        east = args.speed * round(math.sin(angle), 15)
        north = args.speed * round(math.cos(angle), 15)
    elif args.east is None and args.north is None:
        east, north = .20, .04
    else:
        east, north = args.east or 0., args.north or 0.
    print(publish(args.output, args.fmu, args.grid, east, north))
