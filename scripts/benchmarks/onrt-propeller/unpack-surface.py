"""Recover the bundled inspection surface as an ASCII STL in metres."""
import argparse
import gzip
import struct
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('geometry', help='viewer/assets/onrt/geometry/cad.bin.gz')
parser.add_argument('stl', help='new ASCII STL file')
args = parser.parse_args()

with gzip.open(args.geometry, 'rb') as stream:
    n, nt, ne = struct.unpack('<III', stream.read(12))
    vertices = np.frombuffer(stream.read(12*n), dtype='<f4').reshape(n, 3).astype(float)
    faces = np.frombuffer(stream.read(4*nt), dtype='<u4').reshape(-1, 3)
with open(args.stl, 'x') as out:
    print('solid port', file=out)
    for a, b, c in vertices[faces]:
        normal = np.cross(b-a, c-a)
        normal /= np.linalg.norm(normal)
        print('facet normal %.16g %.16g %.16g' % tuple(normal), 'outer loop', sep='\n', file=out)
        for point in (a, b, c):
            print('vertex %.16g %.16g %.16g' % tuple(point), file=out)
        print('endloop', 'endfacet', sep='\n', file=out)
    print('endsolid port', file=out)
