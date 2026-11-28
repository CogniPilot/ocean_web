"""Create the 2025 Sundancer 320 cockpit solids in hull coordinates."""
import json
import math
import os
from pathlib import Path

import FreeCAD as App
import MeshPart
import Part

output = Path(os.environ["SUN_DANCER_COCKPIT_OUTPUT"])
doc = App.newDocument("SundancerCockpit")
assembly = doc.addObject("App::Part", "SundancerCockpit")
assembly.Label = "Sea Ray Sundancer 320 cockpit"
parts = []
groups = {}
pivots = {
    "Steering_wheel_pivot": (-.133, -.505, 1.303),
    "Throttle_port_pivot": (-.014, -.860, 1.236),
    "Throttle_starboard_pivot": (-.014, -.931, 1.236),
}
finishes = {
    "Gelcoat": [0.94, 0.94, 0.92],
    "Upholstery": [0.91, 0.90, 0.85],
    "VinylAccent": [0.84, 0.81, 0.73],
    "Dash": [0.27, 0.27, 0.26],
    "Slate": [0.12, 0.13, 0.14],
    "Rubber": [0.078, 0.083, 0.085],
    "Stainless": [0.71, 0.73, 0.74],
    "Display": [0.095, 0.14, 0.17],
    "Carpet": [0.55, 0.55, 0.53],
}


def vector(xyz):
    return App.Vector(*xyz) * 1000


def add(section, label, material, shape, pivot=None):
    if not shape.isValid() or shape.Volume <= 0:
        raise ValueError(f"Invalid cockpit solid for {section} / {label}")
    if section not in groups:
        group = doc.addObject("App::Part", "Section")
        group.Label = section
        assembly.addObject(group)
        groups[section] = group
    item = doc.addObject("Part::Feature", "Detail")
    item.Label = label
    item.Shape = shape
    groups[section].addObject(item)
    item.addProperty("App::PropertyString", "Finish", "Appearance")
    item.Finish = material
    item.addProperty("App::PropertyColor", "PreviewColor", "Appearance")
    item.PreviewColor = tuple(finishes[material])
    if pivot:
        item.addProperty("App::PropertyVector", "RotationCenter", "Motion")
        item.RotationCenter = vector(pivots[pivot])
    parts.append((item, section, material, pivot))


def softened_box(center, size, radius=0, pitch=0):
    shape = Part.makeBox(*(v * 1000 for v in size),
                         vector(tuple(x - dx / 2 for x, dx in zip(center, size))))
    if radius > 0:
        shape = shape.makeFillet(radius * 1000, shape.Edges)
    if pitch:
        shape.rotate(vector(center), App.Vector(0, 1, 0), pitch)
    return shape


def box(section, label, material, center, size, radius=0, pitch=0, pivot=None):
    add(section, label, material, softened_box(center, size, radius, pitch), pivot)


def rod_shape(start, end, radius):
    direction = vector(end) - vector(start)
    return Part.makeCylinder(radius * 1000, direction.Length,
                             vector(start), direction / direction.Length)


def rod(section, label, material, start, end, radius, pivot=None):
    add(section, label, material, rod_shape(start, end, radius), pivot)


def torus(section, label, material, center, axis, radius, tube, pivot=None):
    shape = Part.makeTorus(radius * 1000, tube * 1000, vector(center), App.Vector(*axis))
    add(section, label, material, shape, pivot)


def plate(section, label, material, corners, z, thickness):
    points = [vector((x, y, z)) for x, y in corners]
    shape = Part.Face(Part.makePolygon([*points, points[0]]))
    add(section, label, material, shape.extrude(vector((0, 0, thickness))))


def seat(section, prefix, x, y0, y1, facing, cushion_height, base_z):
    width = y1 - y0
    y = (y0 + y1) / 2
    box(section, prefix + " lower moulding", "Gelcoat", (x, y, (cushion_height + base_z) / 2),
        (.435, width, cushion_height - base_z), .04)
    box(section, prefix + " cushion foundation", "VinylAccent", (x, y, cushion_height + .022),
        (.469, width + .017, .060), .020)
    for side in [-1, 1]:
        panel_y = y + side * width / 4
        box(section, prefix + " upholstered cushion", "Upholstery", (x + .007 * facing, panel_y, cushion_height + .058),
            (.445, width / 2 - .008, .061), .021)
        box(section, prefix + " seatback", "Upholstery", (x - .198 * facing, panel_y, cushion_height + .235),
            (.124, width / 2 - .005, .28), .038, -10 * facing)
        box(section, prefix + " lumbar bolster", "VinylAccent", (x - .145 * facing, panel_y, cushion_height + .191),
            (.052, width / 2 - .027, .089), .019, -10 * facing)


