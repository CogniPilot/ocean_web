# Harbor mean current

The default field uses an eastward inlet of 0.20 m/s and a northward inlet of 0.04 m/s. The native FMI 3 co-simulation FMU solves the static harbor offline. Browsers load one immutable, checksum-verified velocity field. Selecting calm water requires only an updated descriptor.

## Build and publish

From the repository root, use Python 3.11+, Node, a C99 compiler, OpenModelica with its simulation build tools, and a modelica_models checkout containing the Meshing package (tested at d9ca219232aa8147b2da085337c8b8c0cc05e780). The default paths for MSL and FMI C headers use the project's .deps layout.

```sh
python3 scripts/harbor-flow/mesh.py --modelica-models ../modelica_models
python3 scripts/harbor-flow/build.py build/harbor-flow/HarborCurrentSolver.fmu
python3 scripts/harbor-flow/publish.py --east .20 --north .04
```

Use `--output /path/to/served/assets/harbor-current` on the publisher to deploy directly to a server. The FMU is native Linux for the architecture of the build machine. The mesh and published field are platform-independent. To select a different condition or restore calm water, run one of these commands. A cached input combination skips the solve.

```sh
python3 scripts/harbor-flow/publish.py --speed .3 --bearing 80
python3 scripts/harbor-flow/publish.py --east 0 --north 0
```

For a solver run without publication, use the native FMI runner. One iteration advances one unit of the FMU's pseudo-time clock. The runner writes diagnostics and publishes velocity.f32 only on convergence.

```sh
python3 scripts/harbor-flow/run.py build/harbor-flow/HarborCurrentSolver.fmu build/harbor-flow/grid.json .2 .04 /tmp/harbor-solution --verbose
```

## Geometry and numerics

HarborGrid.mo calls Meshing.loftHexMesh and Meshing.stretchFarField to generate graded hexahedral axis strips. Their tensor product covers east −190 to 260 m, north −245 to 185 m, and up −50 to 0 m. The 74 × 68 × 26 grid refines toward both wrecks and the shallow water column. The smallest spacings are approximately 1.24 m east, 1.26 m north and 0.92 m vertically. grid.mjs samples the same seabed and island height used by the simulation. Two-sided segment–triangle tests close fluid connections across the collision meshes of Yatush, Satil and the static abyss cave, including thin decks whose two adjacent cell centres both contain water. This grid contains 71,788 wet cells. Land and terrain-buried cells store zero velocity.

The solver advances cell momentum using conservative first-order upwind transport, central diffusion and a constant effective kinematic viscosity of 0.000001 + 0.28 × inlet speed in SI units. Face-normal fluxes are corrected by a variable-spacing pressure projection with modified incomplete Cholesky preconditioned conjugate gradients. Wet cells on opposite sides of a blocked face exchange zero normal flux. Lateral inflow is prescribed, outlet pressure is fixed, the surface is a free-slip rigid lid, and submerged walls exert a quadratic tangential stress with coefficient 0.005. These are grid-scale closure choices. Viscosity, roughness and near-wake velocities have not been calibrated against site measurements.

The steady criterion requires RMS cell-vector change below 0.0001 of inlet speed per iteration and RMS velocity divergence below 0.000001 per second. The published array holds three little-endian Float32 ENU velocities per cell, indexed east first, then north and up. The browser interpolates reachable fluid cells without crossing a blocked face and returns the incident flow outside the map. Under-resolved cave details, coral, moving animals, moving vessels, propeller wash and wave orbital velocities are outside this static mean-field solve.
