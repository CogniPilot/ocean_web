"""Remove the scanned seabed, reconstruct the missing lower hull and derive a collision surface."""

import argparse
import json
from pathlib import Path
import struct
import numpy as np
import fast_simplification

DTYPES = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
TYPES = {n: k for k, n in WIDTHS.items()}


class Glb:
    def __init__(self, path):
        data = path.read_bytes()
        n = struct.unpack_from("<I", data, 12)[0]
        self.doc = json.loads(data[20 : 20 + n])
        self.data = data[28 + n :]

    def array(self, index):
        a = self.doc["accessors"][index]
        v = self.doc["bufferViews"][a["bufferView"]]
        dtype = np.dtype(DTYPES[a["componentType"]])
        width = WIDTHS[a["type"]]
        stride = v.get("byteStride", width * dtype.itemsize)
        out = np.ndarray(
            (a["count"], width),
            dtype=dtype,
            buffer=self.data,
            offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
            strides=(stride, dtype.itemsize),
        ).copy()
        if a.get("normalized"):
            out = out.astype("f8") / np.iinfo(dtype).max
        return out


class Writer:
    def __init__(self, name):
        self.bytes = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "Ocean Web wreck hull trim"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0, "name": name}],
            "meshes": [{"primitives": []}],
            "buffers": [{}],
            "bufferViews": [],
            "accessors": [],
        }

    def blob(self, data, target=None):
        self.bytes.extend(b"\0" * (-len(self.bytes) % 4))
        view = {"buffer": 0, "byteOffset": len(self.bytes), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.doc["bufferViews"].append(view)
        self.bytes.extend(data)
        return len(self.doc["bufferViews"]) - 1

    def accessor(self, array, name):
        a = np.asarray(array)
        if name == "indices":
            a = a.reshape(-1, 1)
            component = 5123 if a.max() <= 65535 else 5125
        elif name == "COLOR_0":
            component = 5121
            if a.shape[1] == 3:
                a = np.column_stack(
                    (a, np.ones(len(a)))
                )  # Four-byte aligned vertex colour.
            a = np.rint(np.clip(a, 0, 1) * 255)
        else:
            component = 5126
        a = np.ascontiguousarray(a, dtype=DTYPES[component])
        ref = {
            "bufferView": self.blob(a.tobytes(), 34963 if name == "indices" else 34962),
            "count": len(a),
            "type": TYPES[a.shape[1]],
            "componentType": component,
        }
        if name == "POSITION":
            ref.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        if name == "COLOR_0":
            ref["normalized"] = True
        self.doc["accessors"].append(ref)
        return len(self.doc["accessors"]) - 1

    def primitive(self, attrs, faces, material=None):
        prim = {
            "attributes": {k: self.accessor(v, k) for k, v in attrs.items()},
            "indices": self.accessor(faces, "indices"),
        }
        if material is not None:
            prim["material"] = material
        self.doc["meshes"][0]["primitives"].append(prim)

    def source_material(self, glb):
        for key in ("samplers", "textures", "materials", "images"):
            if key in glb.doc:
                self.doc[key] = [dict(o) for o in glb.doc[key]]
        for image in self.doc.get("images", []):
            old = glb.doc["bufferViews"][image["bufferView"]]
            start = old.get("byteOffset", 0)
            image["bufferView"] = self.blob(glb.data[start : start + old["byteLength"]])

    def save(self, path):
        self.doc["buffers"][0]["byteLength"] = len(self.bytes)
        self.bytes.extend(b"\0" * (-len(self.bytes) % 4))
        head = json.dumps(self.doc, separators=(",", ":"), allow_nan=False).encode()
        head += b" " * (-len(head) % 4)
        path.write_bytes(
            struct.pack("<4sII", b"glTF", 2, 28 + len(head) + len(self.bytes))
            + struct.pack("<I4s", len(head), b"JSON")
            + head
            + struct.pack("<I4s", len(self.bytes), b"BIN\0")
            + self.bytes
        )


class HullProfile:
    def __init__(self, config):
        self.st = np.asarray(config["stations"], float)
        self.flare = float(config["flareHeight"])
        x, cut, left, right, keel, up_left, up_right = self.st.T
        if (
            len(x) < 2
            or self.flare <= 0
            or np.any(np.diff(x) <= 0)
            or np.any(left >= right)
            or np.any(keel >= cut)
            or np.any(up_left > left)
            or np.any(up_right < right)
        ):
            raise ValueError("Invalid keel/hull station limits")
        self.origin = np.array(
            [(x[0] + x[-1]) / 2, keel.min(), (up_left.min() + up_right.max()) / 2]
        )

    def bounds(self, p):
        x, y, z = p.T
        cut, left, right, _, up_left, up_right = [
            np.interp(x, self.st[:, 0], v) for v in self.st.T[1:]
        ]
        alpha = np.clip((y - cut) / self.flare, 0, 1)
        return np.column_stack(
            [
                x - self.st[0, 0],
                self.st[-1, 0] - x,
                y - cut,
                z - (left + alpha * (up_left - left)),
                (right + alpha * (up_right - right)) - z,
            ]
        )

    def cap(self):
        # Sweep the lower hull and a short inward lip. The lip overlaps the
        # photographed skin at the cut even where its scanned edge is ragged.
        # The synthetic floor stays below the lowest retained hatchways.
        sections = []
        for x, y, left, right, keel, _, _ in self.st:
            mid = (left + right) / 2
            inset = min(0.14, (right - left) * 0.10)
            rise = min(0.16, (y - keel) * 0.45)
            sections.append([x, y + rise, left + inset])
            sections.extend(
                [
                    [x, keel + (y - keel) * h, mid + t * (right - left) / 2]
                    for t, h in [
                        (-1, 1),
                        (-0.89, 0.68),
                        (-0.62, 0.31),
                        (-0.28, 0.08),
                        (0, 0),
                        (0.28, 0.08),
                        (0.62, 0.31),
                        (0.89, 0.68),
                        (1, 1),
                    ]
                ]
            )
            sections.append([x, y + rise, right - inset])
        p = np.array(sections)
        n = 11
        tri = []
        for row in range(len(self.st) - 1):
            for j in range(n):
                a = row * n + j
                b = row * n + (j + 1) % n
                tri.extend([[a, b, b + n], [a, b + n, a + n]])
        # Caps on the end stations close the transom and the swept bow.
        for start, reverse in [(0, True), (len(p) - n, False)]:
            for j in range(1, n - 1):
                face = [start, start + j, start + j + 1]
                tri.append(face[::-1] if reverse else face)
        tri = np.array(tri, dtype=np.int32)
        # Match the glTF right-handed convention and consistently face outward.
        local = p - self.origin
        volume = (
            np.einsum(
                "ij,ij->i",
                local[tri[:, 0]],
                np.cross(local[tri[:, 1]], local[tri[:, 2]]),
            ).sum()
            / 6
        )
        if volume < 0:
            tri = tri[:, ::-1].copy()
        return local, tri


def clip_scan(glb, profile, to_source):
    prim = glb.doc["meshes"][0]["primitives"][0]
    fields = {name: glb.array(id) for name, id in prim["attributes"].items()}
    # Some scan vertices share position but have different photographed UVs. Always interpolate in their original face.
    keys = list(fields)
    offsets = np.cumsum([0] + [fields[k].shape[1] for k in keys])
    spans = {k: slice(offsets[i], offsets[i + 1]) for i, k in enumerate(keys)}
    fields["POSITION"] = fields["POSITION"] @ to_source[:3, :3].T + to_source[:3, 3]
    packed = np.column_stack([fields[k] for k in keys]).astype("f8")
    original = glb.array(prim["indices"]).reshape(-1, 3)
    dist = profile.bounds(fields["POSITION"])
    inside = dist >= -1e-7
    all_inside = inside.all(axis=1)[original].all(axis=1)
    rejected = (~inside[original].any(axis=1)).any(axis=1)
    faces = original[all_inside].tolist()
    new = []
    position = spans["POSITION"]
    max_uv_error = 0.0
    checked_corners = 0

    # Sutherland-Hodgman clipping in each source triangle. The bounds vary with
    # the hull stations. Bisection finds the intersection on the original edge.
    for ids in original[~(all_inside | rejected)]:
        poly = packed[ids]
        for plane in range(5):
            if not len(poly):
                break
            d = profile.bounds(poly[:, position])[:, plane]
            if np.all(d >= -1e-7):
                continue
            result = []
            for j, now in enumerate(poly):
                prev = poly[j - 1]
                a = d[j - 1]
                b = d[j]
                if (a >= 0) != (b >= 0):
                    lo = 0.0
                    hi = 1.0
                    # Midpoint residual corrects the nonlinear flare bounds. Linear cuts are exact in one evaluation.
                    weight = np.clip(a / (a - b), 0, 1)
                    pt = prev + weight * (now - prev)
                    residual = profile.bounds(pt[None, position])[0, plane]
                    if abs(residual) > 1e-5:
                        for _ in range(12):
                            if (residual >= 0) == (a >= 0):
                                lo = weight
                            else:
                                hi = weight
                            weight = (hi + lo) / 2
                            pt = prev + weight * (now - prev)
                            residual = profile.bounds(pt[None, position])[0, plane]
                    result.append(pt)
                if b >= 0:
                    result.append(now)
            poly = np.array(result)
        if len(poly) >= 3:
            if "TEXCOORD_0" in spans:
                source = packed[ids]
                basis = source[1:, position] - source[0, position]
                bary, _, rank, _ = np.linalg.lstsq(
                    basis.T, (poly[:, position] - source[0, position]).T, rcond=1e-9
                )
                if rank == 2:
                    uv = spans["TEXCOORD_0"]
                    reference = source[0, uv] + bary.T @ (
                        source[1:, uv] - source[0, uv]
                    )
                    max_uv_error = max(
                        max_uv_error, float(np.max(np.abs(poly[:, uv] - reference)))
                    )
                    checked_corners += len(poly)
            first = len(packed) + len(new)
            new.extend(poly)
            faces.extend(
                [first, first + i, first + i + 1] for i in range(1, len(poly) - 1)
            )
    values = np.vstack((packed, np.array(new).reshape(-1, packed.shape[1])))
    faces = np.asarray(faces, int)
    used, remap = np.unique(faces, return_inverse=True)
    attrs = {k: values[used, span].copy() for k, span in spans.items()}
    # All selected source files use +X forward, +Y up and metre scale. Undoing
    # the original centering above keeps the original photographic registration.
    attrs["POSITION"] -= profile.origin
    if "NORMAL" in attrs:
        n = attrs["NORMAL"]
        n /= np.maximum(1e-12, np.linalg.norm(n, axis=1))[:, None]
    return (
        attrs,
        remap.reshape(-1, 3),
        {"clippedCorners": checked_corners, "maxUvDeviation": max_uv_error},
    )


def contact(attrs, faces, count):
    xyz, indices = np.unique(
        np.round(attrs["POSITION"], 6), axis=0, return_inverse=True
    )
    t = indices[faces]
    a, b, c = t.T
    keep = (a != b) & (b != c) & (c != a)
    vertices, triangles = fast_simplification.simplify(
        xyz, np.asarray(t[keep], np.int32), target_count=count, agg=7
    )
    return {"POSITION": vertices}, triangles


def cap_check(p, tri):
    edges = np.vstack((tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]))
    if np.any(np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)[1] != 2):
        raise ValueError("Lower hull contains an open edge")
    if len(np.unique(edges, axis=0)) != len(edges):
        raise ValueError("Lower hull contains inconsistent winding")
    return len(edges) // 2



