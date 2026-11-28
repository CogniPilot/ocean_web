"""Shared rigid-housing dimensions in Piccard forward, port and up axes (metres)."""

import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FINISHES = {
    "tube": ("Graphite pressure vessel", (.063, .066, .069), .22, .56),
    "frame": ("Black frame and clamps", (.027, .030, .034), .18, .41),
    "rubber": ("Motor guards and cables", (.016, .020, .024), .08, .34),
    "alloy": ("Machined hardware", (.48, .53, .56), .68, .29),
    "pack": ("Yellow equipment pack", (.78, .46, .033), .07, .47),
    "pickup": ("Piccard magnetic pickup steel", (.21, .24, .24), .66, .43),
}


def thruster_layout():
    plant = (ROOT / "Wreck/package.mo").read_text()

    def table(name):
        rows = re.search(rf"parameter Real {name}\[6,3\]\s*=\s*\[([^\]]+)\]", plant)
        if rows is None:
            raise ValueError(f"Missing {name} table in Wreck/package.mo")
        return [list(map(float, row.split(","))) for row in rows[1].split(";")]

    return {"mounts": table("propMount"), "axes": table("propAxis")}


def housing_parts(mounts, cylinder, box, cable):
    cylinder("Pressure housing", (0, 0, .05), .085, .525, "tube")
    for x in (-.15, .13):
        cylinder("Saddle clamp", (x, 0, .05), .0915, .0335, "frame", 20)
        box("Clamp foot", (x, 0, .0435), (.039, .229, .018), "frame")
        for y in (-.1005, .1005):
            box("Clamp nut", (x, y, .056), (.0115, .0115, .0075), "alloy")
    for x in (-.265, .265):
        cylinder("Viewport flange", (x, 0, .05), .09, .012, "frame")
        for i in range(12):
            angle = 2 * math.pi * i / 12
            center = (x + math.copysign(.008, x), .083 * math.cos(angle), .05 + .083 * math.sin(angle))
            cylinder("Flange fastener", center, .0045, .005, "alloy", 6)

    for side in (-1, 1):
        y = side * .109
        for x in (-.178, .178):
            box("Longitudinal side plate", (x, y, .0075), (.245, .0075, .0955), "frame")
        box("Upper plate bridge", (0, y, .0455), (.115, .0075, .0195), "frame")
        box("Equipment tray rail", (0, y, -.0715), (.6025, .0095, .015), "frame")
        box("Lower pack", (-.02, side * .046, -.0625), (.365, .08, .042), "pack", .0055)
        drive_x = mounts[0][0]
        cable([(drive_x, side * .16, .0075), (drive_x + .025, side * .17, -.04),
               (.115, side * .1425, -.07), (.01, side * .12, -.077),
               (-.06, side * .10, -.06)], "rubber")
        for x, motor_y, z in mounts:
            if side * motor_y > 0:
                box("Thruster mounting lug", (x, side * .122, z - .0265), (.0275, .035, .013), "frame")
    for x in (-.265, -.10, .215):
        box("Lower tray crossmember", (x, 0, -.0885), (.016, .2225, .0095), "alloy")
    box("Equipment tray", (-.01, 0, -.0845), (.495, .20, .0065), "frame")

    for y in (-.022, .022):
        box("Pickup bearer", (-.01, y, .1415), (.31, .012, .007), "frame", .001)
    box("Piccard pickup plate", (0, 0, .1475), (.10, .068, .005), "pickup", .0015)
