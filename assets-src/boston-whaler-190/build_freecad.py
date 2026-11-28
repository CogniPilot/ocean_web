"""Generate the lofted hull and rail features in FreeCAD from metre dimensions."""

import math
from pathlib import Path

import FreeCAD as App
import Part


STATIONS = (
    (-2.91, 0.900, 0.780), (-2.59, 1.100, 0.775), (-1.45, 1.185, 0.775),
    (-0.65, 1.215, 0.780), (0.43, 1.215, 0.800), (1.00, 1.180, 0.820),
    (1.65, 1.035, 0.860), (2.10, 0.840, 0.910), (2.52, 0.570, 0.958),
    (2.83, 0.230, 1.002), (2.98, 0.030, 1.018),
)
# Traced from the nearly orthographic side photograph. The two chine depths
# are measured from the nearby rub rail. The running keel stays straight aft.
TOPSIDE_DEPTHS = (.535, .550, .555, .550, .500, .447, .321, .255, .199, .154, .133)
LOWER_CHINE_DEPTHS = (.670, .688, .716, .718, .684, .620, .509, .401, .273, .175, .166)
KEEL_HEIGHTS = (-.12, -.12, -.12, -.12, -.12, -.112, -.024, .130, .283, .375, .405)
DEADRISE = math.tan(math.radians(16))
TRANSOM_RAKE = .36
BOW_RAIL_HEIGHT = 0.33
PANELS = (
    "Sheer", "Topside trim", "Topsides", "Outer chine",
    "Chine lip", "Bottom outboard", "Lifting strake", "Bottom inboard",
)


def vector(point):
    """Convert boat coordinates in metres to FreeCAD's millimetre units."""
    return App.Vector(*(1000 * value for value in point))


def section(station, topside_depth, lower_chine_depth, keel):
    x, width, top = station
    bow = max(0, x - 1.48) / 1.50
    rake = 0.66 * bow**1.6
    chine = top - topside_depth
    lower_chine = top - lower_chine_depth
    aft = max(0, 1 - (x - STATIONS[0][0]) / .75)
    true_transom_bottom = keel + DEADRISE * .88 * width
    outer_bottom = aft * true_transom_bottom + (1 - aft) * (lower_chine - .018)
    strake = min(
        keel + (DEADRISE + .24 * bow) * .54 * width,
        keel + .75 * (outer_bottom - keel),
    )

    points = (
        (x, width, top),
        (x - 0.06 * rake, 0.984 * width, top - 0.096),
        (x - 0.09 * rake, 0.968 * width, top - 0.113),
        (x - 0.38 * rake, 0.952 * width, chine),
        (x - 0.53 * rake, 0.911 * width, max(lower_chine + .018, outer_bottom + .028)),
        (x - 0.57 * rake, 0.88 * width, outer_bottom),
        (x - 0.71 * rake, 0.57 * width, strake + 0.022),
        (x - 0.76 * rake, 0.54 * width, strake),
        (x - rake, 0, keel),
    )
    if aft > 0:
        # The entire transom is a plane sloping forward toward the keel.
        points = tuple((px + aft * TRANSOM_RAKE * (top - pz) / (top - keel), py, pz)
                       for px, py, pz in points)
    # Blend the forward curved sections into one raked stem profile. The
    # narrow ends of the paneled curves then meet without a projecting ledge.
    stem = max(0, (x - 2.52) / (STATIONS[-1][0] - 2.52))
    stem = stem * stem * (3 - 2 * stem)
    if stem == 0:
        return points
    return tuple((px, py, pz + stem * (top - (top - keel) * ((x - px) / rake)**.90 - pz))
                 for px, py, pz in points)


def tag(feature, material):
    feature.addProperty("App::PropertyString", "Finish", "Presentation")
    feature.Finish = material


def shape_feature(group, name, label, shape, material=None):
    obj = group.newObject("Part::Feature", name)
    obj.Label = label
    obj.Shape = shape
    if material:
        tag(obj, material)
    return obj


