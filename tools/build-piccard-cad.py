"""Build the Piccard mechanical assembly in the FreeCAD Python console."""

import os
import sys
from pathlib import Path

import FreeCAD as App
import Part

sys.path.insert(0, str(Path(__file__).resolve().parent))
from piccard_design import ROOT, housing_parts, thruster_layout


def vector(metres):
    return App.Vector(*(coordinate * 1000 for coordinate in metres))


def build_document(destination):
    doc = App.newDocument("Piccard")
    labels = {"tube": "Pressure vessel", "frame": "Frame and mounts", "alloy": "Fasteners and crossmembers",
              "pack": "Equipment packs", "pickup": "Magnetic pickup", "rubber": "Motor leads"}
    groups = {}
    for key, label in labels.items():
        groups[key] = doc.addObject("App::DocumentObjectGroup", key.capitalize())
        groups[key].Label = label
    rotation = App.Rotation(App.Vector(0, 0, 1), App.Vector(1, 0, 0))

    def member(native_type, name, group):
        obj = doc.addObject(native_type, name.replace(" ", ""))
        obj.Label = name
        groups[group].addObject(obj)
        return obj

    def cylinder(name, center, radius, length, group, _vertices=48):
        obj = member("Part::Cylinder", name, group)
        obj.Radius = 1000 * radius
        obj.Height = 1000 * length
        x, y, z = center
        obj.Placement = App.Placement(vector((x - length / 2, y, z)), rotation)

    def box(name, center, dimensions, group, _bevel=.0015):
        obj = member("Part::Box", name, group)
        obj.Length, obj.Width, obj.Height = (dimension * 1000 for dimension in dimensions)
        corner = [coordinate - dimension / 2 for coordinate, dimension in zip(center, dimensions)]
        obj.Placement.Base = vector(corner)

    def cable(points, group):
        obj = member("Part::Feature", "Motor lead centerline", group)
        spline = Part.BSplineCurve()
        spline.interpolate([vector(point) for point in points])
        obj.Shape = spline.toShape()

    layout = thruster_layout()
    frame = groups["frame"]
    frame.addProperty("App::PropertyVectorList", "ThrusterCenters", "Mounts", "Body centers in millimetres")
    frame.addProperty("App::PropertyVectorList", "ThrusterAxes", "Mounts", "Unit vectors in body axes")
    frame.ThrusterCenters = [vector(center) for center in layout["mounts"]]
    frame.ThrusterAxes = [App.Vector(*axis) for axis in layout["axes"]]
    housing_parts(layout["mounts"], cylinder, box, cable)
    doc.recompute()

    rigid = [obj for obj in doc.Objects if obj.TypeId in ("Part::Box", "Part::Cylinder")]
    if not all(obj.Shape.isValid() and len(obj.Shape.Solids) == 1 for obj in rigid):
        raise ValueError("Piccard contains an invalid solid")
    pickup = groups["pickup"].Group[0].Shape.BoundBox
    if abs(pickup.ZMax - 150) > 1e-6:
        raise ValueError("Piccard pickup face differs from the Modelica dock height")
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc.saveAs(str(destination))
    print(f"Saved {len(rigid)} valid Piccard solids to {destination}")


if __name__ == "__main__":
    output = os.environ.get("PICCARD_CAD_OUTPUT", ROOT / "assets-src/piccard/Piccard.FCStd")
    build_document(Path(output).resolve())
