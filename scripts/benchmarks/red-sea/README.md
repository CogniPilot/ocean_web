# Mobile wreck meshes

The sources are the Eilat Satil and Yatush photogrammetric surveys. Keep the original OBJ, MTL and JPEG files together when extracting the nested archives. Original source, authors and CC BY 4.0 terms are recorded in the [dataset](https://doi.org/10.5281/zenodo.10988972) and the [asset attribution](../../../viewer/assets/red-sea/ATTRIBUTION.md).

From the repository root, use Python with NumPy and SciPy for connected components, then Blender with NumPy and Pillow for reduction and glTF export. Blender 5.1.1 was used. Replace the two input directory paths below with the locations of the extracted surveys.

```sh
tools=scripts/benchmarks/red-sea
satil=/path/to/extracted/Satil
yatush=/path/to/extracted/Yatush

python "$tools/filter-islands.py" "$satil/A.obj" --list "$satil/islands.tsv" \
  --drop "$tools/satil-drop.txt" --output "$satil/clean.obj"
python "$tools/filter-islands.py" "$yatush/model.obj" --list "$yatush/islands.tsv" \
  --drop "$tools/yatush-drop.txt" --output "$yatush/clean.obj"
blender -b -t 4 --python-exit-code 1 --python "$tools/prepare-lod.py" -- \
  "$satil/clean.obj" build/survey-lod/satil --scale 1 --up 0 1 0 --forward 1 0 0 \
  --far-faces 5050 --far-texture 512 --dive-faces 75000 --dive-texture 1024
blender -b -t 4 --python-exit-code 1 --python "$tools/prepare-lod.py" -- \
  "$yatush/clean.obj" build/survey-lod/yatush --scale 1 --up 0 1 0 --forward 1 0 0 \
  --far-faces 3900 --far-texture 512 --dive-faces 145000 --dive-texture 2048
for name in satil yatush; do
  collision_faces=7400
  if [ "$name" = yatush ]; then collision_faces=7300; fi
  python "$tools/hull-lod.py" "build/survey-lod/$name" "$tools/$name-profile.json" "viewer/assets/red-sea/$name" --collision-faces "$collision_faces"
  python "$tools/check-hull.py" "$tools/$name-profile.json" "viewer/assets/red-sea/$name"
done
# Build the pinned MIT-licensed meshoptimizer offline tool for the distant Yatush.
git clone -b v0.25 --depth 1 https://github.com/zeux/meshoptimizer.git build/meshoptimizer
c++ -O2 -shared -fPIC build/meshoptimizer/src/{simplifier,allocator,indexgenerator}.cpp -o build/libmeshoptimizer.so
python "$tools/distant-survey.py" viewer/assets/red-sea/yatush --meshoptimizer-lib build/libmeshoptimizer.so
python "$tools/check-yatush-roof.py" viewer/assets/red-sea/yatush
python "$tools/check-hull.py" "$tools/yatush-profile.json" viewer/assets/red-sea/yatush
python "$tools/check-yatush-passage.py" viewer/assets/red-sea/yatush
```

The component inspection groups coincident positions across texture seams for classification. It reports size, extent and clearance from larger surfaces. The explicit source-specific ID lists preserve larger components such as the seabed, interior structures and separate deck fittings. Keep the listed IDs with the exact published source archive. Only the omitted faces change in the intermediate OBJ.

Satil retains 849 of 1,192 connected components. The excluded 343 compact islands contained 4,701 faces. Their extents reach at most 0.34 m on any axis. Very small, isolated fragments were selected using component size and separation from the larger surfaces. Long, narrow shapes were retained as potential hardware.

Both levels share a transformation derived from the source. The original units are treated as metres. Positive glTF Y points up, positive X toward the bow, with the survey centred horizontally. The lowest reconstructed keel station sets zero height in the final assets. Satil's main hull extends 44.58 m, and the surrounding survey apron increases the scan extent to approximately 50.19 m. The final clip follows the 44.60 m hull profile. The apron is removed. About 0.6 m of bedding brings a flat seabed to the observed lower side contact on Satil.

The dive mesh collapses edges without filling photographed openings, preserving corner texture coordinates. A single embedded JPEG atlas covers its one PBR material. The far mesh uses vertex clustering with photosampled vertex colours in linear light. The photographic surface uses one draw call. The lower hull adds a second draw call and uses its own material. Neither level requires a geometry decoder.

Each `mesh-report.json` includes the local transform, exported extents and triangle count, file size, and two directed surface-distance samples. Each direction draws 30,000 deterministic random points by triangle area and measures their shortest distance to the other surface. The reported maximum is the maximum of those samples. These meshes reproduce only the surfaces observed by the survey. Small openings and railings can be lost at distance.


The final stage requires NumPy and fast-simplification 0.2.0. Each station in the source-specific profile gives longitudinal X, lower cut Y, left/right Z at the cut, keel Y and upper left/right Z. The profile interpolates across the actual trim triangle. New vertices interpolate their original triangle corner attributes, including UVs at seams, and the tool independently checks those UVs against source-triangle barycentric coordinates. It sweeps a separate closed keel between measured cuts. A short inward lip bridges rough scan edges immediately above the cut. The enclosed bottom and its interior floor are inferred geometry. The visible hull, deck, openings and fittings above the cut retain the photographed material.

The collision GLB has the same coordinate system and reconstructed lower hull with a reduced geometry-only survey surface. The verification command additionally requires trimesh, embreex and rtree. It checks two-face edge incidence, orientation, upward and oblique ray coverage, and low horizontal flank rays in every exported level. It also reports remaining boundaries in the photographed sheet, including hatches, scan gaps and texture-split seams after positional welding. The sealed lower hull does not imply a watertight scan above it. The Yatush vehicle-clearance test in `check-yatush-passage.py` independently sweeps the Piccard envelope in both the visible scan and the contact mesh.
