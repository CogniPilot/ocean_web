"""Run with blender -b -P tools/refine-swimmers.py -- INPUT_DIR OUTPUT_DIR."""
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import noise

source, dest = map(Path, sys.argv[sys.argv.index("--")+1:])
for name in ("whale", "shark"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str((source / (name+".glb")).resolve()))
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        bmesh.ops.join_triangles(bm, faces=list(bm.faces), angle_face_threshold=.60,
                                 angle_shape_threshold=1.3, cmp_materials=True)
        bm.to_mesh(mesh)
        bm.free()
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        sub=obj.modifiers.new("Smooth silhouette","SUBSURF")
        sub.levels=2
        bpy.ops.object.modifier_move_to_index(modifier=sub.name,index=0)
        bpy.ops.object.modifier_apply(modifier=sub.name)
        mesh=obj.data
        if mesh.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        for face in mesh.polygons:
            face.use_smooth=True
        # Bake restrained mottling into vertex colour; retain the pack's belly and eye materials.
        tint=mesh.color_attributes.new(name="Skin",type="BYTE_COLOR",domain="POINT")
        for v in mesh.vertices:
            point=obj.matrix_world @ v.co
            shade=.93+.065*noise.noise(point*4.)
            tint.data[v.index].color=(shade,shade,shade,1)
        for mat in mesh.materials:
            if mat and mat.use_nodes:
                mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.50
    bpy.ops.export_scene.gltf(filepath=str((dest / (name+".glb")).resolve()),export_yup=True,
                              export_vertex_color='ACTIVE',export_animations=True)