def plating_normals(positions, triangles):
    """Angle weighting avoids a visible lighting seam along each quad diagonal."""
    points = positions[triangles]
    face_normals = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    areas = np.linalg.norm(face_normals, axis=1)
    valid = areas > 1e-12
    face_normals[valid] /= areas[valid, None]
    normals = np.zeros_like(positions)
    for corner in range(3):
        left = points[:, (corner - 1) % 3] - points[:, corner]
        right = points[:, (corner + 1) % 3] - points[:, corner]
        angles = np.arctan2(areas, np.einsum("ij,ij->i", left, right))
        np.add.at(normals, triangles[:, corner], angles[:, None] * face_normals)
    lengths = np.linalg.norm(normals, axis=1)
    if np.any(lengths < 1e-12):
        raise ValueError("Lower hull contains a vertex without a valid normal")
    return normals / lengths[:, None]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument(
        "source", type=Path, help="Input untrimmed GLBs and mesh-report.json"
    )
    cli.add_argument("profile", type=Path)
    cli.add_argument("output", type=Path)
    cli.add_argument("--collision-faces", type=int, default=7400)
    args = cli.parse_args()
    if args.source.resolve() == args.output.resolve():
        raise ValueError("Keep the untrimmed inputs separate from the deliverables")
    first = json.loads((args.source / "mesh-report.json").read_text())
    config = json.loads(args.profile.read_text())
    h = HullProfile(config)
    start = np.array(first["sourceToBlenderZUp"])[[0, 2, 1, 3]]
    start[2] *= -1
    if not np.allclose(start[:3, :3], np.eye(3)):
        raise ValueError("Expected source +Y up, +X bow, metre scale")
    source_from_gltf = np.linalg.inv(start)
    cap, plate = h.cap()
    paired_edges = cap_check(cap, plate)
    cap_normals = plating_normals(cap, plate)
    args.output.mkdir(exist_ok=True, parents=True)
    report = {
        "format": "trimmed-wreck-v1",
        "sourceOriginGltfXYZMetres": h.origin.tolist(),
        "preTrimSimplification": first,
        "hullProfile": args.profile.name,
        "closure": {
            "pairedEdges": paired_edges,
            "triangles": len(plate),
            "syntheticLowerHull": True,
        },
    }
    if "islandCleanup" in config:
        report["islandCleanup"] = config["islandCleanup"]
    for kind in ["far", "dive", "collision"]:
        if kind == "collision":
            attrs, faces = contact(dive_attrs, dive_faces, args.collision_faces)
        else:
            glb = Glb(args.source / (kind + ".glb"))
            attrs, faces, uv = clip_scan(glb, h, source_from_gltf)
            if kind == "dive":
                report["uvCheck"] = uv
                dive_attrs, dive_faces = attrs, faces
        out = Writer(args.output.name + " " + kind)
        out.doc["asset"]["copyright"] = (
            "Source survey: VISEAON - Treibitz Marine Imaging Lab, University of Haifa. "
            "M. Yuval and T. Treibitz, DOI 10.5281/zenodo.10988972. CC BY 4.0. "
            + (
                "Yatush survey with Dmitry Churilov, IUI Eilat. "
                if args.profile.stem.startswith("yatush")
                else ""
            )
            + "Ocean Web adaptations: cleanup, decimation, seabed trimming and reconstructed lower hull."
        )
        if kind != "collision":
            out.source_material(glb)
            out.doc["materials"].append(
                {
                    "name": "Reconstructed lower hull",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": [0.027, 0.080, 0.087, 1.0],
                        "roughnessFactor": 0.95,
                        "metallicFactor": 0.05,
                    },
                }
            )
        out.primitive(attrs, faces, None if kind == "collision" else 0)
        out.primitive(
            {"POSITION": cap} if kind == "collision" else {"POSITION": cap, "NORMAL": cap_normals},
            plate,
            None if kind == "collision" else len(out.doc["materials"]) - 1,
        )
        file = args.output / (kind + ".glb")
        out.save(file)
        box = np.vstack([attrs["POSITION"], cap])
        report[kind] = {
            "faces": len(faces) + len(plate),
            "surveyFaces": len(faces),
            "bytes": file.stat().st_size,
            "boundsGltf": [box.min(axis=0).tolist(), box.max(axis=0).tolist()],
        }
        print(kind, report[kind], flush=True)
    (args.output / "mesh-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