def spline(points):
    curve = Part.BSplineCurve()
    curve.interpolate([vector(point) for point in points])
    return curve.toShape()


def hull_curve(points):
    # Use shape-preserving cubic station interpolation so the sheer does not
    # widen past the published beam between the two full-width stations.
    knots = [station[0] for station in STATIONS]
    steps = [b - a for a, b in zip(knots, knots[1:])]
    rates = [tuple((b - a) / step for a, b in zip(left, right))
             for left, right, step in zip(points, points[1:], steps)]
    slopes = [rates[0]]
    for before, after, left, right in zip(rates, rates[1:], steps, steps[1:]):
        p, q = 2 * right + left, right + 2 * left
        slopes.append(tuple((p + q) / (p / a + q / b) if a * b > 0 else 0
                            for a, b in zip(before, after)))
    slopes.append(rates[-1])
    poles = [vector(points[0])]
    for left, right, outgoing, incoming, step in zip(points, points[1:], slopes, slopes[1:], steps):
        poles.extend((
            vector(tuple(x + v * step / 3 for x, v in zip(left, outgoing))),
            vector(tuple(x - v * step / 3 for x, v in zip(right, incoming))),
            vector(right),
        ))
    curve = Part.BSplineCurve()
    curve.buildFromPolesMultsKnots(poles, [4] + [3] * (len(knots) - 2) + [4], knots, False, 3)
    return curve.toShape()


def add_hull(document):
    hull = document.addObject("App::DocumentObjectGroup", "Hull")
    hull.addProperty("App::PropertyLength", "HullLength", "Reference dimensions").HullLength = 5890
    hull.addProperty("App::PropertyLength", "HullBeam", "Reference dimensions").HullBeam = 2430
    hull.addProperty("App::PropertyAngle", "TransomDeadrise", "Reference dimensions").TransomDeadrise = 16
    profiles = hull.newObject("App::DocumentObjectGroup", "HullProfiles")
    profiles.Label = "Sheer, chine and strake curves"
    stations = [section(*row) for row in zip(STATIONS, TOPSIDE_DEPTHS, LOWER_CHINE_DEPTHS, KEEL_HEIGHTS)]
    for side, name in ((-1, "Starboard"), (1, "Port")):
        edges = [
            shape_feature(
                profiles, f"{name}Profile{index + 1}", f"{name} profile {index + 1}",
                hull_curve([(x, side * y, z) for x, y, z in (row[index] for row in stations)]),
            )
            for index in range(len(PANELS) + 1)
        ]
        for index, panel in enumerate(PANELS):
            surface = hull.newObject("Part::RuledSurface", f"{name}Hull{index + 1}")
            surface.Label = f"{name} {panel.lower()}"
            surface.Curve1 = (edges[index], ["Edge1"])
            surface.Curve2 = (edges[index + 1], ["Edge1"])
            tag(surface, "Hull trim" if index == 1 else "Gelcoat")
    # The caps use the actual end sections so that re-fairing the longitudinal
    # features cannot leave holes between the CAD hull and the Blender fittings.
    aft, forward = stations[0], stations[-1]
    transom = [vector(point) for point in aft]
    transom.extend(vector((x, -y, z)) for x, y, z in reversed(aft[:-1]))
    transom.append(transom[0])
    face = Part.Face(Part.makePolygon(transom))
    if face.normalAt(0, 0).x > 0:
        face.reverse()
    shape_feature(hull, "Transom", "Transom", face, "Gelcoat")

    stem_faces = []
    for (x, y, z), (next_x, next_y, next_z) in zip(forward, forward[1:]):
        vertices = [vector((x, -y, z)), vector((x, y, z)), vector((next_x, next_y, next_z))]
        if next_y > 0:
            vertices.append(vector((next_x, -next_y, next_z)))
        face = Part.Face(Part.makePolygon(vertices + [vertices[0]]))
        if face.normalAt(0, 0).x < 0:
            face.reverse()
        stem_faces.append(face)
    shape_feature(hull, "Stem", "Stem", Part.makeCompound(stem_faces), "Gelcoat")
    profiles.Visibility = False
    return hull


