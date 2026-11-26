"""Convert a survey OBJ and its photographic textures into two metre-scale glTF LODs.

Run with Blender in background mode. Input OBJ axes below are the raw numbers
in its v records and both exports use the same original-survey origin.
"""

import argparse
import json
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
import numpy as np
from PIL import Image


def coordinates(mesh):
    data = np.empty(3 * len(mesh.vertices), dtype=np.float32)
    mesh.vertices.foreach_get("co", data)
    return data.reshape(-1, 3)


def align(obj, args):
    up = np.asarray(args.up, dtype=float)
    forward = np.asarray(args.forward, dtype=float)
    up /= np.linalg.norm(up)
    forward -= forward.dot(up) * up
    forward /= np.linalg.norm(forward)
    axes = np.array([forward, np.cross(up, forward), up])
    xyz = coordinates(obj.data) @ axes.T * args.scale
    low, high = xyz.min(axis=0), xyz.max(axis=0)
    translation = -(high + low) / 2
    translation[2] = -low[2]
    transform = np.identity(4)
    transform[:3, :3] = axes * args.scale
    transform[:3, 3] = translation
    obj.data.transform(Matrix(transform))
    return transform.tolist()


def duplicate_and_reduce(source, budget):
    obj = source.copy()
    obj.data = source.data.copy()
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Reduce survey triangles", "DECIMATE")
    modifier.ratio = min(1.0, budget / len(obj.data.polygons))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.polygons.foreach_set(
        "use_smooth", np.ones(len(obj.data.polygons), dtype=bool)
    )
    return obj


