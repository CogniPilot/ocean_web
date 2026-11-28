"""Build an editable scene and batch the fixed and moving assemblies for WebGL."""
import collections
import json
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

output = Path(os.environ["SUN_DANCER_COCKPIT_OUTPUT"])
design = json.loads((output / "cockpit-tessellation.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"
root = bpy.context.collection
pivots = {}
for name, position in design["pivots"].items():
    pivot = bpy.data.objects.new(name, None)
    root.objects.link(pivot)
    pivot.location = position
    pivot.empty_display_type = "PLAIN_AXES"
    pivot.empty_display_size = .08
    pivots[name] = pivot


def linear(component):
    return component / 12.92 if component < .04045 else ((component + .055) / 1.055) ** 2.4


roughness = {
    "Gelcoat": .38, "Upholstery": .70, "VinylAccent": .65, "Dash": .53, "Slate": .37,
    "Rubber": .64, "Stainless": .30, "Display": .29, "Carpet": .98,
}
finishes = {}
for name, color in design["finishes"].items():
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    color = (*map(linear, color), 1)
    material.diffuse_color = color
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness[name]
    if name == "Stainless":
        shader.inputs["Metallic"].default_value = .67
    finishes[name] = material

sections = {}
batches = collections.defaultdict(list)
for part in design["parts"]:
    label = part["section"]
    if label not in sections:
        sections[label] = bpy.data.collections.new(label)
        root.children.link(sections[label])
    positions = part["positions"]
    name = part["pivot"]
    if name:
        offset = Vector(design["pivots"][name])
        positions = [Vector(p) - offset for p in positions]
    mesh = bpy.data.meshes.new(part["name"])
    mesh.from_pydata(positions, [], part["triangles"])
    mesh.validate()
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=1e-6)
    bmesh.ops.dissolve_limit(topology, angle_limit=math.radians(.5),
                           verts=list(topology.verts), edges=list(topology.edges))
    topology.normal_update()
    for face in topology.faces:
        face.smooth = True
    for edge in topology.edges:
        if not edge.is_manifold or edge.calc_face_angle(0) > math.radians(56):
            edge.smooth = False
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()
    obj = bpy.data.objects.new(part["name"], mesh)
    sections[label].objects.link(obj)
    if name:
        obj.parent = pivots[name]
    finish = part["finish"]
    mesh.materials.append(finishes[finish])
    batches[name, finish].append(obj)

bpy.ops.wm.save_as_mainfile(filepath=str(output / "SeaRaySundancer320Cockpit.blend"))
for (pivot, material), objects in batches.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = f"{pivot} {material}" if pivot else material

bpy.ops.export_scene.gltf(
    filepath=str(output / "sea-ray-sundancer-320-cockpit.glb"),
    export_format="GLB",
    export_yup=True,
    export_texcoords=False,
    export_tangents=False,
    export_animations=False,
)
