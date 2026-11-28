# Piccard pressure housing

[Piccard.blend](Piccard.blend) contains the editable visual assembly with separate parts, bevel modifiers, and cable curves. [Piccard.FCStd](Piccard.FCStd) contains the same rigid part dimensions as editable FreeCAD boxes and cylinders, along with the cable centerlines. Both use X forward, Y port, and Z up. Blender uses metres and FreeCAD uses millimetres.

Export the runtime GLB from the editable Blender file with Blender 5.1.1.

```sh
blender -b --python-exit-code 1 -P tools/piccard_blender.py -- \
  --source assets-src/piccard/Piccard.blend
```

The exporter batches the fixed geometry by material and stores the six Modelica thruster mounts and axes on `PiccardFrame`. The pickup plate remains a separate mesh with its mating face at Z = 0.150 m. The simulator attaches the thrusters, viewport, and survey lights when it loads the GLB.

To change the dimensions consistently across both source files, edit [piccard_design.py](../../tools/piccard_design.py) and regenerate from the repository root. The build reads thruster positions and directions from [the Modelica plant](../../Wreck/package.mo).

```sh
blender -b --python-exit-code 1 -P tools/piccard_blender.py -- \
  --editable-output assets-src/piccard/Piccard.blend

printf '%s\n' 'import runpy' \
  '_ = runpy.run_path("tools/build-piccard-cad.py", run_name="__main__")' \
  'exit()' | FreeCADCmd -c
```

Verify the exported shell against the released FMU and the assembled vehicle geometry.

```sh
node scripts/check-piccard-mounts.mjs
node scripts/check-sub-collision-view.mjs
```
