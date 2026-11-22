"""Rebuild the humpback on the Quaternius Whale swim rig. Blender -b -P this_file -- rig.glb whale.glb"""
import math
import numpy as np
import sys
from bisect import bisect_right
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector, noise

source, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
vertices, faces, colors, weights = [], [], [], []
pi, sin, cos = math.pi, math.sin, math.cos
back, belly, ivory = (.044, .059, .063), (.33, .37, .35), (.78, .80, .75)
fluke_uv = {}


def mix(a, b, f):
    f = max(0, min(1, f))
    return tuple(x * (1-f) + y * f for x, y in zip(a, b))


def blend_bones(x, stations):
    i = max(0, min(len(stations)-2, bisect_right([s[0] for s in stations], x)-1))
    (a, bone), (b, other) = stations[i:i+2]
    u = max(0, min(1, (x-a)/(b-a)))
    return {bone: 1-u, other: u}


spine = [(-5.3, 'Tail'), (-3.4, 'Spine4'), (-1.65, 'Spine3'), (0, 'Spine2'), (1.5, 'Spine1'), (2.6, 'Head')]


def vertex(x, y, z, tint, bones=None):
    shade = .91 + .18*noise.noise(Vector((x*2.7, y*4.1, z*4.1)))
    vertices.append((.01*y, -.01*z, -.01*x))
    colors.append((*[min(1, c*shade) for c in tint], 1))
    weights.append(bones or blend_bones(x, spine))
    return len(vertices)-1


def tube(rows):
    for left, right in zip(rows, rows[1:]):
        for i in range(len(left)):
            j = (i+1) % len(left)
            faces.append((left[i], left[j], right[j], right[i]))
    faces.extend([tuple(reversed(rows[0])), tuple(rows[-1])])


# Stations along the keel: half breadth, vertical radius and centre height.
sections = [(-5.75,.045,.065,.06),(-5,.17,.22,.09),(-4,.24,.36,.10),
            (-3,.39,.53,.12),(-2,.63,.78,.16),(-1,.91,1.00,.13),
            (0,1.08,1.12,.07),(1,1.12,1.14,0),(2,1.04,.91,-.025),
            (3,.82,.62,-.07),(3.8,.58,.38,-.09),(4.22,.32,.23,-.08),(4.38,.035,.05,-.07)]


