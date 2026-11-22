#!/usr/bin/env python3
"""Bake a seamless sunlight flux tile by tracing through a periodic height field."""
import math
from pathlib import Path
import struct
import zlib

SIZE = 256
PERIOD = 12
DEPTH = 5
SPACING = PERIOD / SIZE
PHASES = [
    (1, 2, .040, .13),
    (3, -1, .026, 2.10),
    (2, 3, .018, 3.40),
    (0, 5, .010, 1.30),
    (6, -2, .007, 1.80),
]
MODES = [(math.tau * a / PERIOD, math.tau * b / PERIOD, amp, phase)
         for a, b, amp, phase in PHASES]

density = [0.0] * (SIZE * SIZE)
refraction = 1 / 1.333
for y in range(SIZE * 2):
    north = (.25 + .5 * y) * SPACING
    for x in range(SIZE * 2):
        east = (.25 + .5 * x) * SPACING
        dx = dy = 0.0
        for kx, ky, amplitude, phase in MODES:
            gradient = amplitude * math.cos(kx * east + ky * north + phase)
            dx += gradient * kx
            dy += gradient * ky
        nz = 1 / math.sqrt(1 + dx * dx + dy * dy)
        bend = math.sqrt(1 - refraction * refraction * (1 - nz * nz)) - refraction * nz
        travel = DEPTH / (refraction + bend * nz)
        u = (east + travel * bend * dx * nz) / SPACING
        v = (north + travel * bend * dy * nz) / SPACING
        i, j = math.floor(u), math.floor(v)
        a, b = u - i, v - j
        for row, weight_y in [(j, 1 - b), (j + 1, b)]:
            for column, weight_x in [(i, 1 - a), (i + 1, a)]:
                density[(row % SIZE) * SIZE + column % SIZE] += .25 * weight_y * weight_x

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

pixels = bytes(min(255, round(255 * .13 * level)) for level in density)
rows = b''.join(b'\0' + pixels[y:y + SIZE] for y in range(0, len(pixels), SIZE))
output = Path(__file__).resolve().parent.parent / 'viewer/assets/caustic-flux.png'
output.write_bytes(
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 0, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(rows, 9))
    + chunk(b'IEND', b'')
)