def bucket(section, index, y):
    x = -.674
    box(section, f"Helm chair {index} molded storage base", "Gelcoat", (x, y, .693),
        (.455, .403, .315), .050)
    box(section, f"Helm chair {index} swivel", "Slate", (x, y, .863), (.329, .316, .044), .016)
    box(section, f"Helm chair {index} seat cushion", "Upholstery", (x, y, .926),
        (.422, .433, .107), .046)
    box(section, f"Helm chair {index} flip-up thigh bolster", "Upholstery", (x+.198, y, .952),
        (.128, .405, .104), .037, 12)
    box(section, f"Helm chair {index} upholstered back", "Upholstery", (x-.205, y, 1.142),
        (.155, .430, .409), .058, -10)
    box(section, f"Helm chair {index} headrest", "Upholstery", (x-.239, y, 1.352),
        (.140, .332, .120), .043, -7)
    box(section, f"Helm chair {index} inset lumbar pad", "VinylAccent", (x-.122, y, 1.156),
        (.041, .315, .294), .018, -10)
    for side in [-1, 1]:
        box(section, "Wrap-around upper side bolster", "Upholstery", (x-.067, y+side*.174, 1.003),
            (.225, .101, .143), .040)
    box(section, "Seat slider handle", "Stainless", (x+.168, y, .854), (.119, .074, .021), .009)


def insert_cup(section, name, x, y, z):
    axis = App.Vector(0, 0, 1)
    outer = Part.makeCylinder(40, 30, vector((x,y,z-.030)), axis)
    inner = Part.makeCylinder(35, 28, vector((x,y,z-.025)), axis)
    add(section, name, "Stainless", outer.cut(inner))
    torus(section, "Polished cup well lip", "Stainless", (x,y,z+.002), (0,0,1), .039, .003)


dashboard = "Twin digital helm"
box(dashboard, "Molded helm console", "Gelcoat", (.385, -.491, .950), (.735, .975, .830), .068)
box(dashboard, "Port companionway jamb", "Gelcoat", (.385, .802, .938), (.65, .155, .805), .046)
box(dashboard, "Companionway header and hatch bed", "Gelcoat", (.366, .404, 1.366), (.625, .82, .120), .042)
box(dashboard, "Sculpted charcoal dash brow", "Dash", (.258, -.547, 1.449), (.484, .892, .327), .073, -6)
box(dashboard, "Glare visor", "Dash", (.281, -.545, 1.614), (.474, .876, .049), .019, -5)
box(dashboard, "Black switch panel", "Slate", (.014, -.300, 1.260), (.049, .403, .153), .015)
box(dashboard, "Lower wheel shroud", "Slate", (.009, -.546, 1.283), (.054, .267, .190), .019, 12)
for center_y, name in [(-.405, "Port chartplotter"), (-.689, "Starboard sonar")]:
    box(dashboard, name + " electronics case", "Slate", (.028, center_y, 1.502), (.059, .278, .174), .010, 16)
    box(dashboard, name + " bezel", "Rubber", (-.006, center_y, 1.511), (.031, .265, .159), .011, 16)
    box(dashboard, name + " glass", "Display", (-.022, center_y, 1.515), (.010, .241, .136), .004, 16)

rod(dashboard, "Steering helm mounting boot", "Rubber", (.023, -.505, 1.273),
    pivots["Steering_wheel_pivot"], .053)
for y in [-.590, -.753]:
    rod(dashboard, "Footwell ventilation bezel", "Stainless", (.023, y, .974), (.010, y, .974), .040)
    rod(dashboard, "Vent grille", "Rubber", (.012, y, .974), (.008, y, .974), .036)
    for z in [.958, .974, .990]:
        box(dashboard, "Vent vane", "Dash", (.004, y, z), (.005, .051, .005))
box(dashboard, "Starboard side control armrest", "Gelcoat", (-.159, -.894, 1.119),
    (.558, .288, .141), .040)
box(dashboard, "Starboard armrest insert", "Dash", (-.160, -.890, 1.187),
    (.531, .261, .042), .017)
