"""Fit generated dorsal and ventral pigment plates to the manta's rest-pose UVs.

Usage: python fit-manta-textures.py pigment.png microheight.png viewer/assets/subsea
Requires Pillow, NumPy and SciPy. The pigment plate has two equal horizontal
panels with magenta backing, with the animal's head upwards in each.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, gaussian_filter, map_coordinates

# Half span, leading-edge X, trailing-edge X (metres). Same physical stations as the skin mesh.
STATIONS = np.array([
    [0, 1.05, -1.12], [.22, 1.035, -.92], [.46, .95, -.74], [.62, .80, -.61],
    [.92, .54, -.48], [1.22, .29, -.43], [1.48, .06, -.44], [1.67, -.14, -.49],
    [1.80, -.34, -.52], [1.85, -.50, -.50],
])


def fit_panel(rgb, width):
    chroma = rgb.astype(np.int16)
    mask = ~((chroma[:, :, 0] > chroma[:, :, 1] + 22) &
             (chroma[:, :, 2] > chroma[:, :, 1] + 22))
    mask = binary_erosion(mask, iterations=4)
    rows, cols = np.nonzero(mask)
    left, right = cols.min(), cols.max()
    _, nearest = distance_transform_edt(~mask, return_indices=True)
    rgb = rgb[nearest[0], nearest[1]]
    ys, xs = np.mgrid[:width // 2, :width]
    u, t = (xs + .5) / width, (ys + .5) / (width // 2)
    y = np.clip((u - .5) * 1.85 / .46, -1.85, 1.85)
    fore = np.interp(np.abs(y), STATIONS[:, 0], STATIONS[:, 1])
    aft = np.interp(np.abs(y), STATIONS[:, 0], STATIONS[:, 2])
    local_x = 1.05 - 2.17 * (t - .10) / .80
    chord = np.clip((fore - local_x) / np.maximum(.012, fore - aft), 0, 1)
    source_x = left + 2 + (y / 3.70 + .5) * (right - left - 4)
    front = np.full(mask.shape[1], np.nan)
    back = front.copy()
    for col in range(left, right + 1):
        valid = rows[cols == col]
        if len(valid):
            # Exclude the detached tips of the cephalic lobes in plan view.
            runs = np.split(valid, np.where(np.diff(valid) > 1)[0] + 1)
            front[col], back[col] = runs[-1][[0, -1]]
    # A lobed head can have two disjoint vertical spans near the mouth.
    # Fit the anterior edge of the continuous disc below the separate horns;
    # otherwise its sudden jump folds the gill markings back across themselves.
    center = (left + right) // 2
    nose = front[center]
    shoulder = round(.15 * (right - left))
    for side in (-1, 1):
        edge = center + side * shoulder
        for step in range(shoulder):
            frac = step / shoulder
            front[center + side * step] = nose + frac**2 * (front[edge] - nose)
    valid = np.flatnonzero(np.isfinite(front))
    edge0 = np.interp(source_x, valid, front[valid])
    edge1 = np.interp(source_x, valid, back[valid])
    source_y = edge0 + chord * (edge1 - edge0)
    return np.stack([map_coordinates(c, [source_y, source_x], order=1)
                     for c in rgb.transpose(2, 0, 1)], axis=-1)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pigment', type=Path)
    p.add_argument('microheight', type=Path)
    p.add_argument('directory', type=Path)
    args = p.parse_args()
    pigment = np.asarray(Image.open(args.pigment).convert('RGB'))
    albedo = np.vstack([fit_panel(panel, 1024) for panel in np.array_split(pigment, 2)])
    albedo[:22, -22:] = 255  # Neutral sample for the separately colored eyes and throat.
    args.directory.mkdir(parents=True, exist_ok=True)
    Image.fromarray(albedo).save(args.directory / 'manta-anatomy-albedo.webp', quality=90, method=6)

    # Pigment spots and shoulder patches are flat. Only dermal microstructure
    # contributes to bump; four reflected copies avoid jumps along tile edges.
    relief = np.asarray(Image.open(args.microheight).convert('L').resize((64, 64), Image.Resampling.LANCZOS),
                        dtype=float)
    relief -= gaussian_filter(relief, 5)
    relief /= max(1., np.percentile(np.abs(relief), 95))
    tile = np.hstack([relief, np.fliplr(relief)])
    relief = np.tile(np.vstack([tile, np.flipud(tile)]), (4, 4))
    height = np.clip(128 + 23 * relief, 65, 193)
    roughness = np.full((512, 512), 161.)
    roughness[256:] = 174.
    roughness -= np.clip(relief, -2, 2) * 8
    packed = np.stack([height, roughness, np.zeros_like(height)], axis=-1).astype(np.uint8)
    packed[:11, -11:] = [128, 128, 0]
    Image.fromarray(packed).save(args.directory / 'manta-anatomy-surface.webp', quality=91, method=6)


if __name__ == '__main__':
    main()
