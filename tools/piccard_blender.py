"""Build the editable Piccard assembly and export its batched browser asset."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from piccard_design import FINISHES, ROOT, housing_parts, thruster_layout

DEFAULT_GLB = ROOT / "viewer/assets/survey-pressure-housing.glb"


def finish(name, rgb, metal, rough):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    return material


def create_assembly():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    materials = {key: finish(*parameters) for key, parameters in FINISHES.items()}

    def cylinder(name, center, radius, length, material, vertices=48):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length,
                                           location=center, rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = name
        obj.data.materials.append(materials[material])
        for face in obj.data.polygons:
            face.use_smooth = len(face.vertices) == 4

    def box(name, center, dimensions, material, bevel=.0015):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        edges = obj.modifiers.new("Machined edges", "BEVEL")
        edges.width = bevel
        edges.segments = 2
        obj.data.materials.append(materials[material])

    def cable(points, material):
        curve = bpy.data.curves.new("Motor lead", "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 5
        curve.bevel_depth = .003
        curve.bevel_resolution = 2
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, center in zip(spline.bezier_points, points):
            point.co = center
            point.handle_left_type = point.handle_right_type = "AUTO"
        obj = bpy.data.objects.new("Motor lead", curve)
        bpy.context.collection.objects.link(obj)
        curve.materials.append(materials[material])

    layout = thruster_layout()
    housing_parts(layout["mounts"], cylinder, box, cable)
    bpy.context.scene["thrusterLayout"] = json.dumps(layout)


def export_assembly(destination):
    scene = bpy.context.scene
    layout = scene["thrusterLayout"]
    if json.loads(layout) != thruster_layout():
        raise ValueError("The editable assembly's thruster layout differs from Wreck/package.mo")
    del scene["thrusterLayout"]

    # Join one mesh per fixed finish. Keep the independent pickup node and
    # the mount metadata that the viewer uses to attach dynamic thrusters.
    for obj in list(scene.objects):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj.type == "CURVE":
            bpy.ops.object.convert(target="MESH")
        elif obj.type == "MESH":
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)

    for key, (name, *_) in FINISHES.items():
        if key == "pickup":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        parts = [obj for obj in scene.objects if obj.active_material == bpy.data.materials[name]]
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        if key == "frame":
            bpy.context.object.name = "PiccardFrame"
            bpy.context.object["thrusterLayout"] = layout

    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", export_yup=True,
                              export_extras=True)


def build_piccard(destination=DEFAULT_GLB, source=None, editable_output=None):
    if source is not None:
        bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
    else:
        create_assembly()
    if editable_output is not None:
        editable_output = editable_output.resolve()
        editable_output.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(editable_output), compress=True)
    export_assembly(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_GLB)
    parser.add_argument("--source", type=Path, help="Export an existing editable Blender assembly")
    parser.add_argument("--editable-output", type=Path, help="Save separate parts before batching the GLB")
    arguments = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    build_piccard(arguments.output, arguments.source, arguments.editable_output)
