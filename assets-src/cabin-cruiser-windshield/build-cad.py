"""Build the original unbranded pilothouse glazing in FreeCAD; source lengths are metres."""
import json
import math
import os
from pathlib import Path

import FreeCAD as App
import MeshPart
import Part

source = Path(os.environ["CRUISER_WINDSHIELD_SOURCE"])
output = Path(os.environ["CRUISER_WINDSHIELD_OUTPUT"])
params = json.loads((source / "assembly.json").read_text())
doc = App.newDocument("CruiserWindshield")
assembly = doc.addObject("App::Part", "PilothouseGlazing")
assembly.Label = "Cabin cruiser pilothouse glazing"
parts = []


def normalise(v):
    return v / v.Length


def section_frame(corners, outward):
    vectors = [App.Vector(value) * 1000 for value in corners]
    origin = sum(vectors, App.Vector()) / len(vectors)
    horizontal = normalise(vectors[1] - vectors[0])
    upper_edge = vectors[2] - vectors[1] + vectors[3] - vectors[0]
    vertical = normalise(upper_edge - horizontal * upper_edge.dot(horizontal))
    normal = horizontal.cross(vertical)
    projected = [App.Vector((p - origin).dot(horizontal), (p - origin).dot(vertical), 0) for p in vectors]
    return origin, horizontal, vertical, normal, projected, math.copysign(1, normal.dot(App.Vector(outward)))


def inset(polygon, distance):
    result = []
    for index, current in enumerate(polygon):
        incoming = normalise(current - polygon[index - 1])
        outgoing = normalise(polygon[(index + 1) % len(polygon)] - current)
        left_in = App.Vector(-incoming.y, incoming.x, 0)
        left_out = App.Vector(-outgoing.y, outgoing.x, 0)
        result.append(current + (left_in + left_out) * (distance / (1 + left_in.dot(left_out))))
    return result


def rounded_wire(polygon, radius, transform):
    corners = []
    for index, point in enumerate(polygon):
        prev_edge = polygon[index - 1] - point
        next_edge = polygon[(index + 1) % len(polygon)] - point
        a, b = normalise(prev_edge), normalise(next_edge)
        bisector = normalise(a + b)
        half_angle = .5 * math.acos(max(-1, min(1, a.dot(b))))
        leg = min(radius / math.tan(half_angle), .37 * min(prev_edge.Length, next_edge.Length))
        r = leg * math.tan(half_angle)
        centre = point + bisector * (r / math.sin(half_angle))
        corners.append([transform(p) for p in (point + leg * a, centre - r * bisector, point + leg * b)])
    edges = []
    for index, (start, through, end) in enumerate(corners):
        edges.extend([Part.makeLine(corners[index - 1][2], start), Part.Arc(start, through, end).toShape()])
    return Part.Wire(edges)


def add(group, stem, label, shape, finish):
    if not shape.isValid() or abs(shape.Volume) < 1e-4:
        raise ValueError(f"Invalid solid for {label}")
    item = doc.addObject("Part::Feature", stem)
    item.Label = label
    item.Shape = shape
    item.addProperty("App::PropertyString", "Finish", "Appearance")
    item.Finish = finish
    group.addObject(item)
    parts.append(item)


def interpolate(a, b, weight):
    return [(1 - weight) * x + weight * y for x, y in zip(a, b)]