box(dashboard, "Twin throttle detent housing", "Slate", (-.014, -.897, 1.215),
    (.183, .171, .065), .023)
box(dashboard, "Throttle fascia", "Stainless", (-.008, -.897, 1.245), (.145, .155, .021), .009)
for name,(x,y,z) in pivots.items():
    if name == "Steering_wheel_pivot":
        continue
    box(dashboard, "Lever travel slot", "Rubber", (x+.017,y,1.257), (.111,.027,.007), .003)
    rod(dashboard, "Throttle hinge bushing", "Slate", (x,y-.022,z), (x,y+.022,z), .023)
    rod(dashboard, "Throttle lever stalk", "Stainless", (x,y,z), (x-.019,y,z+.156), .013, name)
    box(dashboard, "Molded throttle grip", "Rubber", (x-.019,y,z+.154),
        (.059,.067,.048), .014, pivot=name)
    box(dashboard, "Grip accent trim", "Stainless", (x-.045,y,z+.154),
        (.012,.048,.030), .005, pivot=name)

rod(dashboard, "Joystick mounting ring", "Stainless", (-.306,-.886,1.207), (-.306,-.886,1.227), .047)
rod(dashboard, "Joystick gimbal boot", "Rubber", (-.306,-.886,1.227), (-.306,-.886,1.248), .037)
rod(dashboard, "Joystick pedestal", "Slate", (-.306,-.886,1.246), (-.306,-.886,1.292), .023)
box(dashboard, "Joystick cap", "Rubber", (-.306,-.886,1.299), (.065,.061,.033), .012)
rod(dashboard, "Compass flange", "Stainless", (.291,-.763,1.633), (.291,-.763,1.643), .061)
compass = Part.makeSphere(55, vector((.291,-.763,1.642)), App.Vector(0,0,1), 0, 90)
add(dashboard, "Magnetic compass dome", "Slate", compass)

wheel = pivots["Steering_wheel_pivot"]
axis = App.Vector(-.981625, 0, .190822)
basis_v = App.Vector(0, 1, 0)
basis_w = basis_v.cross(axis)
center = App.Vector(*wheel)
for angle in [0, 2.11, 4.19]:
    radial = basis_v * math.sin(angle) + basis_w * math.cos(angle)
    start = tuple(center + axis * .011 + radial * .021)
    end = tuple(center + radial * .126)
    rod(dashboard, "Polished steering wheel spoke", "Stainless", start, end, .013, "Steering_wheel_pivot")
torus(dashboard, "Black stitched wheel rim", "Rubber", wheel, tuple(axis), .139, .017, "Steering_wheel_pivot")
torus(dashboard, "Polished inner wheel reveal", "Stainless", tuple(center + axis * .007),
      tuple(axis), .126, .004, "Steering_wheel_pivot")
rod(dashboard, "Wheel hub", "Slate", wheel, tuple(center + axis * .028), .045, "Steering_wheel_pivot")
rod(dashboard, "Wheel center cap", "Stainless", tuple(center + axis * .026),
    tuple(center + axis * .033), .037, "Steering_wheel_pivot")

seating = "Cockpit upholstery"
for index, y in enumerate([-.308, -.777], start=1):
    bucket(seating,index,y)
seat(seating, "Convertible port companion bench", -.686, .248, .954, 1, .886, .538)
seat(seating, "Opposing starboard bench", -1.338, -.968, -.235, -1, .776, .538)
seat(seating, "Transom lounge", -3.307, .324, .940, 1, .759, .538)
for x in [-2.090,-2.491,-2.892]:
    box(seating, "Port lounge molded base", "Gelcoat", (x,.768,.647),
        (.400,.433,.218), .038)
    box(seating, "Port lounge upholstered cushion", "Upholstery", (x,.764,.793),
        (.391,.452,.099), .029)
    box(seating, "Port lounge outboard backrest", "Upholstery", (x,.925,.960),
        (.397,.135,.283), .035)
    box(seating, "Port lounge inset lumbar pad", "VinylAccent", (x,.857,.941),
        (.363,.044,.124), .019)
