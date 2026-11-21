"""Build the marine vehicle shells with Blender. Coordinates are metres (X forward, Z up)."""
import json
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


def fair_pontoon(stations):
    """Interpolate the measured stations with monotone tangents for a smooth silhouette."""
    points = np.asarray(stations)
    x, values = points[:, 0], points[:, 1:]
    spacing = np.diff(x)
    secants = np.diff(values, axis=0) / spacing[:, None]
    tangent = np.zeros_like(values)
    tangent[0], tangent[-1] = secants[0], secants[-1]
    for i in range(1, len(x)-1):
        a, b = secants[i-1], secants[i]
        keep = a*b > 0
        tangent[i, keep] = 2*a[keep]*b[keep]/(a[keep]+b[keep])
    rings = []
    for i, length in enumerate(spacing):
        count = max(3, math.ceil(length/.12))
        for j in range(count):
            t = j/count
            shape = ((1+2*t)*(1-t)**2*values[i] + t*t*(3-2*t)*values[i+1]
                     + length*t*(1-t)*((1-t)*tangent[i]-t*tangent[i+1]))
            rings.append((x[i]+length*t, *shape))
    return rings + [stations[-1]]


def hobie_deck_joint(contour, width, depth):
    """Roll the glass deck edge over the hull flange inside the measured beam."""
    # Photo estimates. Blend out at the narrow stem, keeping the overall beam
    # and the crown height. The third coordinate follows the original paint UV.
    overhang = min(.015, .18*width)
    height = min(.017, .09*depth, .28*width)
    def edge(sign):
        return [(sign*(width-inset*overhang), -drop*height,
                 (u if sign<0 else 10-u)/14)
                for inset,drop,u in ((.25,0,0), (.04,.10,.03), (0,.36,.07),
                                     (.13,.71,.12), (1,.86,.17), (1.02,1,.21))]
    belly = [(y*width,z*depth,u) for y,z,u in contour[1:10]]
    for i in (0,-1):
        y,z,u = belly[i]
        belly[i] = (math.copysign(min(abs(y),width-overhang),y),z,u)
    return edge(-1) + belly + edge(1)[::-1] + [
        (y*width,z*depth,u) for y,z,u in contour[11:]]


def hull(name, stations, section, material, side=1, center=0, deck_joint=False):
    verts, faces = [], []
    contour = [(y,z,i/len(section)) for i,(y,z) in enumerate(section)]
    for x, width, draft, sheer in stations:
        ring = (hobie_deck_joint(contour,width,draft) if deck_joint else
                [(width*y,draft*z,u) for y,z,u in contour])
        verts.extend((x, center+side*y, sheer+z) for y,z,u in ring)
    n = len(ring)
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
            along = (verts[v][0]-stations[0][0])/(stations[-1][0]-stations[0][0]) if deck_joint else v//n/(len(stations)-1)
            uv.data[loop].uv=(along, 1 if j==n-1 and v%n==0 else ring[v%n][2])
    # Section traces port-deck edge through the keel and around the deck crown.
    import bmesh
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()