def photo_atlas(obj, resolution, tmp, tag):
    # UVs follow the surviving triangle corners through the collapse. Pack the
    # source photographs once so each mobile LOD uses one material and draw call.
    mesh = obj.data
    originals = []
    for material in mesh.materials:
        tex = (
            next(
                (
                    n.image
                    for n in material.node_tree.nodes
                    if n.type == "TEX_IMAGE" and n.image
                ),
                None,
            )
            if material and material.node_tree
            else None
        )
        originals.append(Path(bpy.path.abspath(tex.filepath)) if tex else None)
    if not mesh.uv_layers.active or not any(originals):
        raise ValueError("Expected a UV-mapped photographic survey with materials")
    faces = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("material_index", faces)
    paths = list(dict.fromkeys(originals[i] for i in np.unique(faces)))
    tiles = len(paths)
    columns = int(np.ceil(np.sqrt(tiles)))
    rows = (tiles + columns - 1) // columns
    atlas = Image.new("RGB", (columns * resolution, rows * resolution), "gray")
    slot = np.zeros((len(originals), 2), dtype=float)
    for index, src in enumerate(paths):
        x, y = index % columns, index // columns
        if src:
            with Image.open(src) as image:
                atlas.paste(
                    image.convert("RGB").resize(
                        (resolution, resolution), Image.Resampling.LANCZOS
                    ),
                    (x * resolution, y * resolution),
                )
        for j, m in enumerate(originals):
            if m == src:
                slot[j] = [x, rows - 1 - y]
    filename = tmp / f"{tag}.jpg"
    atlas.save(filename, quality=85, subsampling=0, optimize=True)
    uv = mesh.uv_layers.active
    pairs = np.empty((len(mesh.loops), 2), dtype=np.float32)
    uv.data.foreach_get("uv", pairs.ravel())
    if (pairs < -0.005).any() or (pairs > 1.005).any():
        raise ValueError(
            "Texture contains wrapping UVs which require their own atlas tile"
        )
    lengths = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_total", lengths)
    # Half-texel inset prevents bilinear bleed from a neighbouring tile edge.
    local = (np.clip(pairs, 0, 1) * (resolution - 1) + 0.5) / resolution
    combined = (local + np.repeat(slot[faces], lengths, axis=0)) / [columns, rows]
    uv.data.foreach_set("uv", np.asarray(combined, dtype=np.float32).ravel())
    mat = bpy.data.materials.new(f"{tag} survey photograph")
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 1.0
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(filename))
    mat.node_tree.links.new(tex.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.clear()
    mesh.materials.append(mat)
    return atlas.size


def distant_mesh(source, budget, photo_size):
    """Cluster narrow scan boundaries at distant-view scale and bake observed color to vertices."""
    mesh = source.data
    xyz = coordinates(mesh)
    mesh.calc_loop_triangles()
    triangles = np.empty((len(mesh.loop_triangles), 3), np.int32)
    corners = np.empty_like(triangles)
    mats = np.empty(len(triangles), np.int32)
    mesh.loop_triangles.foreach_get("vertices", triangles.ravel())
    mesh.loop_triangles.foreach_get("loops", corners.ravel())
    mesh.loop_triangles.foreach_get("material_index", mats)
    uvs = np.empty((len(mesh.loops), 2), dtype="f4")
    mesh.uv_layers.active.data.foreach_get("uv", uvs.ravel())
    points = xyz[triangles]
    areas = np.linalg.norm(
        np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0]), axis=1
    )
    colors = np.zeros_like(xyz, dtype=float)
    weight = np.zeros(len(xyz))
    for index in np.unique(mats):
        material = mesh.materials[index]
        tex = next(
            (
                n.image
                for n in material.node_tree.nodes
                if n.type == "TEX_IMAGE" and n.image
            ),
            None,
        )
        selected = mats == index
        face = triangles[selected].ravel()
        uv = np.clip(uvs[corners[selected]].reshape(-1, 2), 0, 1)
        if tex:
            with Image.open(bpy.path.abspath(tex.filepath)) as image:
                image.thumbnail((photo_size, photo_size), Image.Resampling.LANCZOS)
                rgb = np.asarray(image.convert("RGB"))
                x = np.rint(uv[:, 0] * (image.width - 1)).astype(int)
                y = np.rint((1 - uv[:, 1]) * (image.height - 1)).astype(int)
                srgb = rgb[y, x].astype(float) / 255
                color = np.where(
                    srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4
                )
        else:
            color = np.full((len(face), 3), 0.5)
        w = np.repeat(areas[selected], 3)
        np.add.at(colors, face, w[:, None] * color)
        np.add.at(weight, face, w)
    low = xyz.min(axis=0)

    def cluster(spacing):
        _, cells = np.unique(
            np.floor((xyz - low) / spacing).astype("i4"), axis=0, return_inverse=True
        )
        faces = cells[triangles]
        a, b, c = faces.T
        faces = faces[(a != b) & (b != c) & (c != a)]
        _, keep = np.unique(np.sort(faces, axis=1), axis=0, return_index=True)
        return cells, faces[keep]

    # Limit the actual face count after collapsing and removing duplicate triangles.
    hi = max(np.ptp(xyz, axis=0))
    lo = 0.0
    accepted = None
    for _ in range(12):
        mid = (lo + hi) * 0.5
        cells, faces = cluster(mid)
        if len(faces) <= budget:
            hi = mid
            if len(faces) > 0:
                accepted = cells, faces
        else:
            lo = mid
    if accepted is None:
        raise ValueError("Distant face budget cannot represent the scan")
    cells, faces = accepted
    weighted = np.bincount(cells, weights=weight)
    used, remap = np.unique(faces, return_inverse=True)
    if (weighted[used] <= 0).any():
        raise ValueError("Zero-area retained cluster")

    def combine(data):
        return np.column_stack(
            [np.bincount(cells, weights=v)[used] / weighted[used] for v in data.T]
        )

    position = combine(xyz * weight[:, None])
    linear = combine(colors)
    far = bpy.data.meshes.new("Distant survey")
    far.from_pydata(position.tolist(), [], remap.reshape(-1, 3).tolist())
    far.update()
    far.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    attr = far.color_attributes.new(name="Survey", type="BYTE_COLOR", domain="POINT")
    rgba = np.column_stack((np.clip(linear, 0, 1), np.ones(len(linear)))).astype("f4")
    attr.data.foreach_set("color", rgba.ravel())
    far.color_attributes.active_color = attr
    material = bpy.data.materials.new("Distant photographic colour")
    material.use_nodes = True
    color_node = material.node_tree.nodes.new("ShaderNodeVertexColor")
    color_node.layer_name = attr.name
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 1.0
    material.node_tree.links.new(
        color_node.outputs["Color"], principled.inputs["Base Color"]
    )
    far.materials.append(material)
    obj = bpy.data.objects.new("Distant survey", far)
    bpy.context.collection.objects.link(obj)
    return obj


