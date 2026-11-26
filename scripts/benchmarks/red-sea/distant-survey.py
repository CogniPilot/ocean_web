"""Derive a photographed distant surface from a registered dive GLB using meshoptimizer v0.25."""
import argparse
import ctypes as c
from io import BytesIO
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image

glb = runpy.run_path(str(Path(__file__).with_name("hull-lod.py")))
Glb, Writer = glb["Glb"], glb["Writer"]


def simplify(lib, attrs, faces, target):
    # Merge only genuinely identical corners. A UV seam keeps both original UVs.
    exact = np.column_stack(list(attrs.values()))
    _, first, lookup = np.unique(exact, axis=0, return_index=True, return_inverse=True)
    attrs = {key: values[first] for key, values in attrs.items()}
    indices = np.ascontiguousarray(lookup[faces.reshape(-1)], dtype=np.uint32)
    pos = np.ascontiguousarray(attrs["POSITION"], dtype=np.float32)
    signals = np.ascontiguousarray(np.column_stack([attrs["TEXCOORD_0"], attrs["NORMAL"]]), dtype=np.float32)
    # Keep both skins of the thin photographed wheelhouse roof fixed.
    lock = np.ascontiguousarray(pos[:, 1] >= 4.12, dtype=np.uint8)
    # At photo seams the same point can have multiple UVs. Count distinct
    # geometric edges before locking the physical rims of both deck hatches.
    positions, weld = np.unique(pos, axis=0, return_inverse=True)
    corners = weld[indices].reshape(-1, 3)
    edges = np.vstack([corners[:, [0, 1]], corners[:, [1, 2]], corners[:, [2, 0]]])
    edges.sort(axis=1)
    edges, counts = np.unique(edges, axis=0, return_counts=True)
    border = np.zeros(len(positions), dtype=bool)
    border[edges[counts == 1].ravel()] = True
    x, y, z = pos.T
    aft_deck = (x > -6.1) & (x < -1.15) & (y > 2.8) & (y < 3.3)
    bow_hatch = (x > 4.15) & (x < 5.6) & (abs(z) < 0.8) & (y > 2.4)
    lock |= border[weld] & (aft_deck | bow_hatch)
    output = np.empty_like(indices)
    weights = np.array([0.35, 0.35, 0.045, 0.045, 0.045], dtype=np.float32)
    error = c.c_float()
    fn = c.CDLL(str(lib.resolve())).meshopt_simplifyWithAttributes
    ptr, size = c.c_void_p, c.c_size_t
    fn.argtypes = [ptr, ptr, size, ptr, size, size, ptr, size, ptr, size, ptr,
                   size, c.c_float, c.c_uint, c.POINTER(c.c_float)]
    fn.restype = size
    count = fn(output.ctypes.data, indices.ctypes.data, len(indices), pos.ctypes.data,
               len(pos), pos.strides[0], signals.ctypes.data, signals.strides[0],
               weights.ctypes.data, len(weights), lock.ctypes.data, target * 3, 0.10, 0, c.byref(error))
    kept, local = np.unique(output[:count], return_inverse=True)
    return {name: values[kept] for name, values in attrs.items()}, local.reshape(-1, 3), error.value


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site", type=Path)
    p.add_argument("--meshoptimizer-lib", type=Path, required=True)
    p.add_argument("--survey-faces", type=int, default=7000)
    p.add_argument("--texture-size", type=int, default=512)
    args = p.parse_args()
    dive = Glb(args.site / "dive.glb")
    out = Writer(args.site.name + " distant")
    out.doc["asset"] = dict(dive.doc["asset"], generator="Ocean Web topology-aware survey reduction")
    for key in ("samplers", "textures", "materials", "images"):
        out.doc[key] = [dict(item) for item in dive.doc[key]]
    for image in out.doc["images"]:
        view = dive.doc["bufferViews"][image["bufferView"]]
        at = view.get("byteOffset", 0)
        original = Image.open(BytesIO(dive.data[at:at + view["byteLength"]]))
        original.thumbnail((args.texture_size, args.texture_size), Image.Resampling.LANCZOS)
        payload = BytesIO()
        original.convert("RGB").save(payload, format="JPEG", quality=84, optimize=True)
        image.update(bufferView=out.blob(payload.getvalue()), mimeType="image/jpeg")
    bounds, counts = [], []
    for i, primitive in enumerate(dive.doc["meshes"][0]["primitives"]):
        attrs = {key: dive.array(idx) for key, idx in primitive["attributes"].items()}
        faces = dive.array(primitive["indices"]).reshape(-1, 3)
        if i == 0:
            attrs, faces, error = simplify(args.meshoptimizer_lib, attrs, faces, args.survey_faces)
        out.primitive(attrs, faces, primitive["material"])
        counts.append(len(faces))
        bounds.append(attrs["POSITION"])
    path = args.site / "far.glb"
    out.save(path)
    points = np.vstack(bounds)
    stats = {"faces": sum(counts), "surveyFaces": counts[0], "bytes": path.stat().st_size,
             "boundsGltf": [points.min(0).tolist(), points.max(0).tolist()],
             "method": "meshoptimizer v0.25 attribute-aware edge collapse on the final dive surface",
             "normalizedSimplificationError": error, "atlasPixels": args.texture_size}
    report_path = args.site / "mesh-report.json"
    report = json.loads(report_path.read_text())
    report["far"] = stats
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(stats)


if __name__ == "__main__":
    main()