def hobie_frame(stations):
    """Four deck pylons and the raised perimeter frame, baked as one opaque mesh."""
    vertices, faces, colors, smooth = [], [], [], []
    alloy, casting, socket, steel = (.22,.24,.25), (.13,.14,.15), (.89,.91,.88), (.68,.71,.72)

    def loft(rings, u, v, tint, count=12):
        start = len(vertices)
        for x,y,z,ru,rv in rings:
            for j in range(count):
                a = j*math.tau/count
                du,dv = ru*math.cos(a),rv*math.sin(a)
                vertices.append(tuple(c+du*ui+dv*vi for c,ui,vi in zip((x,y,z),u,v)))
                colors.append(tint)
        for k in range(len(rings)-1):
            for j in range(count):
                a,b = start+k*count+j,start+k*count+(j+1)%count
                faces.append((a,b,b+count,a+count))
                smooth.append(True)
        end = start+(len(rings)-1)*count
        faces.extend((tuple(reversed(range(start,start+count))),tuple(range(end,end+count))))
        smooth.extend((False,False))

    # X forward, Y port. Sidebars overlap each cloth edge and enter both corner castings.
    for side in (-1,1):
        loft([(x,side*.938,.413,.042,.034) for x in (-1.40,.405)],
             (0,1,0),(0,0,1),alloy)
    for beam_x in (-1.40,.405):
        if beam_x > 0:
            # Slight crown and sweep. Ease both ends into the corner castings.
            rings = []
            for y in np.linspace(-1.075,1.075,25):
                crown = max(0, 1-(y/1.02)**2)
                tip = max(0, (abs(y)-1.02)/.055)
                rings.append((beam_x+.035*crown,y,.41+.033*crown,
                              .057*(1-.25*tip),.050*(1-.25*tip)))
        else:
            rings = [(beam_x,y,.41,.056,.05) for y in (-1.075,1.075)]
        loft(rings,(1,0,0),(0,0,1),alloy)
        # Integral traveler tracks follow the extrusion and share its draw call.
        if beam_x > 0:
            for side in (-1,1):
                track = []
                for y in np.linspace(.16,.90,9):
                    crown = 1-(y/1.02)**2
                    track.append((beam_x+.035*crown,side*y,.460+.033*crown,.014,.007))
                loft(track,(1,0,0),(0,0,1),steel,8)
        else:
            loft([(beam_x,y,.460,.015,.008) for y in (-.94,.94)],
                 (1,0,0),(0,0,1),steel,8)
        for side in (-1,1):
            # Pylons are vertical in hull coordinates. The beam overhangs the casting.
            crown = float(np.interp(beam_x,[s[0] for s in stations],
                                    [sheer+.036*depth for _,_,depth,sheer in stations]))
            pylon_y = side*1.02
            loft([(beam_x,pylon_y,crown-.017,.094,.063),
                  (beam_x,pylon_y,crown+.005,.080,.054),
                  (beam_x,pylon_y,crown+.024,.055,.040)],(1,0,0),(0,1,0),socket)
            loft([(beam_x,pylon_y,crown+.010,.053,.039),
                  (beam_x,pylon_y,.387,.054,.040)],(1,0,0),(0,1,0),alloy)
            loft([(beam_x,pylon_y,.348,.058,.048),(beam_x,pylon_y,.376,.070,.062),
                  (beam_x,pylon_y,.423,.076,.068),(beam_x,pylon_y,.446,.062,.060)],
                 (1,0,0),(0,1,0),casting)
            loft([(beam_x,pylon_y+side*d,.372,.010,.010) for d in (.056,.067)],
                 (1,0,0),(0,0,1),steel,8)
    # Dolphin striker on the underside of the forward beam, on the mast axis.
    # The post bottoms in a saddle that carries the bent transverse tension rod.
    mast_x = .44
    loft([(mast_x,0,z,r,r) for z,r in ((.475,.051),(.493,.056),(.506,.047))],
         (1,0,0),(0,1,0),casting)
    loft([(mast_x,0,z,r,r) for z,r in ((.112,.014),(.129,.014),(.134,.0095),
                                         (.385,.0095),(.391,.020),(.400,.020))],
         (1,0,0),(0,1,0),steel)
    loft([(mast_x-.035*abs(y)/1.02,y,z,.0055,.0055) for y,z in ((-.995,.363),(-.94,.333),
          (-.035,.122),(0,.118),(.035,.122),(.94,.333),(.995,.363))],
         (1,0,0),(0,0,1),steel)
    mesh=bpy.data.meshes.new('Hobie trampoline frame')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    for poly,shade in zip(mesh.polygons,smooth):
        poly.use_smooth=shade
    import bmesh
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    color=mesh.color_attributes.new(name='Finish',type='BYTE_COLOR',domain='POINT')
    for vertex,tint in zip(color.data,colors):
        vertex.color_srgb=(*tint,1)
    material=bpy.data.materials.new('Frame finishes')
    material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    attr=material.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name=color.name
    material.node_tree.links.new(attr.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Metallic'].default_value=.26
    shader.inputs['Roughness'].default_value=.48
    mesh.materials.append(material)
    bpy.context.collection.objects.link(bpy.data.objects.new(mesh.name,mesh))


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(DEST/(name+'.glb')),export_format='GLB',export_yup=True,
                               export_extras=(name=="survey-pressure-housing"))
    bpy.ops.wm.read_factory_settings(use_empty=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
section=[(-1,0),(-.99,-.16),(-.90,-.47),(-.69,-.77),(-.37,-.94),(0,-1),
         (.37,-.94),(.69,-.77),(.9,-.47),(.99,-.16),(1,0),(.82,.018),(0,.036),(-.82,.018)]
white=coating('Ivory gelcoat',(.89,.91,.88),stripes=True)
# Loft the visual hull from the same offsets used for shore contact.
shore = (DEST.parents[1]/'viewer/board/Shore.mo').read_text()
table = re.search(r'constant Real pontoon\[12,4\]=\[(.*?)\];', shore, re.S)[1]
offsets = [list(map(float,row.split(','))) for row in table.split(';')]
stations = [(x,w,sheer-keel,sheer) for x,w,sheer,keel in fair_pontoon(offsets)]
for side in (-1,1):
    hull('Port hull' if side==1 else 'Starboard hull',stations,section,white,side,side*1.02,deck_joint=True)
hobie_frame(stations)
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

def finish(name, rgb, metal=0, rough=.5):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    return material


def block(name, pos, dimensions, material, bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    edges = obj.modifiers.new("Machined edges", "BEVEL")
    edges.width = bevel
    edges.segments = 2
    bpy.ops.object.modifier_apply(modifier=edges.name)
    obj.data.materials.append(material)


def cable(points, material):
    curve = bpy.data.curves.new("Motor lead", "CURVE")
    curve.dimensions = '3D'
    curve.resolution_u = 5
    curve.bevel_depth = .006
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new("Motor lead", curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')


tube = finish('Graphite pressure vessel', (.063,.066,.069), .22, .56)
frame = finish('Black frame and clamps', (.027,.030,.034), .18, .41)
rubber = finish('Motor guards and cables', (.016,.020,.024), .08, .34)
alloy = finish('Machined hardware', (.48,.53,.56), .68, .29)
pack = finish('Yellow equipment pack', (.78,.46,.033), .07, .47)
cylinder('Pressure housing', 0, .17, 1.05, tube)
for x in (-.30,.26):
    cylinder('Saddle clamp', x, .183, .067, frame, 20)
    block('Clamp foot', (x,0,.087), (.078,.458,.036), frame)
    for y in (-.201,.201):
        block('Clamp nut', (x,y,.112), (.023,.023,.015), alloy)
for x in (-.53,.53):
    cylinder('Viewport flange', x,.18,.024,frame)
    for i in range(12):
        a = 2*math.pi*i/12
        cylinder('Flange fastener', x+math.copysign(.016,x), .009,.01,alloy,6)
        bpy.context.object.location.y = .166*math.cos(a)
        bpy.context.object.location.z += .166*math.sin(a)

# Keep mounts in the physical body frame even when Blender batches the shell.
plant = (DEST.parents[1]/"Wreck/package.mo").read_text()
def motor_table(name):
    rows = re.search(r"parameter Real " + name + r"\[7,3\]=\[([^\]]+)\]", plant)[1]
    return [list(map(float,row.split(","))) for row in rows.split(";")]

mounts = motor_table("propMount")
axes = motor_table("propAxis")
for side in (-1,1):
    y = side*.218
    # Open central ports give the transverse thruster a clear discharge path.
    for x in (-.356,.356):
        block('Longitudinal side plate', (x,y,.015), (.49,.015,.191), frame)
    block('Upper plate bridge',(0,y,.091),(.23,.015,.039),frame)
    block('Equipment tray rail',(0,y,-.143),(1.205,.019,.03),frame)
    block('Lower pack',(-.04,side*.092,-.125),(.73,.16,.084),pack,.011)
    drive_x = mounts[0][0]
    cable([(drive_x,side*.32,.015),(drive_x+.05,side*.34,-.08),(.23,side*.285,-.14),
           (.02,side*.24,-.154),(-.12,side*.20,-.12)], rubber)
    for x, motor_y, z in mounts:
        if side*motor_y > 0:
            block('Thruster mounting lug',(x,side*.244,z-.053),(.055,.07,.026),frame)
for x in (-.53,-.20,.43):
    block('Lower tray crossmember',(x,0,-.177),(.032,.445,.019),alloy)
block('Equipment tray',(-.02,0,-.169),(.99,.40,.013),frame)

# Combine opaque fixed geometry by finish for local and multiplayer vehicles.
for material in (tube,frame,rubber,alloy,pack):
    bpy.ops.object.select_all(action='DESELECT')
    parts = [o for o in bpy.context.scene.objects if o.active_material == material]
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    if material == frame:
        bpy.context.object.name = 'PiccardFrame'
        bpy.context.object['thrusterLayout'] = json.dumps(dict(mounts=mounts,axes=axes))
export('survey-pressure-housing')
