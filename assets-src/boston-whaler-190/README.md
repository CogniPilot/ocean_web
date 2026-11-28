# Boston Whaler 190 artwork

`BostonWhaler190.FCStd` contains the hull’s sheer, chine and strake curves, the ruled panels that connect them, the transom and stem, and the swept stainless rails with their mounts. The hull stations use the 2027 190 Montauk specification’s 5.89 m length, 2.43 m beam and 16° deadrise at the transom. The broadside photo, scaled to that length and registered to the rub rail, sets the aft running keel, raked transom and upward sweep of both chine lines. Cross sections, rail dimensions and fittings use photo estimates. FreeCAD uses millimetres.

`BostonWhaler190.blend` contains the cockpit, seats, acrylic windshield and base mounts, T-top, outboard, and materials. It uses metres with the bow along +X, port along +Y and up along +Z. The transom bracket is fixed to the hull. The named `Outboard` and `Propeller` origins control the steering and shaft rotations in Ocean Web. The app attaches the committee flag, roof helipad and anchor to the boat.

The cockpit pivots use the same local axes. `SteeringWheel` rotates about X at the steering hub, with positive rotation clockwise as seen by the driver. `ThrottleLever` rotates about Y at the throttle spindle, with positive rotation toward the bow. `AnchorSwitch` and `BilgeSwitch` rotate about Y at their respective rockers, with positive rotation bringing the lower end toward the driver. The center of travel is zero for all four pivots.

Install FreeCAD and Blender, then run `./export.sh` from this directory. Set `FREECAD_CMD` or `BLENDER` if your installation uses different executable names. The export pulls the latest hull and rail geometry from the FreeCAD document and writes `viewer/assets/boston-whaler-190.glb`. Set `WHALER_UPDATE_BLEND=1` to save the refreshed CAD meshes back into the Blender source before exporting.

`build_freecad.py` defines the original station geometry. From the FreeCAD Python console, use `runpy.run_path` with the script path and `run_name="__main__"` to regenerate the native document from those dimensions. This replaces the existing FreeCAD document on disk.
