"""Blender --background --disable-autoexec --python scripts/bake-reef-wildlife.py -- /path/to/Blends."""
import json
import math
import sys
from pathlib import Path

import bpy

def flank_anchor(rest, indices, x, z, side):
    """Intersect the cheek at this profile position and track that triangle through the swim."""
    hits = []
    for a, b, c in zip(*[iter(indices)] * 3):
        ax, ay, az = rest[a]
        bx, by, bz = rest[b]
        cx, cy, cz = rest[c]
        det = (bx-ax)*(cz-az) - (bz-az)*(cx-ax)
        if abs(det) < 1e-12:
            continue
        u = ((x-ax)*(cz-az) - (z-az)*(cx-ax))/det
        v = ((bx-ax)*(z-az) - (bz-az)*(x-ax))/det
        weights = (1-u-v, u, v)
        if min(weights) >= -1e-8:
            y = weights[0]*ay + u*by + v*cy
            hits.append((side*y, list(zip((a,b,c), weights))))
    return max(hits, key=lambda hit: hit[0])[1]


def add_eyes(frames, indices, colors, uv, location, radii, project_flanks):
    """Attach both irises to pose-matched skin vertices without another draw."""
    rest = list(zip(*[iter(frames[0])]*3))
    body_indices = indices.copy()
    rings, sectors = 6, 10
    for side in (-1, 1):
        target = (location[0], side*location[1], location[2])
        if project_flanks:
            anchor = flank_anchor(rest, body_indices, target[0], target[2], side)
        else:
            anchor = [(min(range(len(rest)), key=lambda i: math.dist(rest[i], target)), 1)]
        start = len(frames[0])//3
        directions = []
        for ring in range(rings+1):
            angle = math.pi*ring/rings
            for sector in range(sectors):
                turn = 2*math.pi*sector/sectors
                directions.append((math.sin(angle)*math.cos(turn), math.cos(angle), math.sin(angle)*math.sin(turn)))
        for frame in frames:
            centre = [sum(frame[3*i+k]*weight for i,weight in anchor) for k in range(3)]
            for unit in directions:
                frame.extend(round(centre[k]+unit[k]*radii[k],5) for k in range(3))
        for unit in directions:
            uv.extend([unit[0]*.04, unit[2]*.04])
        for r in range(rings):
            for j in range(sectors):
                a=r*sectors+j; b=r*sectors+(j+1)%sectors; c=a+sectors; d=b+sectors
                faces = ([(a,b,c)] if r else []) + ([(b,d,c)] if r<rings-1 else [])
                for tri in faces:
                    outward = side*sum(directions[i][1] for i in tri)/3
                    color = [.007,.009,.009] if outward>.75 else [.15,.115,.062] if outward>.45 else [.025,.034,.033]
                    indices.extend(start+i for i in tri)
                    colors.append(color)


