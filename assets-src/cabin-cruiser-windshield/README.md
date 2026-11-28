# Cabin cruiser windshield

The editable FreeCAD assembly and Blender scene depict the glazing of the original cabin cruiser in Ocean Web. The front openings use the existing cabin rake, and the side openings follow the Modelica pilothouse. Six panes sit in recessed seals with aluminum frames and stainless fasteners. The wiper mounts, moving blades, hull, and collision proxy are part of the simulator.

| File | Purpose |
| --- | --- |
| `assembly.json` | Frame corners, gasket and flange dimensions, and wiper-mount coordinates in metres |
| `CabinCruiserWindshield.FCStd` | Six CAD subassemblies with solids for the frames, seals, glazing and fasteners |
| `CabinCruiserWindshield.blend` | Editable tessellated parts and their material finishes |
| `viewer/assets/cabin-cruiser-windshield.glb` | Browser asset with four material batches |

The coordinates come from [the original viewer geometry](../../viewer/motorboat.mjs) and [the collision skin](../../viewer/board/Shore.mo). The glass design and hardware are original simulator details. The assembly uses forward +X, port +Y and up +Z. FreeCAD stores millimetres, Blender stores metres, and the existing vehicle-shell loader converts glTF Y-up into the vehicle frame.

Run `./assets-src/cabin-cruiser-windshield/build.sh` from the repository with FreeCADCmd and Blender available. `FREECAD_CMD` and `BLENDER` can name alternate executables. The script rebuilds all three native and browser artifacts from `assembly.json`, using FreeCAD for solid geometry and Blender for triangulation cleanup, materials, and export. It was verified with FreeCAD 1.1.4 and Blender 5.1.1.