def samples(obj, count, seed=918):
    mesh = obj.data
    mesh.calc_loop_triangles()
    faces = np.empty((len(mesh.loop_triangles), 3), dtype=np.int32)
    mesh.loop_triangles.foreach_get("vertices", faces.ravel())
    vertices = coordinates(mesh)
    # Draw samples uniformly by surface area in chunks to bound RAM on large scans.
    area = np.empty(len(faces), dtype=np.float64)
    for start in range(0, len(faces), 100_000):
        take = slice(start, start + 100_000)
        triangle = vertices[faces[take]]
        area[take] = np.linalg.norm(
            np.cross(triangle[:, 1] - triangle[:, 0], triangle[:, 2] - triangle[:, 0]),
            axis=1,
        )
    rng = np.random.default_rng(seed)
    chosen = vertices[faces[rng.choice(len(faces), count, p=area / area.sum())]]
    uv = rng.random((count, 2))
    uv[uv.sum(axis=1) > 1] = 1 - uv[uv.sum(axis=1) > 1]
    return (
        chosen[:, 0]
        + (chosen[:, 1] - chosen[:, 0]) * uv[:, 0, None]
        + (chosen[:, 2] - chosen[:, 0]) * uv[:, 1, None]
    )


def surface_error(points, tree):
    errors = [tree.find_nearest(point)[3] for point in points]
    return dict(
        zip(
            ("median", "p95", "p99", "maxSample"),
            np.percentile(errors, [50, 95, 99, 100]).tolist(),
        )
    )


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("obj", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--up", nargs=3, type=float, required=True)
    p.add_argument("--forward", nargs=3, type=float, required=True)
    p.add_argument("--scale", type=float, required=True, help="Metres per OBJ unit")
    p.add_argument("--far-faces", type=int, default=1800)
    p.add_argument("--dive-faces", type=int, default=75000)
    p.add_argument(
        "--far-texture", type=int, default=128, help="Pixels per source texture side"
    )
    p.add_argument("--dive-texture", type=int, default=1536)
    args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(
        filepath=str(args.obj.resolve()),
        forward_axis="Y",
        up_axis="Z",
        use_split_objects=False,
        use_split_groups=False,
    )
    source = bpy.context.active_object
    print(f"Imported {len(source.data.polygons):,} faces.", flush=True)
    # Filtered OBJ files can retain now-unreferenced source vertices.
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(source.data)
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(source.data)
    bm.free()
    transform = align(source, args)
    bpy.context.view_layer.update()
    pts = samples(source, 30000)
    source_tree = BVHTree.FromObject(source, bpy.context.evaluated_depsgraph_get())
    previous = source
    report = {
        "inputFaces": len(source.data.polygons),
        "metresPerSourceUnit": args.scale,
        "sourceToBlenderZUp": transform,
        "sampleCountPerDirection": len(pts),
    }
    with tempfile.TemporaryDirectory() as temporary:
        for tag, budget, tex in (
            ("dive", args.dive_faces, args.dive_texture),
            ("far", args.far_faces, args.far_texture),
        ):
            print(f"Reducing {tag} to {budget:,} faces.", flush=True)
            if tag == "dive":
                previous = duplicate_and_reduce(source, budget)
                visible = previous.copy()
                visible.data = previous.data.copy()
                bpy.context.collection.objects.link(visible)
                atlas = list(photo_atlas(visible, tex, Path(temporary), tag))
            else:
                visible = distant_mesh(previous, budget, tex)
                atlas = None
            visible.name = f"{args.output.name} {tag}"
            bpy.ops.object.select_all(action="DESELECT")
            visible.select_set(True)
            bpy.context.view_layer.objects.active = visible
            glb = args.output / f"{tag}.glb"
            bpy.ops.export_scene.gltf(
                filepath=str(glb.resolve()),
                export_format="GLB",
                use_selection=True,
                export_vertex_color="NONE" if tag == "dive" else "MATERIAL",
                export_materials="EXPORT",
                export_normals=True,
                export_yup=True,
                export_image_format="AUTO",
            )
            tree = BVHTree.FromObject(visible, bpy.context.evaluated_depsgraph_get())
            span = coordinates(visible.data)
            low, high = span.min(axis=0), span.max(axis=0)
            report[tag] = {
                "faces": len(visible.data.polygons),
                "bytes": glb.stat().st_size,
                "atlas": atlas,
                "boundsGltf": [
                    [float(low[0]), float(low[2]), float(-high[1])],
                    [float(high[0]), float(high[2]), float(-low[1])],
                ],
                "sourceToLodDistanceM": surface_error(pts, tree),
                "lodToSourceDistanceM": surface_error(
                    samples(visible, len(pts)), source_tree
                ),
            }
            print(tag, json.dumps(report[tag]), flush=True)
    (args.output / "mesh-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
