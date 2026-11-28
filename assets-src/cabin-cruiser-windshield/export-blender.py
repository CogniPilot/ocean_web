"""Create the editable Blender scene and the batched browser glTF from FreeCAD tessellation."""
import json
import math
import os
from pathlib import Path

import bmesh
import bpy

output = Path(os.environ["CRUISER_WINDSHIELD_OUTPUT"])
models = json.loads((output / "windshield-tessellation.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"


def linear(component):
    return component / 12.92 if component < .04045 else ((component + .055) / 1.055) ** 2.4


def material(name, srgb, roughness, metallic=0, alpha=1):
    finish = bpy.data.materials.new(name)
    finish.use_nodes = True
    color = tuple(linear(channel) for channel in srgb)
    shading = finish.node_tree.nodes.get("Principled BSDF")
    shading.inputs["Base Color"].default_value = (*color, 1)
    shading.inputs["Metallic"].default_value = metallic
    shading.inputs["Roughness"].default_value = roughness
    shading.inputs["Alpha"].default_value = alpha
    finish.diffuse_color = (*color, alpha)
    if alpha < 1:
        finish.surface_render_method = "DITHERED"
    return finish


materials = {
    "Frame": material("Satin graphite aluminum", (.19, .25, .27), .35, .32),
    "Gasket": material("EPDM rubber", (.055, .074, .077), .77),
    "Glazing": material("Smoke teal marine glass", (.57, .74, .76), .20, alpha=.28),
    "Stainless": material("Brushed 316 stainless", (.71, .75, .75), .29, .74),
}
buckets = {finish: [] for finish in materials}
for model in models:
    mesh = bpy.data.meshes.new(model["name"])
    mesh.from_pydata(model["positions"], [], model["triangles"])
    mesh.validate()
    topology = bmesh.new()
    topology.from_mesh(mesh)
    topology.normal_update()
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=1e-6)
    bmesh.ops.dissolve_limit(topology, angle_limit=math.radians(1), verts=list(topology.verts), edges=list(topology.edges))
    for face in topology.faces:
        face.smooth = True
    for edge in topology.edges:
        if not edge.is_manifold or edge.calc_face_angle(0) > math.radians(38):
            edge.smooth = False
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()
    part = bpy.data.objects.new(model["name"], mesh)
    bpy.context.collection.objects.link(part)
    part.data.materials.append(materials[model["finish"]])
    buckets[model["finish"]].append(part)

bpy.ops.wm.save_as_mainfile(filepath=str(output / "CabinCruiserWindshield.blend"))
# Join by surface finish to keep the new assembly at four draw calls.
for finish, parts in buckets.items():
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = finish
bpy.ops.export_scene.gltf(
    filepath=str(output / "cabin-cruiser-windshield.glb"),
    export_format="GLB",
    export_yup=True,
    export_texcoords=False,
    export_tangents=False,
    export_animations=False,
)
