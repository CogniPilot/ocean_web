"""Build a great white on the Quaternius Shark swim rig.
blender -b -P tools/build-shark.py -- rig.glb viewer/assets/shark.glb
"""
import math
import sys
from bisect import bisect_right
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
vertices, faces, colors, weights = [], [], [], []
pi, sin, cos = math.pi, math.sin, math.cos
slate, flank, underside = (.068,.081,.086), (.17,.193,.195), (.84,.85,.80)
spine = [(-1.27,'Tail'),(-.88,'Spine3'),(-.29,'Spine2'),(.75,'Spine1'),(1.06,'Face')]
# Distance forward, half breadth, vertical radius and centre height in metres.
stations = [(-1.24,.029,.064,.004),(-1.10,.089,.062,.01),(-.92,.096,.082,.015),
            (-.70,.11,.133,.022),(-.40,.191,.231,.019),(-.04,.265,.296,.012),
            (.32,.277,.303,0),(.64,.267,.281,-.011),(.89,.276,.248,-.021),
            (1.12,.248,.183,.001),(1.33,.174,.117,.015),(1.46,.093,.068,.026),
            (1.50,.046,.033,.026),(1.512,.005,.008,.027)]


def mix(a,b,t):
    t = min(1,max(0,t))
    return tuple(x+(y-x)*t for x,y in zip(a,b))


def segment(x,table):
    i=max(0,min(len(table)-2,bisect_right([s[0] for s in table],x)-1))
    a,b=table[i:i+2]
    return i,a,b,min(1,max(0,(x-a[0])/(b[0]-a[0])))


