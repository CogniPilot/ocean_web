"""Pack native shaft load samples in tank time, ahead thrust N and drive torque N m."""
import re

import numpy as np


def write_loads(directory, frames, time, thrust, torque, turns):
    samples = np.column_stack((time, thrust, torque, turns))
    if not np.isfinite(samples).all() or not np.all(np.diff(time) > 0):
        raise ValueError("Shaft loads require finite values and strictly increasing times")
    start, end = frames[0]["time"], frames[-1]["time"]
    # Keep samples on the recorded time interval, allowing for text precision.
    samples = samples[(time >= start-1e-8) & (time <= end+1e-8)]
    if start == 0 and len(samples) and samples[0, 0] > 0:
        samples = np.vstack(([0., 0., 0., 0.], samples))
    if len(samples) < 2 or abs(samples[0, 0]-start) > 1e-7 or abs(samples[-1, 0]-end) > 1e-7:
        raise ValueError("Shaft loads do not cover the flow recording")
    # Check the native motion history against the corresponding displayed blade meshes.
    angles = np.interp([f["time"] for f in frames], samples[:,0], samples[:,3])
    if not np.allclose(angles, [f["turns"] for f in frames], atol=.0002, rtol=0):
        raise ValueError("Shaft motion and recorded blade phase disagree")
    samples.astype("<f4").tofile(directory/"shaft-loads.bin")
    return {"shaftLoadSamples": len(samples),
            "shaftLoadBounds": [[float(v.min()), float(v.max())] for v in samples[:,1:3].T]}


def foam_loads(case):
    directory = case/"postProcessing/shaftLoads/0"
    force, moment = (np.loadtxt(directory/f"{key}.dat", usecols=(0, 1)) for key in ("force", "moment"))
    if not np.array_equal(force[:, 0], moment[:, 0]):
        raise ValueError("OpenFOAM shaft force and moment times differ")
    # rotatingMotion integrates its piecewise-linear angular velocity table.
    law = (case/"constant/dynamicMeshDict").read_text().split("omega table", 1)[1].split(";", 1)[0]
    knots, omega = np.asarray(re.findall(r"\(([-+0-9.eE]+)\s+([-+0-9.eE]+)\)", law), dtype=float).T
    t = force[:, 0]
    if knots[0] != 0 or np.any(np.diff(knots) <= 0) or t[-1] > knots[-1]:
        raise ValueError("Incomplete shaft speed table")
    angle = np.r_[0, np.cumsum(.5*(omega[1:]+omega[:-1])*np.diff(knots))]
    k = np.clip(np.searchsorted(knots, t, side="right")-1, 0, len(knots)-2)
    theta = angle[k] + .5*(t-knots[k])*(omega[k]+np.interp(t, knots, omega))
    return t, -force[:, 1], moment[:, 1], -theta/(2*np.pi)