def panel(name, corners, outward):
    group = doc.addObject("App::Part", name)
    group.Label = name.replace("_", " ")
    assembly.addObject(group)
    origin, horizontal, vertical, normal, outline, outward_sign = section_frame(corners, outward)
    outward_normal = normal * outward_sign
    group.addProperty("App::PropertyVectorList", "Outline", "Geometry")
    group.Outline = [App.Vector(point) * 1000 for point in corners]

    flange = 1000 * params["flangeWidth"]
    depth = 1000 * params["flangeDepth"]
    radius = 1000 * params["outerCornerRadius"]
    gasket = 1000 * params["gasketWidth"]
    pane = 1000 * params["glassThickness"]

    def face(inset_by, plane):
        def transform(point):
            return origin + point.x * horizontal + point.y * vertical + plane * outward_normal
        return Part.Face(rounded_wire(inset(outline, inset_by), max(6, radius - inset_by), transform))

    # The flange and rubber seal each have a true opening. The pane edges sit
    # against the rubber lip, behind the exterior face of the flange.
    frame = face(0, -depth / 2).cut(face(flange, -depth / 2)).extrude(depth * outward_normal)
    seal = face(flange, -5).cut(face(flange + gasket, -5)).extrude(12 * outward_normal)
    window = face(flange + gasket, -pane / 2).extrude(pane * outward_normal)
    add(group, "Flange", "Powder-coated aluminum frame", frame, "Frame")
    add(group, "Seal", "EPDM glazing seal", seal, "Gasket")
    add(group, "Pane", "Laminated marine glazing", window, "Glazing")

    # Flush screw heads follow the tapered perimeter and remain clear of the
    # seal. Their rear faces sit inside the flange.
    mounting_line = inset(outline, flange * .52)
    fasteners = []
    for i, p in enumerate(mounting_line):
        following = mounting_line[(i + 1) % len(mounting_line)]
        length = (following - p).Length
        count = max(1, round(length / 260))
        for j in range(count):
            t = (j + .5) / count
            f = p + (following - p) * t
            base = origin + f.x * horizontal + f.y * vertical + (depth / 2 - .4) * outward_normal
            fasteners.append(Part.makeCylinder(3.5, 2.0, base, outward_normal))
    add(group, "Fasteners", "Stainless countersunk fasteners", Part.makeCompound(fasteners), "Stainless")


front_low_starboard, front_low_port, front_high_port, front_high_starboard = params["frontOutline"]
divided_low = interpolate(front_low_starboard, front_low_port, .5)
divided_high = interpolate(front_high_starboard, front_high_port, .5)
panel("Starboard_front", [front_low_starboard, divided_low, divided_high, front_high_starboard], [1, 0, 0])
panel("Port_front", [divided_low, front_low_port, front_high_port, divided_high], [1, 0, 0])

for side, name in [(1, "Port"), (-1, "Starboard")]:
    low_aft, low_forward, high_forward, high_aft = [
        [x, y * side, z] for x, y, z in params["portOutline"]
    ]
    low_split = interpolate(low_aft, low_forward, params["sideMullion"]["lowerFraction"])
    high_split = interpolate(high_aft, high_forward, params["sideMullion"]["upperFraction"])
    panel(name + "_aft_side", [low_aft, low_split, high_split, high_aft], [0, side, 0])
    panel(name + "_forward_side", [low_split, low_forward, high_forward, high_split], [0, side, 0])

# The original wiper mount is 11.8 mm forward of the glazing midplane.
# Keep the six millimetre pane and its gasket behind both pivots.
origin, _, _, normal, _, outward_sign = section_frame(params["frontOutline"], [1, 0, 0])
for pivot in params["wiperPivots"]:
    clearance = (App.Vector(pivot) * 1000 - origin).dot(normal) * outward_sign
    if clearance <= 1000 * params["glassThickness"] / 2:
        raise ValueError("Wiper pivot intersects the glass")

doc.recompute()
doc.saveAs(str(output / "CabinCruiserWindshield.FCStd"))

meshes = []
for item in parts:
    fastener = item.Finish == "Stainless"
    tessellation = MeshPart.meshFromShape(
        Shape=item.Shape, LinearDeflection=.7 if fastener else .5,
        AngularDeflection=1.05 if fastener else .45, Relative=False
    )
    vertices, triangles = tessellation.Topology
    meshes.append({
        "name": item.getParentGeoFeatureGroup().Label + " · " + item.Label,
        "finish": item.Finish,
        "positions": [[v.x / 1000, v.y / 1000, v.z / 1000] for v in vertices],
        "triangles": triangles,
    })
(output / "windshield-tessellation.json").write_text(json.dumps(meshes, separators=(",", ":")))
