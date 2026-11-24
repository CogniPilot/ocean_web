"""Compress one complete startup sequence for the static propeller viewer."""
import argparse
import gzip
import json
import math
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("recording", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
meta = json.loads((args.recording / "flow.json").read_text())
sequence = meta["sequence"]
frames = sequence["frames"]
if not meta["startsFromRest"] or frames[0]["time"] != 0 or frames[0]["turns"] != 0:
    raise ValueError("Expected a recording starting from rest")
if any(a["time"] >= b["time"] for a, b in zip(frames, frames[1:])):
    raise ValueError("Frame times must increase")
names = ["flow.bin", "turn-geometry.bin"]
samples = math.prod(meta["volumeGrid"]["dims"])
for name, descriptors in sequence["fields"].items():
    file = f"turn-{name}.bin"
    if len(descriptors) != len(frames) or (args.recording / file).stat().st_size != 2*samples*len(frames):
        raise ValueError(f"Incomplete field {name}")
    names.append(file)
args.output.mkdir(exist_ok=True, parents=True)
for name in names:
    with (args.recording / name).open("rb") as src, (args.output / (name+".gz")).open("wb") as dest:
        with gzip.GzipFile(filename="", fileobj=dest, mode="wb", mtime=0, compresslevel=6) as stream:
            shutil.copyfileobj(src, stream)
meta["binaryCompression"] = "gzip"
(args.output / "flow.json").write_text(json.dumps(meta, separators=(",", ":"))+"\n")