def cylinder(start, end, radius):
    a = vector(start)
    span = vector(end) - a
    return Part.makeCylinder(1000 * radius, span.Length, a, span)


def add_rail(group, profiles, name, label, points, radius):
    rail_path = spline(points)
    path = shape_feature(profiles, name + "Path", label + " centreline", rail_path)
    plane = rail_path.tangentAt(rail_path.FirstParameter)
    rim = Part.Wire([Part.makeCircle(1000 * radius, vector(points[0]), plane)])
    profile = shape_feature(profiles, name + "Section", label + " section", rim)
    sweep = group.newObject("Part::Sweep", name)
    sweep.Label = label
    sweep.Sections = [profile]
    sweep.Spine = (path, ["Edge1"])
    sweep.Solid = True
    tag(sweep, "Stainless steel")


def add_rails(document):
    rails = document.addObject("App::DocumentObjectGroup", "Rails")
    rails.addProperty("App::PropertyLength", "BowStandOff", "Reference dimensions").BowStandOff = 330
    profiles = rails.newObject("App::DocumentObjectGroup", "RailProfiles")
    profiles.Label = "Rail paths and round sections"
    mounts = [(x, span - 0.065, z - 0.009) for x, span, z in STATIONS[4:-1]]
    # The stem fitting sits on the rising center of the gunwale, aft of the
    # narrow bow tip. Its sloped flange follows the liner under a vertical tube.
    mounts.append((2.945, 0, .969))
    bow = [(x, y, z + BOW_RAIL_HEIGHT) for x, y, z in mounts]
    bow += [(x, -y, z) for x, y, z in reversed(bow[:-1])]
    add_rail(rails, profiles, "BowRail", "Continuous bow rail", bow, 0.016)
    for side, name in ((-1, "Starboard"), (1, "Port")):
        for index, (x, y, z) in enumerate(mounts):
            at_stem = index == len(mounts) - 1
            if at_stem and side < 0:
                continue
            y *= side
            strut = cylinder((x, y, z), (x, y, z + BOW_RAIL_HEIGHT), 0.0135)
            if at_stem:
                flange = cylinder((x + .005, y, z - .005), (x - .005, y, z + .005), .024)
            else:
                flange = cylinder((x, y, z - .006), (x, y, z + .004), .030)
            shape_feature(rails, f"{name}BowPost{index + 1}", f"{name} bow post {index + 1}",
                          Part.makeCompound([strut, flange]), "Stainless steel")
        aft = ((-2.76, 0.82, 0.78), (-2.64, 0.87, 1.04), (-2.43, 0.976, 1.065),
               (-1.55, 1.088, 1.065), (-1.36, 1.112, 1.04), (-1.23, 1.13, 0.775))
        add_rail(rails, profiles, name + "DeckRail", name + " aft rail",
                 [(x, side * y, z) for x, y, z in aft], 0.015)
        brace = cylinder((-1.97, side * 1.068, 0.775), (-1.97, side * 1.052, 1.067), 0.012)
        shape_feature(rails, name + "AftPost", name + " aft post", brace, "Stainless steel")
    profiles.Visibility = False
    return rails


def main():
    folder = Path(__file__).resolve().parent
    doc = App.newDocument("BostonWhaler190")
    doc.Label = "Boston Whaler 190 hull and rail engineering model"
    doc.Comment = "2027 190 Montauk specification. Below-sheer curves traced from the broadside reference; transverse sections use photo estimates."
    add_hull(doc)
    add_rails(doc)
    doc.recompute()
    for obj in doc.Objects:
        if hasattr(obj, "Finish") and (obj.Shape.isNull() or not obj.Shape.isValid()):
            raise ValueError(f"Invalid CAD shape for {obj.Label}")
    doc.saveAs(str(folder / "BostonWhaler190.FCStd"))


if __name__ == "__main__":
    main()
