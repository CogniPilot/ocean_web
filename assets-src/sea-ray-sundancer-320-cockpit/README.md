# Sea Ray Sundancer 320 cockpit

The 2025 European sterndrive brochure provides the reference for the twin digital displays, twin throttle levers, dual bucket seats, port companion seat, L-shaped aft lounge and starboard wet bar. The cockpit fits the simulator's 0.54 m sole and existing helm position. A clear center aisle accommodates the simulator's Piccard cradle and hoist. The removable table remains in its documented stowed configuration.

[Sea Ray 2025 Sundancer 320 European brochure, pages 6–8 and 11–12](https://www.searay.com/content/dam/searay/sundancer-series/sundancer-320-eu/2025-sundancer-320-europe-model-brochure.pdf)

Run `./build.sh` with FreeCADCmd and Blender on PATH. The `FREECAD_CMD` and `BLENDER` environment variables accept explicit binary paths. This rebuilds the editable FreeCAD and Blender assemblies and the runtime asset, `viewer/assets/sea-ray-sundancer-320-cockpit.glb`.

`build-cad.py` defines the solids in metres with bow +X, port +Y and up +Z. The FreeCAD file groups the solids by assembly. The Blender file retains the parts and their materials. The glTF batches by finish and preserves the steering wheel pivot and both throttle pivots. The runtime mounts the independent sonar and chart canvases in the two bezels.
