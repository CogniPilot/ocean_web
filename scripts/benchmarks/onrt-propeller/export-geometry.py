"""Export the native wall patch and its closed CAD-derived input for inspection."""
import argparse
import gzip
import json
import re
import struct
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('poly_mesh', type=Path)
parser.add_argument('surface', type=Path, help='Input ASCII STL, coordinates in metres')
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=True, parents=True)


def entries(name):
    body = (args.poly_mesh / name).read_text().split('\n(\n', 1)[1]
    return body.split('\n)', 1)[0].splitlines()


def export(name, points, polygons):
    corners = np.concatenate(polygons)
    used, local = np.unique(corners, return_inverse=True)
    points = points[used]
    faces = np.split(local, np.cumsum([len(face) for face in polygons[:-1]]))
    boundary = np.concatenate([np.column_stack((f, np.roll(f, -1))) for f in faces])
    edges, incidence = np.unique(np.sort(boundary, axis=1), axis=0, return_counts=True)
    graph = coo_matrix((np.ones(len(edges)), edges.T), shape=(len(points), len(points)))
    count = connected_components(graph, directed=False, return_labels=False)
    if count != 1 or np.any(incidence != 2):
        raise ValueError(f'{name}: {count} components, {sum(incidence != 2)} open or nonmanifold edges')
    triangles = np.concatenate([np.column_stack((np.full(len(f)-2, f[0]), f[1:-1], f[2:])) for f in faces])
    a, b, c = points[triangles].transpose(1, 0, 2)
    normal = np.cross(b-a, c-a)
    volume = np.sum(a*normal)/6
    if volume < 0:
        triangles = triangles[:, ::-1]
    with (args.output / (name + '.bin.gz')).open('wb') as out:
        with gzip.GzipFile(fileobj=out, mode='wb', mtime=0) as archive:
            archive.write(struct.pack('<III', len(points), triangles.size, edges.size))
            archive.write(points.astype('<f4').tobytes())
            archive.write(triangles.astype('<u4').tobytes())
            archive.write(edges.astype('<u4').tobytes())
    return dict(faces=len(polygons), components=int(count), volume_cm3=abs(volume)*1e6,
                area_cm2=np.linalg.norm(normal, axis=1).sum()*5000)


vertices = np.asarray([line.split()[1:] for line in args.surface.read_text().splitlines()
                       if line.strip().startswith('vertex ')], dtype=float)
points, indices = np.unique(vertices, axis=0, return_inverse=True)
metrics = {'cad': export('cad', points, indices.reshape(-1, 3))}
patch = re.search(r'\bbody\s*\{[^}]*\bnFaces (\d+);\s*startFace (\d+);',
                  (args.poly_mesh / 'boundary').read_text())
size, start = map(int, patch.groups())
points = np.asarray([line.strip('()').split() for line in entries('points')], dtype=float)
polygons = [np.fromstring(line.split('(', 1)[1].rstrip(')'), dtype=int, sep=' ')
            for line in entries('faces')[start:start+size]]
metrics['wall'] = export('wall', points, polygons)
(args.output / 'geometry.json').write_text(json.dumps(metrics, indent=2)+'\n')
print(json.dumps(metrics))
