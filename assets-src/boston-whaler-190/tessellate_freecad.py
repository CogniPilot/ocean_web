"""Sample the FreeCAD hull and rails for the Blender export."""

import json
import math
import os
from pathlib import Path

import FreeCAD as App
import MeshPart


def point(vector):
    return [vector.x / 1000, vector.y / 1000, vector.z / 1000]


def hull_panel(obj, columns=128):
    # Adjacent panels sample their common CAD curve at identical parameters.
    # This keeps their boundaries coincident while retaining hard chine normals.
    boundaries = [ref[0].getSubObject(ref[1][0]) for ref in (obj.Curve1, obj.Curve2)]
    vertices = [
        point(edge.valueAt(edge.FirstParameter + i / columns *
                           (edge.LastParameter - edge.FirstParameter)))
        for i in range(columns + 1) for edge in boundaries
    ]
    triangles = []
    for i in range(0, 2 * columns, 2):
        pair = [[i, i + 1, i + 2], [i + 1, i + 3, i + 2]]
        triangles.extend([face[::-1] for face in pair] if obj.Name.startswith("Port") else pair)
    return vertices, triangles


def round_rail(obj, sides=12):
    # Step along the native sweep spine instead of meshing its entire B-rep.
    # A 16 mm tube only needs twelve facets around the circumference.
    path, edges = obj.Spine
    edge = path.getSubObject(edges[0])
    radius = obj.Sections[0].Shape.Edges[0].Curve.Radius
    stations = edge.discretize(Number=math.ceil(edge.Length / 45) + 1)
    vertices = []
    faces = []
    world_up = App.Vector(0, 0, 1)
    for i, center in enumerate(stations):
        tangent = stations[min(i + 1, len(stations) - 1)] - stations[max(0, i - 1)]
        tangent.normalize()
        horizontal = tangent.cross(world_up)
        if horizontal.Length < 1e-6:
            horizontal = tangent.cross(App.Vector(0, 1, 0))
        horizontal.normalize()
        vertical = tangent.cross(horizontal)
        for j in range(sides):
            angle = math.tau * j / sides
            radial = horizontal * math.cos(angle) + vertical * math.sin(angle)
            vertices.append(point(center + radial * radius))
            if i:
                a, b = (i - 1) * sides + j, (i - 1) * sides + (j + 1) % sides
                faces.extend(((a, b, a + sides), (b, b + sides, a + sides)))
    end = (len(stations) - 1) * sides
    faces.extend((0, j + 1, j) for j in range(1, sides - 1))
    faces.extend((end, end + j, end + j + 1) for j in range(1, sides - 1))
    return vertices, faces


def main():
    folder = Path(__file__).resolve().parent
    doc = App.openDocument(str(folder / "BostonWhaler190.FCStd"))
    doc.recompute()
    meshes = []
    for obj in doc.Objects:
        if not hasattr(obj, "Finish"):
            continue
        if obj.Shape.isNull() or not obj.Shape.isValid():
            raise ValueError(f"Invalid CAD shape for {obj.Label}")
        if obj.TypeId == "Part::RuledSurface":
            vertices, triangles = hull_panel(obj)
        elif obj.TypeId == "Part::Sweep":
            vertices, triangles = round_rail(obj)
        else:
            mesh = MeshPart.meshFromShape(Shape=obj.Shape, LinearDeflection=1.0,
                                          AngularDeflection=math.radians(24), Relative=False)
            vectors, triangles = mesh.Topology
            vertices = list(map(point, vectors))
        meshes.append({
            "name": obj.Label,
            "material": obj.Finish,
            "vertices": vertices,
            "faces": triangles,
        })
    if not meshes:
        raise ValueError("The CAD file contains no exportable features")
    Path(os.environ["WHALER_CAD_MESH"]).write_text(json.dumps(meshes))


if __name__ == "__main__":
    main()
