import bpy,json
from pathlib import Path
import numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path('.deps/assets/fish.glb').resolve()))
o=bpy.data.objects['Fish']
# Refine the surface before evaluating the armature through the swim cycle.
import bmesh
bm=bmesh.new();bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.join_triangles(bm,faces=list(bm.faces),cmp_materials=True,angle_face_threshold=.60,angle_shape_threshold=1.3)
bm.to_mesh(o.data);bm.free()
mod=o.modifiers.new("Swim silhouette","SUBSURF");mod.levels=1
bpy.context.view_layer.objects.active=o
bpy.ops.object.modifier_move_to_index(modifier=mod.name,index=0)
bpy.ops.object.modifier_apply(modifier=mod.name)
frames=[]
for f in [0,4,8,12,16,20,24,28]:
    bpy.context.scene.frame_set(f)
    obj=o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=obj.to_mesh()
    mesh.calc_loop_triangles()
    if not frames:
        indices=[i for t in mesh.loop_triangles for i in t.vertices]
        colors=[list(mesh.materials[t.material_index].diffuse_color)[:3] for t in mesh.loop_triangles]
    frames.append(np.array([list(obj.matrix_world @ v.co) for v in mesh.vertices]))
    obj.to_mesh_clear()
p=frames[0];print('bounds',p.min(0),p.max(0),'animation delta',np.abs(p-frames[3]).max())
# Orient the longitudinal axis along X. The narrow oscillating end is the tail.
axis=np.argmax(np.ptp(p,axis=0))
delta=np.linalg.norm(frames[3]-p,axis=1)
sign=1 if p[delta.argmax(),axis]<np.mean(p[:,axis]) else -1
z=int(np.argsort(np.ptp(p,axis=0))[1]);y=3-axis-z
center=(p.max(0)+p.min(0))/2
out={'index':indices,'colors':np.round(colors,3).tolist(),'frames':[]}
for frame in frames:
    v=(frame-center)/np.ptp(p,axis=0)[axis]*.48
    out['frames'].append(np.round(np.stack((v[:,axis]*sign,v[:,y],v[:,z]),axis=1),4).flatten().tolist())
Path('viewer/assets/fish.json').write_text(json.dumps(out,separators=(',',':')))
