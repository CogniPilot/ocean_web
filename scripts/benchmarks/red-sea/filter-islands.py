"""Inspect spatially disconnected OBJ islands and optionally omit named components."""

import argparse
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree


def scan(path, tolerance):
    with path.open("rb") as file:
        vertex_count = face_count = 0
        for line in file:
            vertex_count += line.startswith(b"v ")
            face_count += line.startswith(b"f ")
    vertices = np.empty((vertex_count, 3), dtype=np.float64)
    faces = np.empty((face_count, 3), dtype=np.int32)
    nv = nf = 0
    with path.open("rb") as file:
        for line in file:
            if line.startswith(b"v "):
                vertices[nv] = line.split()[1:4]
                nv += 1
            elif line.startswith(b"f "):
                corners = line.split()[1:]
                if len(corners) != 3:
                    raise ValueError("Expected a triangulated OBJ")
                ids = [int(c.split(b"/", 1)[0]) for c in corners]
                faces[nf] = [i - 1 if i > 0 else nv + i for i in ids]
                nf += 1
    # Wavelength is far below source reconstruction accuracy. Use the geometric
    # coordinates only to join duplicate OBJ positions at texture/material seams.
    unique, inverse = np.unique(
        np.rint(vertices / tolerance).astype("i8"), axis=0, return_inverse=True
    )
    seam_faces = inverse[faces]
    edges = coo_matrix(
        (
            np.ones(2 * nf, dtype=bool),
            (seam_faces[:, [0, 1]].ravel(), seam_faces[:, [1, 2]].ravel()),
        ),
        shape=(len(unique), len(unique)),
    ).tocsr()
    _, welded_labels = connected_components(edges, directed=False)
    labels = welded_labels[inverse]
    face_labels = labels[faces[:, 0]]
    counts = np.bincount(face_labels, minlength=len(welded_labels))
    main = counts.argmax()
    return vertices, labels, face_labels, counts, main


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--weld", type=float, default=1e-5, help="Source units, classification only"
    )
    parser.add_argument(
        "--list",
        type=Path,
        required=True,
        help="TSV component counts, extents and distances",
    )
    parser.add_argument(
        "--reference-faces",
        type=int,
        default=500,
        help="Measure clearance to all islands at least this size",
    )
    parser.add_argument(
        "--drop",
        type=Path,
        help="Text file listing reviewed island IDs, whitespace separated",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Filtered OBJ, beside the MTL and referenced textures",
    )
    args = parser.parse_args()
    vertices, labels, face_labels, counts, main_id = scan(args.source, args.weld)
    reference = counts >= args.reference_faces
    reference[main_id] = True
    tree = cKDTree(vertices[reference[labels]])
    islands = np.unique(face_labels)
    order = np.argsort(labels)
    ordered_labels = labels[order]
    starts = np.searchsorted(ordered_labels, islands)
    ends = np.searchsorted(ordered_labels, islands, side="right")
    with args.list.open("w") as out:
        print("id faces nearest_vertex minX minY minZ maxX maxY maxZ", file=out)
        for i, a, b in zip(islands, starts, ends):
            points = vertices[order[a:b]]
            dist = 0.0 if reference[i] else float(tree.query(points)[0].min())
            print(
                i,
                counts[i],
                f"{dist:.5f}",
                *np.round(points.min(axis=0), 5),
                *np.round(points.max(axis=0), 5),
                file=out,
            )
    print(
        f"{len(islands)} face-connected islands; main island {main_id} has {counts[main_id]} faces."
    )
    if args.output is None:
        return
    drops = (
        np.array([int(v) for v in args.drop.read_text().split()], dtype=int)
        if args.drop
        else []
    )
    if main_id in drops or set(drops) - set(islands):
        raise ValueError("Unrecognized island ID or requested removal of the main hull")
    removed = np.isin(face_labels, drops)
    with args.source.open("rb") as src, args.output.open("wb") as out:
        f = 0
        for line in src:
            if line.startswith(b"f "):
                f += 1
                if removed[f - 1]:
                    continue
            out.write(line)
    print(f"Removed {len(drops)} reviewed islands, {removed.sum()} source faces.")


if __name__ == "__main__":
    main()
