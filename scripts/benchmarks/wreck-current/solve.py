"""Precompute one incident current for a submerged metre-scale ENU triangle mesh."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import pyopencl as cl
import trimesh

from geometry import DIRECTIONS, grid, wall_links

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lattice_collision import build_lattice


def run(args):
    mesh = trimesh.load(args.geometry, force="mesh", process=False)
    triangles = np.asarray(mesh.triangles, dtype=float)
    if not triangles.size or not np.isfinite(triangles).all():
        raise ValueError("Geometry must contain finite triangular faces")
    positive = [
        args.spacing,
        args.speed,
        args.margin,
        args.viscosity,
        args.balance,
        args.lattice_speed,
        args.change,
    ]
    coordinates = [args.floor, args.surface, args.bearing, args.transits]
    if (
        not np.isfinite(positive + coordinates).all()
        or min(positive) <= 0
        or args.floor >= args.surface
    ):
        raise ValueError(
            "Expected finite coordinates, positive SI scales and positive domain depth"
        )
    z = triangles[..., 2]
    if z.min() >= args.surface or z.max() <= args.floor:
        raise ValueError("Wreck geometry lies outside the water column")
    if args.average_transits < 1 or args.transits < 2 * args.average_transits + 1:
        raise ValueError("Include at least one spin-up and two full averaging windows")
    lattice, dims, origin, axes = grid(
        triangles, args.bearing, args.spacing, args.floor, args.surface, args.margin
    )
    walls = wall_links(lattice, dims)
    devices = [
        d for p in cl.get_platforms() for d in p.get_devices() if d.double_fp_config
    ]
    gpu = next((d for d in devices if d.type & cl.device_type.GPU), None)
    if not gpu:
        raise RuntimeError("The offline solver requires a double-precision OpenCL GPU")
    ctx = cl.Context([gpu])
    queue = cl.CommandQueue(ctx)
    kernel = build_lattice(
        ctx, args.fmu, Path(__file__).with_name("domain.cl").read_text()
    ).advance
    cells = int(np.prod(dims))
    nx, ny, nz = map(int, dims)
    flags = cl.mem_flags

    def upload(data, access):
        return cl.Buffer(
            ctx, access | flags.COPY_HOST_PTR, hostbuf=np.ascontiguousarray(data)
        )

    directions = {tuple(d): i for i, d in enumerate(DIRECTIONS)}
    reflects = np.array(
        [
            [
                directions[tuple(v * [1, -1 if f & 1 else 1, -1 if f & 2 else 1])]
                for v in DIRECTIONS
            ]
            for f in range(4)
        ],
        dtype=np.int32,
    )
    weights = np.array([1 / 3] + [1 / 18] * 6 + [1 / 36] * 12)
    src = upload(np.broadcast_to(weights[:, None], (19, cells)), flags.READ_WRITE)
    dst = cl.Buffer(ctx, flags.READ_WRITE, src.size)
    links = upload(walls, flags.READ_ONLY)
    reflection = upload(reflects, flags.READ_ONLY)
    field = np.empty((nz, ny, nx, 4), dtype=np.float32)
    capture = cl.Buffer(ctx, flags.WRITE_ONLY, field.nbytes)
    inlet = args.lattice_speed
    dt = inlet * args.spacing / args.speed
    nu = args.viscosity * dt / args.spacing**2
    transit = nx / inlet
    frames_per_transit = 16
    stride = max(1, round(transit / frames_per_transit))
    interval = frames_per_transit * args.average_transits
    previous = None
    average = None
    total = np.zeros((nz, ny, nx, 3), dtype=np.float64)
    sum_flux = np.zeros(2, dtype=np.float64)
    rms = None
    peak = 0
    quiet = False
    count = 0
    last_window = 0
    kernel.set_scalar_arg_dtypes(
        [None] * 5 + [np.int32] * 3 + [np.float64] * 3 + [np.int32]
    )
    print(
        f"{gpu.name}: {nx}×{ny}×{nz}, {args.spacing:g} m, {np.count_nonzero(walls):,} cells touching solid links",
        flush=True,
    )
    for step in range(1, round(args.transits * transit) + 1):
        take = step % stride == 0
        ramp = min(1.0, step / (0.25 * transit))
        kernel(
            queue,
            (cells,),
            None,
            src,
            dst,
            links,
            reflection,
            capture,
            nx,
            ny,
            nz,
            inlet * ramp,
            nu,
            0.16,
            take,
        )
        src, dst = dst, src
        if not take:
            continue
        cl.enqueue_copy(queue, field, capture).wait()
        if not np.isfinite(field).all():
            raise RuntimeError(f"Nonfinite solver output at step {step}")
        speed = field[..., :3] * (args.speed / inlet)
        peak = max(
            peak, float(np.sqrt(3) * np.linalg.norm(field[..., :3], axis=-1).max())
        )
        if step < transit:
            continue
        flux = (field[..., 3] * speed[..., 0]).sum(
            axis=(0, 1), dtype=np.float64
        ) * args.spacing**2
        total += speed
        sum_flux += flux[[0, -1]]
        count += 1
        if count < interval:
            continue
        average = total / count
        incoming, outgoing = sum_flux / count
        last_window = step
        if previous is not None:
            rms = float(
                np.sqrt(np.mean(np.sum((average - previous) ** 2, axis=-1)))
                / args.speed
            )
            balance = float(abs(incoming - outgoing) / abs(incoming))
            print(
                f"Step {step}, RMS change/U {rms:.4f}, inlet/outlet mass imbalance {balance:.4f}",
                flush=True,
            )
            quiet = rms < args.change and balance < args.balance
            if quiet:
                break
        previous = average
        total.fill(0)
        sum_flux.fill(0)
        count = 0
    if average is None:
        raise ValueError("Simulation ended before completing an averaging window")
    velocity = average @ axes
    # One native signed 16-bit ENU triplet per cell. Scale varies per recording.
    scale = float(np.abs(velocity).max()) / 32766 or 1.0
    into = np.rint(velocity / scale).astype("<i2")
    directory = args.output
    directory.mkdir(parents=True, exist_ok=True)
    velocity_bytes = into.tobytes()
    # Six Cartesian face bits keep interpolation within the local fluid region.
    # The GPU also blocks twelve diagonal links when solving the actual field.
    faces = ((walls >> 1) & 63).astype("u1").tobytes()
    (directory / "velocity.i16").write_bytes(velocity_bytes)
    (directory / "wall-faces.u8").write_bytes(faces)
    result = dict(
        format="wreck-current-v1",
        geometry=args.geometry.name,
        geometrySha256=hashlib.sha256(args.geometry.read_bytes()).hexdigest(),
        trianglesSha256=hashlib.sha256(
            np.asarray(triangles, dtype="<f8").tobytes()
        ).hexdigest(),
        velocitySha256=hashlib.sha256(velocity_bytes).hexdigest(),
        faceSha256=hashlib.sha256(faces).hexdigest(),
        dimensions=list(map(int, dims)),
        firstCenter=origin.tolist(),
        axes=axes.tolist(),
        spacingM=args.spacing,
        velocityScale=scale,
        incidentSpeedMps=args.speed,
        bearingTrueDeg=args.bearing,
        kinematicViscosityM2s=args.viscosity,
        smagorinsky=0.16,
        latticeInletSpeed=inlet,
        solver="Rumoca Modelica regularized BGK D3Q19",
        gpu=gpu.name,
        timeStepS=dt,
        steps=step,
        startOfAverageS=(last_window - interval * stride) * dt,
        endOfAverageS=last_window * dt,
        fluidTimeS=step * dt,
        rmsChangeOverInflow=rms,
        inletOutletMassImbalance=float(abs(incoming - outgoing) / abs(incoming)),
        fluxM3s=[float(incoming), float(outgoing)],
        peakMach=peak,
        converged=quiet and peak <= 0.3,
    )
    (directory / "field.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result), flush=True)
    if not quiet or peak > 0.3:
        raise SystemExit("Recording did not meet requested convergence/Mach criteria")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "fmu", type=Path, help="Rumoca-generated PropellerFlow FMI source directory"
    )
    p.add_argument(
        "geometry", type=Path, help="Submerged surface mesh in metres, east/north/up"
    )
    p.add_argument("output", type=Path)
    p.add_argument("--spacing", type=float, required=True)
    p.add_argument(
        "--bearing",
        type=float,
        required=True,
        help="Incident flow toward, clockwise from true north",
    )
    p.add_argument(
        "--speed", type=float, required=True, help="Incident velocity in m/s"
    )
    p.add_argument(
        "--floor", type=float, required=True, help="No-slip seabed elevation in m"
    )
    p.add_argument(
        "--surface", type=float, default=0, help="Rigid slip lid elevation in m"
    )
    p.add_argument(
        "--margin",
        type=float,
        default=10,
        help="Upstream/lateral clearance in m, outlet clearance twice this",
    )
    p.add_argument("--viscosity", type=float, default=1.1e-6)
    p.add_argument(
        "--lattice-speed",
        type=float,
        default=0.045,
        help="Inlet speed in lattice units; smaller values reduce lattice Mach number",
    )
    p.add_argument(
        "--transits", type=float, default=8, help="Maximum flow-through times"
    )
    p.add_argument(
        "--average-transits",
        type=int,
        default=1,
        help="Flow-through times per mean-velocity comparison window",
    )
    p.add_argument(
        "--change",
        type=float,
        default=0.025,
        help="RMS mean-velocity change divided by inflow speed",
    )
    p.add_argument(
        "--balance",
        type=float,
        default=0.015,
        help="Fractional inlet/outlet mass imbalance",
    )
    run(p.parse_args())
