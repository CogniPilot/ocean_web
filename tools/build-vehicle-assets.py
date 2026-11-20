"""Build the marine vehicle shells with Blender. Coordinates are metres (X forward, Z up)."""
import math
import re
from pathlib import Path
import bpy
import numpy as np

DEST = Path(__file__).resolve().parents[1] / "viewer/assets"


def coating(name, rgb, metal=0, rough=.38, stripes=False):
    """Embed original UV paint and roughness maps. Shared small textures suit mobile GPUs."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = metal
    y, x = np.mgrid[:128, :512]
    rng = np.random.default_rng(320)
    grain = rng.normal(0, .008, x.shape)
    scuff = ((x + 4*y) % 197 < 2) * ((y % 37) < 6)
    for channel in ("Base Color", "Roughness"):
        image = bpy.data.images.new(name + " " + channel, 512, 128)
        data = np.ones((128, 512, 4), dtype=np.float32)
        if channel == "Base Color":
            data[:, :, :3] = np.asarray(rgb) * (1 + grain[:, :, None]) + .05*scuff[:, :, None]
            if stripes:
                # Unlettered graphite stern flash with three silver leading stripes.
                flank = ((y > 8) & (y < 27)) | ((y > 65) & (y < 85))
                stripe = x + .35*(y % 57)
                for lo,hi,color in [(12,70,(.16,.17,.18)),(74,88,(.35,.36,.37)),(92,105,(.47,.48,.49)),(109,122,(.60,.61,.62))]:
                    data[flank & (stripe>lo) & (stripe<hi), :3] = color
        else:
            image.colorspace_settings.name = 'Non-Color'
            data[:, :, :3] = (rough + 2*grain + .15*scuff)[:, :, None]
        image.pixels.foreach_set(np.clip(data, 0, 1).ravel())
        image.pack()
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], shader.inputs[channel])
    return mat


def hull(name, stations, section, material, side=1, center=0):
    verts, faces = [], []
    for x, width, draft, sheer in stations:
        verts.extend((x, center + side*width*y, sheer+draft*z) for y,z in section)
    n = len(section)
    for i in range(len(stations)-1):
        for j in range(n):
            k=(j+1)%n
            faces.append((i*n+j,i*n+k,(i+1)*n+k,(i+1)*n+j))
    faces.extend((tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        poly.use_smooth=len(poly.vertices)==4
        j=poly.index % n
        for loop in poly.loop_indices:
            v=mesh.loops[loop].vertex_index
            uv.data[loop].uv=(v//n/(len(stations)-1), (n if j==n-1 and v%n==0 else v%n)/n)
    # Section traces port-deck edge through the keel and around the deck crown.
    import bmesh
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(DEST/(name+'.glb')),export_format='GLB',export_yup=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
section=[(-1,0),(-.99,-.16),(-.90,-.47),(-.69,-.77),(-.37,-.94),(0,-1),
         (.37,-.94),(.69,-.77),(.9,-.47),(.99,-.16),(1,0),(.82,.018),(0,.036),(-.82,.018)]
white=coating('Ivory gelcoat',(.89,.91,.88),stripes=True)
# Read the physical pontoon offsets directly so the visual loft, beach contact
# and displacement use the same upswept stem and rocker.
shore = (DEST.parents[1]/'viewer/board/Shore.mo').read_text()
table = re.search(r'constant Real pontoon\[12,4\]=\[(.*?)\];', shore, re.S)[1]
offsets = [list(map(float,row.split(','))) for row in table.split(';')]
stations = [(x,w,sheer-keel,sheer) for x,w,sheer,keel in offsets]
for side in (-1,1):
    hull('Port hull' if side==1 else 'Starboard hull',stations,section,white,side,side*1.02)
export('hobie-hulls')
red=coating('Vermilion gelcoat',(.80,.105,.08))
stations=[(x,w,(.077+.19*(.48+1.55*w)),.077) for x,w in
          [(-1.1,.22),(-.82,.29),(-.3,.335),(.18,.32),(.63,.235),(.98,.12),(1.22,.01)]]
hull('Sloop hull',stations,section,red)
deck=coating('Ivory deck',(.88,.90,.87),rough=.48)
mesh=bpy.data.meshes['Sloop hull']
mesh.materials.append(deck)
for face in mesh.polygons:
    if face.normal.z>.8:
        face.material_index=1
export('sloop-hull')

def cylinder(name,x,r,length,material,vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=length,
        location=(x,0,.1),rotation=(0,math.pi/2,0))
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth=len(p.vertices)==4

alloy=coating('Brushed pressure tube',(.46,.50,.51),.8,.32)
seal=coating('Elastomer seal',(.10,.12,.125),0,.68)
cylinder('Pressure housing',0,.17,1.05,alloy)
for x in (-.51,-.26,.22,.50):
    cylinder('Retaining collar',x,.178,.029,seal)
for x in (-.535,.53):
    cylinder('Machined flange',x,.18,.019,alloy)
    for i in range(10):
        a=2*math.pi*i/10
        cylinder('Hex flange fastener',x+math.copysign(.013,x),.009,.012,alloy,6)
        obj=bpy.context.object
        obj.location.y=.157*math.cos(a)
        obj.location.z+=.157*math.sin(a)
# Join fixed parts by finish to keep draw calls independent of fastener count.
for m in (alloy,seal):
    bpy.ops.object.select_all(action='DESELECT')
    objs=[o for o in bpy.context.scene.objects if o.active_material==m]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join()
export('survey-pressure-housing')