source = Path(sys.argv[sys.argv.index("--") + 1])
out = Path(__file__).resolve().parents[1] / "viewer/assets/subsea"
out.mkdir(exist_ok=True)
# The fish lengths and ray wingspan are scene dimensions in metres.
for name, filename, axis, size in [
    ("Fish2", "reef-fish-1", 0, .32),
    ("Fish3", "reef-fish-2", 0, .23),
    ("Manta ray", "manta", 1, 3.4),
]:
    if "--reef-only" in sys.argv and filename == "manta":
        continue
    bpy.ops.wm.open_mainfile(filepath=str(source / (name + ".blend")))
    scene = bpy.context.scene
    obj, = [item for item in scene.objects if item.type == "MESH"]
    armature = obj.find_armature()
    action = armature.animation_data.action
    start, end = action.frame_range
    # Refine in bind space so all eight samples have identical topology and
    # the original bone weights and silhouette remain continuous at every joint.
    bpy.context.view_layer.objects.active = obj
    smooth = obj.modifiers.new("Smooth bind geometry", "SUBSURF")
    smooth.levels = 1
    while obj.modifiers.find(smooth.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=smooth.name)
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    if filename != "manta":
        reduce = obj.modifiers.new("School triangle budget", "DECIMATE")
        reduce.ratio = .48
        reduce.delimit = {"MATERIAL"}
        while obj.modifiers.find(reduce.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=reduce.name)
        bpy.ops.object.modifier_apply(modifier=reduce.name)
    frames = []
    for step in range(8):
        frame = start + (end - start) * step / 8
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        local = []
        for vertex in mesh.vertices:
            x, y, z = evaluated.matrix_world @ vertex.co
            local.append((-y, x, z))
        if step == 0:
            scale = size / (max(v[axis] for v in local) - min(v[axis] for v in local))
            mesh.calc_loop_triangles()
            indices = [i for tri in mesh.loop_triangles for i in tri.vertices]
            colors = []
            for tri in mesh.loop_triangles:
                slot = obj.material_slots[tri.material_index]
                rgb = slot.material.diffuse_color[:3]
                if filename == "manta" and slot.name == "Top":
                    luminance = sum(v*w for v, w in zip(rgb, (.2126, .7152, .0722)))
                    rgb = [.30*v+.70*luminance*tint for v, tint in zip(rgb, (.56, .71, .75))]
                colors.append([round(v, 4) for v in rgb])
            # Shared bilateral detail on the two flanks, dorsal/ventral detail on the ray.
            tex_axis = 1 if filename == "manta" else 2
            repeat = .65 if filename == "manta" else .10
            uv = [round(v[k] * scale / repeat, 4) for v in local for k in (0, tex_axis)]
        frames.append([round(c * scale, 5) for v in local for c in v])
        evaluated.to_mesh_clear()
    eye_specs = {
        "manta": ((.71,.58,.055),(.042,.029,.030)),
        "reef-fish-1": ((.073,0,.036),(.010,.0041,.009)),
        "reef-fish-2": ((.0568,0,.024),(.0075,.0034,.007))
    }
    body_vertices = len(frames[0]) // 3
    add_eyes(frames, indices, colors, uv, *eye_specs[filename], project_flanks=filename != "manta")
    if filename != "manta":
        # The bilateral atlas follows the side-on +X-forward flank in the
        # first swim pose. All eight poses retain these material coordinates.
        # Leave a 32px border on the 1024 x 650 silhouette guide used for both fish.
        rest = list(zip(*[iter(frames[0])]*3))
        xmin, xmax = min(v[0] for v in rest), max(v[0] for v in rest)
        zmin, zmax = min(v[2] for v in rest), max(v[2] for v in rest)
        px = min(960/(xmax-xmin), 586/(zmax-zmin))
        uv = []
        for x, y, z in rest[:body_vertices]:
            uv.extend((round(.5+px*(x-(xmin+xmax)/2)/1024, 6),
                       round(.5+px*(z-(zmin+zmax)/2)/650, 6)))
        # Spherical irises share an atlas island above the tail; mapping each
        # eye in its local coordinates keeps the pupil centered on both flanks.
        for i in range(len(rest) - body_vertices):
            ring, sector = divmod(i % 70, 10)
            radius = math.sin(math.pi * ring / 6)
            angle = 2 * math.pi * sector / 10
            uv.extend((round((56 + 27 * radius * math.cos(angle))/1024, 6),
                       round(1 - (42 - 27 * radius * math.sin(angle))/650, 6)))

    result = {"frames": frames, "index": indices, "colors": colors, "uv": uv,
              "cycle": round((end - start) * scene.render.fps_base / scene.render.fps, 5)}
    if filename != "manta":
        from runpy import run_path
        swim = run_path(str(Path(__file__).resolve().parents[1] / "tools/school-swim.py"))["finish"]
        result = swim(result, "tang" if filename == "reef-fish-1" else "clown")
    path = out / (filename + ".json")
    path.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(filename, len(frames[0]) // 3, "vertices", len(indices) // 3, "triangles", path.stat().st_size, "bytes")
