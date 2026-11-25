"""Pack a Meshing.writeBodySTL centroid fan as a viewer surface with native polygon edges."""
import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stl", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
with args.stl.open() as stream:
    rows = [line.split()[1:] for line in stream if line.startswith("vertex ")]
triangles = np.asarray(rows, dtype=float).reshape(-1, 3, 3)
points, indices = np.unique(triangles.reshape(-1, 3), axis=0, return_inverse=True)
indices = indices.reshape(-1, 3)
# The first vertex is the face centre. Only the opposite edge is a native mesh edge.
boundary = indices[:, 1:]
edges, counts = np.unique(np.sort(boundary, axis=1), axis=0, return_counts=True)
if np.any(counts != 2):
    raise ValueError("Study wall contains open or nonmanifold edges")
wall_points, local_edges = np.unique(edges, return_inverse=True)
graph = coo_matrix((np.ones(len(edges)), local_edges.reshape(-1, 2).T),
                   shape=(len(wall_points), len(wall_points)))
shells = connected_components(graph, directed=False, return_labels=False)
a, b, c = triangles.transpose(1, 0, 2)
area_vectors = np.cross(b-a, c-a)
volume = np.sum(a*area_vectors)/6
if volume <= 0:
    raise ValueError("Expected a positive outward-wound wall volume")
with args.output.open("wb") as output, gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as archive:
    archive.write(struct.pack("<III", len(points), indices.size, edges.size))
    archive.write(points.astype("<f4").tobytes())
    archive.write(indices.astype("<u4").tobytes())
    archive.write(edges.astype("<u4").tobytes())
print(json.dumps(dict(faces=int(1+np.count_nonzero(np.diff(indices[:,0]))), components=int(shells),
                      area_cm2=np.linalg.norm(area_vectors, axis=1).sum()*5000, volume_cm3=volume*1e6)))