corner = softened_box((-3.203,.894,.942), (.357,.135,.260), .035)
corner.rotate(vector((-3.203,.894,.942)), App.Vector(0,0,1), 26)
add(seating, "Rounded port-to-transom backrest corner", "Upholstery", corner)
plate(seating, "Starboard cockpit carpet", "Carpet",
      [(-3.515,-.926),(-1.86,-.998),(-.802,-.962),(-.786,-.567),
       (-1.20,-.509),(-2.08,-.481),(-3.386,-.476)], .539, .006)
plate(seating, "Port cockpit carpet", "Carpet",
      [(-3.386,.457),(-2.02,.481),(-1.091,.674),(-.802,.638),
       (-.844,.920),(-1.11,.963),(-2.10,.957),(-3.42,.918)], .539, .006)
plate(seating, "Helm pilot footwell carpet", "Carpet",
      [(-.446,-.932),(.017,-.929),(.016,-.252),(-.43,-.255)], .537, .007)
rod(seating, "Removable table socket rim", "Stainless", (-1.950,.358,.543),
    (-1.950,.358,.555), .043)
rod(seating, "Removable table socket plug", "Rubber", (-1.950,.358,.552),
    (-1.950,.358,.556), .033)

wet_bar = "Starboard refreshment center"
shell = softened_box((-2.571,-.815,.744), (.781,.393,.410), .055)
counter = softened_box((-2.564,-.807,.976), (.812,.406,.073), .029)
skirt = softened_box((-2.567,-.807,.937), (.815,.408,.126), .031)
axis_up = App.Vector(0,0,1)
sink_origin = (-2.399,-.825)
opening = Part.makeCylinder(93, 275, vector((*sink_origin,.745)), axis_up)
cup_origin = (-2.850,-.842)
cup_opening = Part.makeCylinder(40, 225, vector((*cup_origin,.785)), axis_up)
for name,finish,shape in [("Wet-bar cabinet","Gelcoat",shell),
                          ("Limestone-pattern countertop","Gelcoat",counter),
                          ("Black counter edge and handrail mount","Slate",skirt)]:
    add(wet_bar,name,finish,shape.cut(opening).cut(cup_opening))
bowl = Part.makeCone(56, 90, 83, vector((*sink_origin,.925)), axis_up)
inner = Part.makeCone(52, 85, 82, vector((*sink_origin,.929)), axis_up)
add(wet_bar, "Spun stainless sink", "Stainless", bowl.cut(inner))
torus(wet_bar, "Wet-bar sink flange", "Stainless", (*sink_origin,1.008), (0,0,1), .092, .006)
rod(wet_bar, "Tap pillar", "Stainless", (-2.260,-.873,1.007), (-2.260,-.873,1.110), .011)
rod(wet_bar, "Tap spout", "Stainless", (-2.260,-.873,1.108), (-2.368,-.849,1.108), .012)
rod(wet_bar, "Tap nozzle", "Stainless", (-2.368,-.849,1.110), (-2.368,-.849,1.077), .011)
insert_cup(wet_bar, "Recessed stainless drink well", *cup_origin,1.013)
box(wet_bar, "Refrigerator door frame", "Slate", (-2.578,-.620,.741), (.443,.027,.315), .012)
box(wet_bar, "Refrigerator brushed door", "Stainless", (-2.583,-.605,.743), (.409,.025,.287), .009)
box(wet_bar, "Refrigerator recessed pull", "Rubber", (-2.448,-.590,.821), (.083,.015,.033), .006)
rod(wet_bar, "Inboard counter handrail", "Stainless", (-2.874,-.572,.941), (-2.237,-.572,.941), .013)
for x in [-2.864,-2.246]:
    rod(wet_bar, "Counter handrail standoff", "Stainless", (x,-.606,.941), (x,-.572,.941), .012)

doc.recompute()
doc.saveAs(str(output / "SeaRaySundancer320Cockpit.FCStd"))

meshes = []
for item, section, material, pivot in parts:
    tessellation = MeshPart.meshFromShape(
        Shape=item.Shape, LinearDeflection=1.5, AngularDeflection=1.0, Relative=False
    )
    vertices, triangles = tessellation.Topology
    meshes.append({
        "name": item.Label, "section": section, "finish": material, "pivot": pivot,
        "positions": [[v.x / 1000, v.y / 1000, v.z / 1000] for v in vertices],
        "triangles": triangles,
    })
(output / "cockpit-tessellation.json").write_text(json.dumps(
    {"pivots": pivots, "finishes": finishes, "parts": meshes}, separators=(",", ":")
))
