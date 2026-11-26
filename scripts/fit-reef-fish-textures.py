"""Fit two right-facing, magenta-keyed flank paintings to the reef wildlife atlases."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

PHOTO_SIZE = (1024, 650)
EYE_ISLAND = (56, 42)
EYE_RADIUS = 27


def fit(source, eye, output):
    rgb = np.array(Image.open(source).convert("RGB").resize(PHOTO_SIZE, Image.Resampling.LANCZOS))
    red, green, blue = rgb.astype(float).transpose(2, 0, 1)
    foreground = ndimage.binary_erosion((np.minimum(red, blue) - green) < 42, iterations=2)
    distance, nearest = ndimage.distance_transform_edt(~foreground, return_indices=True)
    # Extend border colors before downsampling, including around narrow fin rays.
    rgb = rgb[tuple(nearest)]
    rgb[distance > 18] = (60, 63, 59)
    y, x = np.indices(green.shape)
    ex, ey, rx, ry = eye
    eye_image = Image.fromarray(rgb).crop((ex-rx, ey-ry, ex+rx, ey+ry))
    # The modeled eye protrudes from the skull. Give its underlying skin a
    # continuous cheek color, also covering the small asymmetry of the rig.
    depth = np.hypot((x-ex)/rx, (y-ey)/ry)
    w = np.clip((1.12-depth)*5, 0, 1)[..., None]
    cheek = rgb[np.minimum(y + ry, 649), np.maximum(x - rx, 0)]
    rgb = np.uint8(rgb*(1-w) + cheek*w)
    atlas = Image.fromarray(rgb)
    cx, cy = EYE_ISLAND
    # Surround the geometric UV island with 3px of its real photograph.
    atlas.paste(eye_image.resize((60,60), Image.Resampling.LANCZOS), (cx-30,cy-30))
    pixels = np.asarray(atlas).astype(float) / 255
    luma = pixels @ [.2126,.7152,.0722]
    relief = luma - ndimage.gaussian_filter(luma, 2.2)
    height = np.clip(.5 + 1.25*relief, .22, .78)
    roughness = np.clip(.59 - .45*relief, .46, .70)
    eye_uv = np.hypot(x-cx, y-cy) < EYE_RADIUS+2
    height[eye_uv] = .5
    roughness[eye_uv] = .23
    surface = Image.fromarray(np.uint8(np.stack([height, roughness, np.ones_like(height)], axis=-1)*255))
    atlas.resize((1024,512), Image.Resampling.LANCZOS).save(output.with_name(output.name+'-albedo.webp'), quality=89, method=6)
    surface.resize((512,256), Image.Resampling.LANCZOS).save(output.with_name(output.name+'-surface.webp'), quality=87, method=6)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("blue_flank", type=Path)
    cli.add_argument("orange_flank", type=Path)
    cli.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1]/"viewer/assets/subsea")
    args = cli.parse_args()
    fit(args.blue_flank, (881,206,27,26), args.output/"reef-fish-1")
    fit(args.orange_flank, (857,253,27,27), args.output/"reef-fish-2")