def section(x):
    i = max(0, min(len(sections)-2, bisect_right([s[0] for s in sections],x)-1))
    a,b=sections[i:i+2]
    p,q=sections[max(0,i-1)],sections[min(len(sections)-1,i+2)]
    length=b[0]-a[0]
    t=(x-a[0])/length
    return [(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*length*(b[k]-p[k])/(b[0]-p[0])
            +(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*length*(q[k]-a[k])/(q[0]-a[0]) for k in (1,2,3)]


def surface(x,a):
    w,h,z=section(x)
    pleat=max(0,-sin(a))**.60*max(0,1-((x-1.25)/3.05)**2)
    ridge=1+.029*pleat*cos(32*a+.32*sin(x*1.2))
    return x,w*cos(a)*ridge,z+h*sin(a)*ridge


# Separate upper lip and mandible along the gape. Both carry their own
# interior surface so the open mouth also reads correctly from below.
jaw={}
rows=[]
floor_rows=[]
roof_rows=[]
for i in range(91):
    x=-5.75+10.13*i/90
    row=[]
    for j in range(112):
        a=2*pi*j/112
        lip=-.30+.36*max(0,min(1,(x-1.42)/2.91))**1.7
        a+=lip*cos(a)*max(0,min(1,(x-1)/.42))
        mottle=noise.noise(Vector((x*1.1,cos(a)*4,sin(a)*3)))
        color=mix(back,belly,(-sin(a)-.34+.15*mottle)*2)
        if sin(a)<0:
            groove=.15*max(0,cos(32*a+.32*sin(x*1.2)))**3*max(0,1-((x-1.25)/3.05)**2)
            color=mix(color,back,groove)
        row.append(vertex(*surface(x,a),color))
    if x>=1.3:
        bottom=row[56:]+[row[0]]
        bottom[0]=vertex(*surface(x,pi-lip),back)
        bottom[-1]=vertex(*surface(x,lip),back)
        for j,v in enumerate(bottom):
            jaw[v]=(1,max(0,sin(pi*j/56)))
        roof=[];floor=[]
        for j in range(17):
            u=j/8-1
            _,y,z=surface(x,lip)
            shade=.035+.047*(1-u*u)
            roof.append(vertex(x,u*y,z+.055*(1-u*u),(.08,.065,.073)))
            floor.append(vertex(x,u*y,z-.045*(1-u*u),(shade+.04,shade,shade+.023)))
            jaw[floor[-1]]=(1,.30*(1-u*u))
        # Weld the inside margins to the corresponding skin rings.
        roof[0],roof[-1]=row[56],row[0]
        floor[0],floor[-1]=bottom[0],bottom[-1]
        roof_rows.append(roof);floor_rows.append(floor)
        if rows:
            prev=rows[-1]
            previous_lower=last_bottom if len(floor_rows)>1 else prev[56:]+[prev[0]]
            for j in range(56):
                faces.append((prev[j],prev[j+1],row[j+1],row[j]))
                faces.append((previous_lower[j],previous_lower[j+1],bottom[j+1],bottom[j]))
        last_bottom=bottom
    elif rows:
        prev=rows[-1]
        for j in range(112):
            k=(j+1)%112
            faces.append((prev[j],prev[k],row[k],row[j]))
        for j in range(57):
            jaw[row[(56+j)%112]]=(0,max(0,sin(pi*j/56)))
    rows.append(row)
for surface_rows in (floor_rows,roof_rows):
    for r,n in zip(surface_rows,surface_rows[1:]):
        for j in range(16):faces.append((r[j],r[j+1],n[j+1],n[j]))
faces.extend([tuple(rows[-1][:57]),tuple(last_bottom),tuple(rows[0])])
# Short overlapping baleen plates under each upper lip.
for side in (-1,1):
    for i in range(52):
        x=1.64+.047*i
        _,y,z=surface(x,-.28+.30*((x-1.42)/2.91)**1.7)
        h=.13*sin(pi*(i+1)/54)**.6
        ids=[vertex(x+dx,side*(y*.96-inset),z+dz,(.19,.17,.15)) for dx,inset,dz in
             ((0,0,0),(.045,0,0),(.038,.05,-h),(.012,.042,-.89*h))]
        faces.append(tuple(ids))


def oval(center,radius,color):
    x,y,z=center
    rows=[]
    for j in range(9):
        b=-pi/2+.006+(pi-.012)*j/8
        rows.append([vertex(x+radius[0]*cos(b)*cos(a*pi/8),y+radius[1]*cos(b)*sin(a*pi/8),
                            z+radius[2]*sin(b),color) for a in range(16)])
    tube(rows)


for side in (-1,1):
    # Curved gape follows both sides of the broad rostrum, just below each eye.
    rows=[]
    for i in range(37):
        x=1.42+2.91*i/36
        angle=-.30+.36*(i/36)**1.7
        _,y,z=surface(x,angle)
        rows.append([vertex(x,side*(y+.012+.018*cos(j*pi/4)),z+.024*sin(j*pi/4),(.024,.034,.039)) for j in range(8)])
    tube(rows)
    _,y,z=surface(1.57,.02)
    oval((1.57,side*y,z),(.13,.055,.085),back)
    oval((1.59,side*(y+.042),z),(.069,.03,.050),(.009,.012,.012))
    for i in range(7):
        x=2.12+i*.32
        _,y,z=surface(x,.36+.17*(i%2))
        r=.068+.025*sin(i*2+.3*side)
        oval((x,side*(y-r*.34),z),(r*1.55,r,r*.78),(.064,.077,.078))
    # Long pale flippers, swept aft and down, with a scalloped leading edge.
    suffix='.L' if side==1 else '.R'
    rows=[]
    for i in range(37):
        u=i/36
        chord=(.27+.77*sin(pi*u)**.65)*(1-u**3)+.012
        bones=blend_bones(u,[(0,'Spine1'),(.13,'TopFlipper'+suffix),(.5,'MidFlipper'+suffix),(.85,'BottomFlipper'+suffix)])
        row=[]
        for j in range(24):
            a=2*pi*j/24
            lead=.075*cos(13*pi*u)*sin(pi*u)*max(0,cos(a))**3
            x=1.12-1.30*u-.38*u*u+(.5*chord+lead)*cos(a)
            y=side*(.72+2.68*u-.09*sin(a)*sin(pi*u))
            z=-.35-1.42*u+.19*sin(2*pi*u)+(.012+.13*(1-u))*sin(a)
            fleck=noise.noise(Vector((9*x,8*y,8*z)))
            margin=max(0,(abs(cos(a))-.83)*4.7+.48*fleck)
            shade=.66*max(0,1-3*u)+.26*max(0,sin(a))+.72*margin
            row.append(vertex(x,y,z,mix(ivory,back,shade),bones))
        rows.append(row)
    tube(rows)
    # Broad horizontal flukes sweep back toward each tip and meet at a medial notch.
    rows=[]
    for i in range(65):
        u=i/64
        leading=-4.59-.31*u-1.13*u*u
        trailing=-5.42-.90*u+.29*u*u-.39*sin(pi*u)**.7
        trailing+=.038*sin(pi*u)*cos(31*pi*u+.65*sin(7*pi*u))
        row=[]
        for j in range(24):
            a=2*pi*j/24
            chord=(1-cos(a))*.5
            x=leading+(trailing-leading)*chord
            v=vertex(x,side*(.004+2.13*u),.06+.27*u*u+(.10*(1-u)+.006)*sin(a),
                     back,{'Tail':1})
            fluke_uv[v]=((1+side*u)*.5,chord,j)
            row.append(v)
        rows.append(row)
    tube(rows)
for x in (2.65,3.02,3.37,3.69,3.96,4.16):
    _,y,z=surface(x,pi/2)
    oval((x,y,z-.028),(.12,.080,.067),(.061,.071,.074))
# Blowholes near the crown and a small swept dorsal fin on a broad hump.
for side in (-1,1):
    x,y,z=surface(1.72,pi/2-side*.13)
    oval((x,y,z),(.12,.038,.014),(.02,.028,.03))
rows=[]
for i in range(15):
    u=i/14
    rows.append([vertex(-2.35-.48*u+(.58*(1-u)**1.45+.006)*cos(j*pi/12),
                        (.13*(1-u)+.006)*sin(j*pi/12),.71+.54*u,back) for j in range(24)])
tube(rows)
mesh=bpy.data.meshes.new('Humpback')
mesh.from_pydata(vertices,[],faces)
body.data=mesh
body.vertex_groups.clear()
for i,bones in enumerate(weights):
    for name, weight in bones.items():
        if weight>0:
            group=body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
            group.add([i],weight,'REPLACE')
bm=bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(mesh)
bm.free()
for poly in mesh.polygons:
    poly.use_smooth=True
body.shape_key_add(name='Basis')
opened=body.shape_key_add(name='Feed')
for v,(lower,pleat) in jaw.items():
    y,down,aft=vertices[v]
    x=-aft*100
    lever=max(0,x-1.3)
    bulge=max(0,1-((x-1.55)/2.65)**2)*pleat
    opened.data[v].co=(y*(1+.32*bulge),down+.01*(.72*lower*lever+.72*bulge),aft+.01*.22*lower*lever)
mat=bpy.data.materials.new('Mottled humpback skin')
mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.34
attr=mat.node_tree.nodes.new('ShaderNodeVertexColor')
attr.layer_name='Skin'
mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color'])
mesh.materials.append(mat)
# Bake the individual ventral fluke pattern as colour, so the feathered margins
# and small scars survive a close pass without additional animated vertices.
size=768
yy,xx=np.mgrid[0:size,0:size]
span=2*(xx+.5)/size-1
u=np.abs(span)
chord=(yy+.5)/size
rng=np.random.default_rng(6214)


def pigment_noise(cols,rows):
    lattice=rng.normal(0,1,(rows+1,cols+1))
    x=(xx+.5)*cols/size
    y=(yy+.5)*rows/size
    ix=x.astype(int)
    iy=y.astype(int)
    fx=x-ix
    fy=y-iy
    fx=fx*fx*(3-2*fx)
    fy=fy*fy*(3-2*fy)
    return ((1-fx)*lattice[iy,ix]+fx*lattice[iy,ix+1])*(1-fy)+((1-fx)*lattice[iy+1,ix]+fx*lattice[iy+1,ix+1])*fy


coarse=pigment_noise(13,6)
fine=pigment_noise(115,46)
grain=rng.normal(0,1,(size,size))
# A charcoal saddle follows the peduncle. Each lobe has its own mottled field.
margin=np.minimum.reduce([chord-.045-.10*(1-u)**2,
                         .90-.08*u-chord,
                         (u-.09-.11*(1-chord)**2)*1.8,
                         (1-u)*3.8-.12])
mask=np.clip(.5+14*(margin+.031*coarse+.019*fine+.008*grain),0,1)
for _ in range(24):
    x,y=rng.uniform(-.94,.94),rng.uniform(.12,.88)
    r=rng.uniform(.004,.013)
    radius=np.sqrt(((span-x)/r)**2+((chord-y)/(.9*r))**2)
    mask*=1-.68*np.exp(-((radius-.9)/.35)**2)
pixels=np.ones((size,size,4),np.float32)
for channel,(dark,pale) in enumerate(zip((.10,.12,.13),(.86,.87,.82))):
    pixels[:,:,channel]=np.clip(dark+(pale-dark)*mask+.013*coarse+.012*fine+.013*grain,0,1)
img=bpy.data.images.new('Ventral fluke pigmentation',width=size,height=size,alpha=False)
img.pixels.foreach_set(pixels.ravel())
img.pack()
pattern=bpy.data.materials.new('Ventral flukes')
pattern.use_nodes=True
tex=pattern.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=img
wet=pattern.node_tree.nodes.get('Principled BSDF')
wet.inputs['Roughness'].default_value=.30
pattern.node_tree.links.new(tex.outputs['Color'],wet.inputs['Base Color'])
mesh.materials.append(pattern)
uv=mesh.uv_layers.new(name='Fluke markings',do_init=False)
uv.data.foreach_set('uv',np.zeros(len(mesh.loops)*2,np.float32))
for face in mesh.polygons:
    ids=list(face.vertices)
    if all(v in fluke_uv for v in ids):
        if any(fluke_uv[v][2]>12 for v in ids):
            face.material_index=1
            for loop in face.loop_indices:
                uv.data[loop].uv=fluke_uv[mesh.loops[loop].vertex_index][:2]
# glTF multiplies base colour textures by COLOR_0. Give the textured underside
# a neutral multiplier, including the lip vertices shared with the dark upper skin.
tint=mesh.color_attributes.new(name='Skin',type='BYTE_COLOR',domain='CORNER')
for face in mesh.polygons:
    for loop in face.loop_indices:
        tint.data[loop].color=(1,1,1,1) if face.material_index==1 else colors[mesh.loops[loop].vertex_index]
# An attachment in the animated head bone's rest frame locates both blowholes.
arm=body.find_armature()
socket=bpy.data.objects.new('HumpbackBlowholes',None)
bpy.context.collection.objects.link(socket)
socket.parent=arm
socket.parent_type='BONE'
socket.parent_bone='Head'
bpy.context.view_layer.update()
_,_,z=surface(1.72,pi/2)
from mathutils import Matrix
socket.matrix_world=body.matrix_world @ Matrix.Translation((0,-.01*(z+.03),-.0172))
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_vertex_color='MATERIAL',export_all_vertex_colors=False,export_image_format='JPEG',export_jpeg_quality=91,export_animations=True,export_yup=True)
