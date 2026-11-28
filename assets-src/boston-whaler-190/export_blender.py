"""Refresh the CAD geometry in the Blender assembly and export its runtime GLB."""

import json
import math
import os
from pathlib import Path

import bpy


FOLDER = Path(__file__).resolve().parent
CAD_COLLECTION = "FreeCAD hull and rails"


def rebuild_cad_meshes(hull):
    materials = {name: bpy.data.materials[name] for name in ("Gelcoat", "Hull trim", "Stainless steel")}
    collection = bpy.data.collections[CAD_COLLECTION]
    for obj in list(collection.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    meshes = json.loads(Path(os.environ["WHALER_CAD_MESH"]).read_text())
    for part in meshes:
        mesh = bpy.data.meshes.new(part["name"])
        mesh.from_pydata(part["vertices"], [], part["faces"])
        mesh.update()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.materials.append(materials[part["material"]])
        obj = bpy.data.objects.new(part["name"], mesh)
        collection.objects.link(obj)
        obj.parent = hull


def batch_meshes(parent):
    """Join static meshes by material under a single rigid pivot."""
    groups = {}
    for obj in list(parent.children):
        if obj.type == "MESH" and len(obj.data.materials) == 1:
            groups.setdefault(obj.data.materials[0], []).append(obj)
        elif obj.type == "EMPTY":
            batch_meshes(obj)
    for material, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = material.name + " surfaces"


def main():
    scene = bpy.context.scene
    boat = bpy.data.objects["Boat"]
    hull = bpy.data.objects["Hull and fittings"]
    outboard = bpy.data.objects["Outboard"]
    propeller = bpy.data.objects["Propeller"]
    if outboard.parent != boat or propeller.parent != outboard:
        raise ValueError("The steering and propeller pivots must remain nested under the boat")
    for name in ("SteeringWheel", "ThrottleLever", "AnchorSwitch", "BilgeSwitch"):
        pivot = bpy.data.objects[name]
        if pivot.parent != boat or pivot.type != "EMPTY" or not pivot.children:
            raise ValueError(f"{name} must be a pivot with moving parts under the boat")
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1:
        raise ValueError("The Blender model must use metres")
    rebuild_cad_meshes(hull)
    if os.environ.get("WHALER_UPDATE_BLEND") == "1":
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(FOLDER / "BostonWhaler190.blend"), compress=True)
    bpy.context.view_layer.update()
    for blade_pivot in list(propeller.children):
        if blade_pivot.type == "EMPTY":
            for blade in list(blade_pivot.children):
                pose = blade.matrix_world.copy()
                blade.parent = propeller
                blade.matrix_world = pose
            bpy.data.objects.remove(blade_pivot, do_unlink=True)
    batch_meshes(boat)

    # Put one basis transform on the asset root so the steering and propeller
    # pivots retain their original local axes after the simulator loads the GLB.
    boat.rotation_euler.x = -math.pi / 2
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=str(FOLDER.parent.parent / "viewer" / "assets" / "boston-whaler-190.glb"),
        export_format="GLB", export_yup=False, export_cameras=False, export_lights=False,
        export_animations=False, export_apply=True, export_texcoords=False,
    )


if __name__ == "__main__":
    main()