def section(x):
    i,a,b,t=segment(x,stations)
    p,q=stations[max(0,i-1)],stations[min(len(stations)-1,i+2)]
    return [(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*(b[k]-p[k])*(b[0]-a[0])/(b[0]-p[0])
            +(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*(q[k]-a[k])*(b[0]-a[0])/(q[0]-a[0]) for k in (1,2,3)]


def skin(x,a,side):
    w,h,z=section(x)
    # The rostrum is broader across the nasal capsules than it is deep.
    # Round its shoulders and flatten its underside as it tapers ahead of the eyes.
    q=min(1,max(0,(x-.62)/.56))
    ca,sa=cos(a),sin(a)
    return (x,side*w*math.copysign(abs(ca)**(1-.18*q),ca),
            z+h*math.copysign(abs(sa)**(1-.12*q),sa))


def vertex(x,y,z,color,fin=None):
    # Rig local axes are lateral, down and aft. One unit spans 100 rig centimetres.
    vertices.append((.048*y,-.048*z,-.048*x))
    _,a,b,t=segment(x,spine)
    bones={a[1]:1-t,b[1]:t}
    if fin:
        name,gain=fin
        bones={key:v*(1-gain) for key,v in bones.items()}
        bones[name]=gain
    weights.append(bones)
    grain=noise.noise(Vector((x*16,y*32,z*23)))
    colors.append((*[max(0,min(1,c*(1+.075*grain))) for c in color],1))
    return len(vertices)-1


def tube(rows):
    for a,b in zip(rows,rows[1:]):
        for i in range(len(a)):
            j=(i+1)%len(a)
            faces.append((a[i],a[j],b[j],b[i]))
    faces.extend([tuple(dict.fromkeys(reversed(rows[0]))),tuple(dict.fromkeys(rows[-1]))])


# The gape is a horseshoe on the underside of the head. Split the skin along
# one transverse ring so the upper lip, chin and recessed palate meet at both corners.
corner_angle=1.34

def mouth_section(a):
    offset=math.atan2(sin(a+pi/2),cos(a+pi/2))
    t=min(1,abs(offset)/corner_angle)
    # Each lip runs forward from the hinge, wrapping under the tip of the snout.
    hinge=1.32-.38*t**2.5
    opening=.050*(1-t**3) if t<1-1e-8 else 0.
    return hinge,opening


def lip_point(a,lower=False):
    hinge,opening=mouth_section(a)
    _,y,z=skin(hinge,a,1)
    return (hinge-1.25*opening if lower else hinge,y,z-opening if lower else z)


uvs={}
shell_segments=set()
def skin_vertex(x,y,z,a):
    v=vertex(x,y,z,(1,1,1))
    uvs[v]=((x+1.24)/2.75,(a/(2*pi))%1)
    return v


def skin_strip(left,right):
    for i in range(len(left)):
        j=(i+1)%len(left)
        shell_segments.add(len(faces))
        faces.append((left[i],left[j],right[j],right[i]))


angles=sorted([2*pi*j/96 for j in range(96)]+[1.5*pi-corner_angle,1.5*pi+corner_angle])
arc_ids=[j for j,a in enumerate(angles) if abs(a-1.5*pi)<=corner_angle+1e-9]
jaw={}
# Rotate the mandible about the posterior commissure. Soft tissue at the
# corners shares the cheek motion, while each crown stays rigid in its gum.
def upper_pose(p):
    x,y,z=p
    # Cranial elevation turns the full rostrum and carries the orbit and nares.
    w=min(1,max(0,(x-.69)/.24))
    theta=.23*w
    dx,dz=x-.79,z+.07
    return (.79+dx*cos(theta)-dz*sin(theta),y,-.07+dx*sin(theta)+dz*cos(theta))

def lip_open(a,lower):
    # A broad parabolic dental arcade meets the cheek at each commissure.
    # The lower symphysis projects forward even at maximum depression.
    offset=math.atan2(sin(a+pi/2),cos(a+pi/2))
    phi=min(1,abs(offset)/corner_angle)*pi/2
    fore=cos(phi)
    hinge,_=mouth_section(-pi/2+corner_angle)
    _,w,h=upper_pose(skin(hinge,-pi/2+corner_angle,1))
    if not lower:
        return upper_pose(lip_point(a))
    return (hinge+.20*fore,
            math.copysign(w*sin(phi)*(1-.08*fore),offset),
            h-.228*fore**.86)

def jaw_pose(p,a,lower):
    # Transport the skin from the rest arcade to its articulated position.
    # The chin and cheek carry the movement smoothly aft of the jaw joint.
    x,y,z=p
    lip=Vector(lip_point(a,lower))
    goal=Vector(lip_open(a,lower))
    base=Vector(upper_pose(p))
    if lower:
        aft=max(0,lip.x-x)
        w=max(0,1-aft/.68)
        w=w*w*(3-2*w)
    else:
        w=max(0,1-abs(x-lip.x)/.17)
    return base+w*(goal-Vector(upper_pose(lip)))

def morph(i,target):
    x,y,z=target
    jaw[i]=(.048*y,-.048*z,-.048*x)

rows=[]
# Carry the chin displacement smoothly back into the throat.
for i in range(83):
    row=[]
    for a in angles:
        hinge,opening=mouth_section(a)
        x=-1.24+(hinge+1.24)*i/82
        _,y,z=skin(x,a,1)
        blend=max(0,1-(hinge-x)/.45)**2
        # A thin lip turns into the dental arcade and blends into the throat.
        behind=hinge-x
        pad=min(1,opening/.021)*max(0,1-behind/.72)*min(1,(max(0,behind)/.055)**.6)
        p=(x-1.25*blend*opening,y*(1+.012*pad),z-blend*opening-.022*pad)
        v=skin_vertex(*p,a)
        row.append(v)
        morph(v,jaw_pose(p,a,True) if opening else upper_pose(p))
    rows.append(row)
for left,right in zip(rows,rows[1:]):skin_strip(left,right)
faces.append(tuple(reversed(rows[0])))
lower=rows[-1]
upper=[]
for j,a in enumerate(angles):
    hinge,opening=mouth_section(a)
    upper.append(skin_vertex(*lip_point(a),a) if opening else lower[j])
# Two recessed dental arches continue into separate vault and floor surfaces.
# Join them deep in the pharynx so both rows are visible in profile at full gape.
gums=set()
def join_rims(rim1,rim2):
    for j,k in zip(range(len(rim1)-1),range(1,len(rim1))):
        corners=tuple(dict.fromkeys((rim1[j],rim1[k],rim2[k],rim2[j])))
        if len(corners)>=3:
            gums.add(len(faces))
            faces.append(corners)

def lining(a,depth,is_lower):
    offset=math.atan2(sin(a+pi/2),cos(a+pi/2))
    phi=offset/corner_angle*pi/2
    c,side=max(0,cos(phi)),sin(phi)
    opening=Vector(lip_open(a,is_lower))
    at_rest=Vector(lip_point(a,is_lower))
    # Cross sections follow the forward arcade into a much narrower pharynx.
    lumen=Vector((.72,.103*side,-.121+(-.084 if is_lower else .100)*c))
    wall=opening.lerp(lumen,depth)
    wall.x+=.034*sin(pi*depth)*c
    wall.y+=.037*side*sin(pi*depth)
    wall.z+=(.017 if is_lower else .050)*c*sin(pi*depth)
    gingiva=math.exp(-((depth-.075)/.048)**2)
    scallop=.5+.5*cos(44*phi)
    sign=1 if is_lower else -1
    # A protracting gum rolls out from under the labial skin during the bite.
    # Keep its tooth sockets on the advancing face of the margin.
    pad=gingiva*(1-math.exp(-depth/.014))
    wall.x+=pad*.042*c
    wall.y+=pad*.013*side*c
    wall.z+=sign*pad*(.022+.007*scallop)*c
    wall.z+=.008*sin(pi*depth)*sin(9*phi+1.1*depth)**2*c
    rest=at_rest.lerp(Vector((.72,.103*side,-.15)),depth)
    rest.z+=sign*.006*pad*c
    tissue=mix((.35,.132,.123),(.055,.016,.024),depth**.8)
    tissue=mix(tissue,(.61,.32,.29),pad*(.64+.24*scallop))
    light=1+.12*noise.noise(Vector((phi*7,depth*22,side*3)))+.07*cos(9*phi+depth)
    return rest,wall,[k*light for k in tissue]

oral_uv={}
deep=[]
for is_lower,rim in ((False,upper),(True,lower)):
    last=[rim[j] for j in arc_ids]
    for j,v in zip(arc_ids,last):oral_uv[v]=((angles[j]-1.5*pi)/corner_angle*.5+.5,0)
    for depth in (.018,.036,.06,.085,.11,.145,.19,.25,.32,.41,.52,.63,.74,.84,.92,1.):
        ring=[]
        for j in arc_ids:
            rest,wall,tissue=lining(angles[j],depth,is_lower)
            v=vertex(*rest,tissue);morph(v,wall)
            oral_uv[v]=((angles[j]-1.5*pi)/corner_angle*.5+.5,depth*.86)
            ring.append(v)
        join_rims(last,ring);last=ring
    deep.append(last)
backs=[]
for ring in deep:
    back=[]
    for v in ring:
        y,down,aft=vertices[v]
        idx=vertex(-aft/.048-.18,y/.048*.65,-down/.048,(.004,.002,.003))
        y,down,aft=jaw[v]
        morph(idx,(-aft/.048-.18,y/.048*.65,-down/.048))
        oral_uv[idx]=(oral_uv[v][0],1)
        back.append(idx)
    join_rims(ring,back);backs.append(back)
join_rims(*backs)
for j,a in enumerate(angles):
    if upper[j]!=lower[j]:morph(upper[j],lip_open(a,False))
rows=[upper]
for i in range(1,24):
    row=[]
    for a in angles:
        hinge,_=mouth_section(a)
        x=hinge+(1.51-hinge)*i/23
        p=skin(x,a,1)
        v=skin_vertex(*p,a)
        morph(v,jaw_pose(p,a,False) if mouth_section(a)[1] else upper_pose(p))
        row.append(v)
    rows.append(row)
for left,right in zip(rows,rows[1:]):skin_strip(left,right)
faces.append(tuple(rows[-1]))

# Space the teeth by distance along the jaws. An equal angular spacing
# bunches narrow needles at the snout and makes the side teeth enormous.
for lower_jaw,count in ((False,20),(True,21)):
    angles_on_arch=np.linspace(-pi/2-.95*corner_angle,-pi/2+.95*corner_angle,401)
    arc=[Vector(lip_point(a,lower_jaw)) for a in angles_on_arch]
    lengths=[0.]
    for a,b in zip(arc,arc[1:]):lengths.append(lengths[-1]+(b-a).length)
    pitch=lengths[-1]/count
    for i in range(count):
        distance=(i+.48+.055*sin(i*4.7))*pitch
        a=float(np.interp(distance,lengths,angles_on_arch))
        root=Vector(lip_point(a,lower_jaw))
        tangent=(Vector(lip_point(a+.006,lower_jaw))-Vector(lip_point(a-.006,lower_jaw))).normalized()
        inward=Vector((-tangent.y,tangent.x,0)).normalized()
        side=abs(2*distance/lengths[-1]-1)
        _,opening=mouth_section(a)
        sign=1 if lower_jaw else -1
        # Crown roots sit inside a U-shaped gum. Sharper lower teeth oppose
        # broad upper blades, with a modest rearward rake toward each corner.
        root+=inward*.031
        root.z-=sign*.014
        width=pitch*(.72 if lower_jaw else .92)*(1+.08*sin(3.9*i))
        height=width*(1.16 if lower_jaw else 1.02)*(1-.32*side)
        rake=tangent*math.copysign(width*.20*side,i+.5-count/2)
        tip=root+rake+inward*(.012 if lower_jaw else .009)+Vector((0,0,sign*height))
        mid=root+inward*.004+Vector((0,0,sign*height*.35))
        points=[root-tangent*width*.50,root+tangent*width*.50,
                mid+tangent*width*.30,tip,mid-tangent*width*.34,
                mid-inward*.0045,mid+inward*.005]
        ids=[]
        for k,pt in enumerate(points):
            color=(.68,.58,.51) if k<2 else (.85,.80,.70)
            idx=vertex(*pt,color);ids.append(idx)
            # Position each crown on its *open* gum pad. Rotating all
            # the lower teeth with the chin makes the front row lie flat.
            _,socket,_=lining(a,.077,lower_jaw)
            spread=Vector(lip_open(a+.004,lower_jaw))-Vector(lip_open(a-.004,lower_jaw))
            spread.normalize()
            delta=pt-root
            grown=socket+spread*delta.dot(tangent)+inward*(.002+delta.dot(inward))
            grown.z+=sign*(-.004+sign*delta.z)
            morph(idx,grown)
        for k in range(5):
            faces.append((ids[k],ids[(k+1)%5],ids[5]))
            faces.append((ids[(k+1)%5],ids[k],ids[6]))


def appendage(rowspec,tint,paired=0,pectoral=False):
    """Elliptical foil sections: forward edge, trailing edge, span and thickness."""
    rows=[]
    for lead,trail,span,level,thickness in rowspec:
        row=[]
        for j in range(16):
            a=2*pi*j/16
            x=trail+(lead-trail)*(.5+.5*cos(a))
            fin=None
            if paired:
                y,z=paired*span,level+thickness*sin(a)
                if pectoral:
                    fin=('Bone' if paired>0 else 'Bone.001',min(1,max(0,(span-.17)/.20)))
                color=mix(underside,tint,.5+1.15*sin(a))
            else:
                y,z=thickness*sin(a),level
                color=tint
            row.append(vertex(x,y,z,color,fin))
        rows.append(row)
    tube(rows)


# Tall triangular first dorsal, compact second dorsal, and the two lunate caudal lobes.
for sections in (
    [(.40,-.26,.238,.068),(.24,-.18,.34,.050),(.15,-.127,.46,.035),(.032,-.112,.602,.021),(-.071,-.105,.659,.005)],
    [(-.69,-.90,.10,.031),(-.77,-.87,.174,.014),(-.84,-.86,.215,.003)],
    [(-1.03,-1.32,.003,.047),(-1.125,-1.37,.135,.049),(-1.27,-1.47,.31,.033),(-1.47,-1.58,.46,.020),(-1.63,-1.65,.525,.003)],
    [(-1.03,-1.32,-.006,.044),(-1.13,-1.36,-.14,.043),(-1.27,-1.46,-.26,.028),(-1.49,-1.54,-.354,.009),(-1.566,-1.579,-.378,.003)],
    [(-.73,-.91,-.08,.022),(-.79,-.89,-.14,.015),(-.88,-.90,-.195,.003)]
):
    appendage([(lead,trail,0,z,r) for lead,trail,z,r in sections],slate)
for side in (-1,1):
    appendage([(.58,.03,.15,-.078,.060),(.51,.005,.25,-.112,.055),(.39,-.06,.40,-.17,.043),
               (.20,-.13,.55,-.236,.031),(-.020,-.21,.69,-.30,.017),(-.224,-.251,.755,-.33,.004)],
              flank,side,True)
    appendage([(-.38,-.61,.09,-.14,.027),(-.46,-.64,.18,-.17,.02),(-.61,-.66,.27,-.22,.003)],flank,side)
    # Shallow crescent mouth, five curved gill openings, and small nostrils.
    def crease(path,width,color):
        left,right=[],[]
        for i,(x,a) in enumerate(path):
            w=[v*(.13+.87*sin(pi*i/(len(path)-1))**.68) for v in width]
            pair=[]
            for dx,da in ((-w[0],-w[1]),(w[0],w[1])):
                xx,y,z=skin(x+dx,a+da,side)
                p=(xx,y*1.008+side*.001,z)
                v=vertex(*p,color)
                morph(v,upper_pose(p))
                pair.append(v)
            left.append(pair[0]);right.append(pair[1])
        for i in range(len(path)-1):
            faces.append((left[i],right[i],right[i+1],left[i+1]))
    for g in range(5):
        path=[]
        for i in range(17):
            t=i/16
            path.append((.42+g*.056-.035*sin(pi*t)+.046*t,.48-.99*t))
        crease([(x+.008,a) for x,a in path],(.006,0),(.145,.164,.167))
        crease(path,(.005,0),(.036,.042,.044))
    crease([(1.29+.055*i/10,-.19-.075*sin(pi*i/10)) for i in range(11)],(0,.045),(.041,.052,.052))
    # Recessed orbital rim and dark glossy-looking eye with a narrow iris.
    rows=[]
    ex=1.13
    for rad,rise,color in ((1.3,0,flank),(1.12,.003,(.12,.123,.119)),(1,.004,(.046,.044,.040)),
            (.85,.005,(.061,.051,.037)),(.66,.008,(.012,.015,.016)),(.30,.011,(.008,.010,.012)),
            (.02,.012,(.009,.012,.014))):
        row=[]
        for k in range(32):
            phi=2*pi*k/32
            xx=ex+.034*rad*cos(phi)
            p=list(skin(xx,.25+.15*rad*sin(phi),side))
            p[1]+=side*(rise+.0012)
            v=vertex(*p,color)
            morph(v,upper_pose(p));row.append(v)
        rows.append(row)
    tube(rows)

mesh=bpy.data.meshes.new('White shark skin')
mesh.from_pydata(vertices,[],faces)
body.data=mesh
body.vertex_groups.clear()
for i,bones in enumerate(weights):
    for name,gain in bones.items():
        if gain>0:
            group=body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
            group.add([i],gain,'REPLACE')
bm=bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(mesh)
bm.free()
for face in mesh.polygons:
    face.use_smooth=True
body.shape_key_add(name='Basis')
opened=body.shape_key_add(name='Feed')
for v,target in jaw.items():
    opened.data[v].co=target
mat=bpy.data.materials.new('White shark')
mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.39
mat.diffuse_color=(1,1,1,1)
mat.use_backface_culling=False
attr=mat.node_tree.nodes.new('ShaderNodeVertexColor')
attr.layer_name='Countershading'
mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color'])
mesh.materials.append(mat)
# A baked cylindrical albedo keeps the broken flank boundary sharp on the
# animated skin. Periodic noise joins the two edges of the UV wrap.
W,H=1024,384
yy,xx=np.mgrid[0:H,0:W]
u=(xx+.5)/W
v=(yy+.5)/H
rng=np.random.default_rng(97151)


def field(nx,ny):
    grid=rng.uniform(-1,1,(ny+1,nx+1))
    grid[-1]=grid[0]
    x=u*nx
    y=v*ny
    ix,iy=x.astype(int),y.astype(int)
    fx,fy=x-ix,y-iy
    fx,fy=fx*fx*(3-2*fx),fy*fy*(3-2*fy)
    return (1-fy)*((1-fx)*grid[iy,ix]+fx*grid[iy,ix+1])+fy*((1-fx)*grid[iy+1,ix]+fx*grid[iy+1,ix+1])


z=np.sin(2*pi*v)
cloud=field(16,5)
fleck=field(150,30)
# The pale flank climbs onto the tail keel and drops around the gill basket.
edge=-.30+.34*np.exp(-((u-.12)/.17)**2)-.11*np.exp(-((u-.64)/.11)**2)
edge+=.16*field(34,8)+.073*field(115,22)+.035*field(320,62)
white=np.clip(.5+36*(edge-z),0,1)
grain=rng.normal(0,1,(H,W))
shine=np.clip(.315+.13*(1-z)+.052*cloud+.021*fleck+.011*grain,0,1)
belly=.88+.023*cloud+.014*fleck+.009*grain
pixels=np.ones((H,W,4),np.float32)
for c,(grey,ivory) in enumerate(zip((.94,.988,1.02),(1.015,1.,.972))):
    pixels[:,:,c]=np.clip((1-white)*grey*shine+white*ivory*belly,0,1)
# Individual pigmentation on the rostrum. Pore clusters follow either
# side of the nasal capsules. Their spacing is specified on the UV surface.
head=np.clip((u-.77)/.20,0,1)
pores=field(850,280)
pore_mask=np.clip((pores-.42)*2.8,0,1)*head*np.clip(1.15-.60*abs(z),0,1)
pixels[:,:,:3]*=(1-.43*pore_mask[:,:,None])
marble=.035*field(32,18)+.013*field(140,81)
pixels[:,:,:3]=np.clip(pixels[:,:,:3]+(head*marble)[:,:,None],0,1)
img=bpy.data.images.new('Great white flank pigmentation',width=W,height=H,alpha=False)
img.pixels.foreach_set(pixels.ravel())
img.pack()
skinmat=bpy.data.materials.new('Slate dorsum and ivory belly')
skinmat.use_nodes=True
bsdf=skinmat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.40
tex=skinmat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=img
skinmat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
mesh.materials.append(skinmat)
uv=mesh.uv_layers.new(name='Pigmentation',do_init=False)
uv.data.foreach_set('uv',np.zeros(len(mesh.loops)*2,np.float32))
for idx in shell_segments:
    face=mesh.polygons[idx]
    face.material_index=1
    latitudes=[uvs[v][1] for v in face.vertices]
    wrap=max(latitudes)-min(latitudes)>.5
    for k in face.loop_indices:
        u,v=uvs[mesh.loops[k].vertex_index]
        uv.data[k].uv=(u,v+1 if wrap and v<.5 else v)
# Gingival ridges and the longitudinal folds on the palate have their own
# coordinates so they stay attached throughout jaw protraction.
W,H=512,256
yy,xx=np.mgrid[0:H,0:W]
u=(xx+.5)/W
v=(yy+.5)/H
large=field(14,8)
fine=field(135,75)
phase=2*pi*(u*18+.21*np.sin(v*11+u*7)+.09*large)
folds=(.5+.5*np.cos(phase))**5
ridge=np.exp(-((v-.068)/.046)**2)
depth=np.clip(v/.94,0,1)
shade=(1-.87*depth**1.7)*(.86+.10*large+.065*fine-.13*folds)
gum=(.58+.18*folds)*ridge
oralpixels=np.ones((H,W,4),np.float32)
for ch,(tissue,gum_color) in enumerate(zip((.59,.355,.35),(.87,.66,.61))):
    oralpixels[:,:,ch]=np.clip(((1-gum)*tissue+gum*gum_color)*shade,0,1)
oralimage=bpy.data.images.new('Palatal folds and gingiva',width=W,height=H,alpha=False)
oralimage.pixels.foreach_set(oralpixels.ravel());oralimage.pack()
oralmat=bpy.data.materials.new('Buccal mucosa')
oralmat.use_nodes=True
lining_shader=oralmat.node_tree.nodes.get('Principled BSDF')
lining_shader.inputs['Roughness'].default_value=.74
lining_shader.inputs['Specular IOR Level'].default_value=.17
lining_tex=oralmat.node_tree.nodes.new('ShaderNodeTexImage')
lining_tex.image=oralimage
oralmat.node_tree.links.new(lining_tex.outputs['Color'],lining_shader.inputs['Base Color'])
mesh.materials.append(oralmat)
for idx in gums:
    poly=mesh.polygons[idx]
    poly.material_index=2
    for k in poly.loop_indices:uv.data[k].uv=oral_uv[mesh.loops[k].vertex_index]
tint=mesh.color_attributes.new(name='Countershading',type='BYTE_COLOR',domain='CORNER')
for face in mesh.polygons:
    for k in face.loop_indices:
        v=mesh.loops[k].vertex_index
        color=colors[v]
        if face.index in gums and v in uvs:color=(.57,.23,.21,1)
        tint.data[k].color=color
bpy.ops.export_scene.gltf(filepath=str(output.resolve()),export_vertex_color='MATERIAL',export_all_vertex_colors=False,
                          export_image_format='JPEG',export_jpeg_quality=92,export_animations=True)
