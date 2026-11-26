"""Link intersections preserve thin plates and both sides of flooded shells."""

import numpy as np

DIRECTIONS = np.array(
    [
        [0, 0, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
        [1, 1, 0],
        [-1, -1, 0],
        [1, -1, 0],
        [-1, 1, 0],
        [1, 0, 1],
        [-1, 0, -1],
        [1, 0, -1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, -1],
        [0, 1, -1],
        [0, -1, 1],
    ]
)
OPPOSITE = [np.flatnonzero((DIRECTIONS == -d).all(1))[0] for d in DIRECTIONS]


def frame(bearing):
    angle = np.deg2rad(bearing)
    return np.array(
        [
            [np.sin(angle), np.cos(angle), 0],
            [-np.cos(angle), np.sin(angle), 0],
            [0, 0, 1],
        ]
    )


def grid(triangles, bearing, spacing, floor, surface, margin):
    axes = frame(bearing)
    local = triangles @ axes.T
    low = local.min(axis=(0, 1)) - [margin, margin, 0]
    high = local.max(axis=(0, 1)) + [margin * 2, margin, 0]
    low[2], high[2] = floor, surface
    dims = np.ceil((high - low) / spacing - 1e-10).astype(int)
    if min(dims) < 3 or np.prod(dims, dtype=np.int64) > np.iinfo(np.int32).max // 19:
        raise ValueError("Grid dimensions outside D3Q19 device indexing range")
    origin = low + 0.5 * spacing
    return (local - origin) / spacing, dims, origin, axes


def wall_links(triangles, dims):
    """Möller–Trumbore two-sided segment intersections paired by construction."""
    nx, ny, nz = dims
    blocked = np.zeros((nz, ny, nx), dtype=np.uint32)
    for tri in triangles:
        edge1, edge2 = tri[1] - tri[0], tri[2] - tri[0]
        lower = np.maximum(np.floor(tri.min(axis=0) - 1).astype(int), 0)
        upper = np.minimum(np.ceil(tri.max(axis=0) + 1).astype(int), dims - 1)
        if np.any(lower > upper):
            continue
        points = np.indices(upper - lower + 1).reshape(3, -1).T + lower
        relative = points - tri[0]
        cross = np.cross(relative, edge1)
        eps = 1e-9
        for q in range(1, len(DIRECTIONS), 2):
            delta = DIRECTIONS[q]
            h = np.cross(delta, edge2)
            det = np.dot(edge1, h)
            if abs(det) < 1e-12:
                continue
            u, v, t = (relative @ h) / det, (cross @ delta) / det, (cross @ edge2) / det
            other = points + delta
            mask = (
                (u >= -eps)
                & (v >= -eps)
                & (u + v <= 1 + eps)
                & (t >= -eps)
                & (t <= 1 + eps)
                & (other >= 0).all(axis=1)
                & (other < dims).all(axis=1)
            )
            a, b = points[mask], other[mask]
            blocked[a[:, 2], a[:, 1], a[:, 0]] |= np.uint32(1 << OPPOSITE[q])
            blocked[b[:, 2], b[:, 1], b[:, 0]] |= np.uint32(1 << q)
    return blocked
