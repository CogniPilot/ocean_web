# Flooded wreck current

This offline solver computes a mean 3D velocity field for one geometry, current speed and bearing. Supply a self-contained triangle mesh in east, north, up coordinates in metres. Both faces of every hull plate block flow. Flooded spaces communicate through the openings present in that mesh. A closed exterior scan alone cannot describe flow into its interior.

## Generate a field

Use a pinned Rumoca compiler and the project’s Modelica environment. The GPU job requires NumPy, trimesh, PyOpenCL and a double-precision OpenCL GPU. From the repository root, compile the same Modelica operator as the propeller case.

```sh
rumoca compile scripts/benchmarks/onrt-propeller/PropellerFlow.mo \
  -m PropellerFlow --source-root .deps/marine-models --source-root .deps/msl \
  --target fmi3 -o build/wreck-operator

python scripts/benchmarks/wreck-current/solve.py \
  build/wreck-operator/PropellerFlow wreck-enu.stl build/wreck-field \
  --floor -15 --surface 0 --spacing 0.15 --margin 10 \
  --speed 0.30 --bearing 90 --viscosity 1.1e-6 \
  --lattice-speed 0.035 --average-transits 12 --transits 65
```

The parameters above are an example. A bearing of 90° drives water toward true east. The inlet is upstream of the mesh by the chosen margin and the outlet is twice as far downstream. The solver applies a fixed, flat, no-slip bottom, slip side boundaries and a rigid slip surface. Adjust the domain for site depth and check sensitivity to both lateral and downstream clearances before using the field.

Rumoca compiles the D3Q19 regularized BGK collision operator from `Marine.Propulsion.PropellerFlow`. The device streams populations, reflects them along any grid link that intersects a plate, and applies an incoming velocity and outgoing density–velocity characteristic. The Smagorinsky coefficient is 0.16. Link bounce-back places the effective wall at mid-link. Inclined walls and narrow openings therefore need a grid-sensitivity study. See the papers on [regularized lattice Boltzmann collision](https://arxiv.org/abs/physics/0506157) and [velocity and pressure boundary conditions](https://arxiv.org/abs/comp-gas/9611001).

The program averages 16 snapshots per flow-through. After one spin-up transit it compares consecutive averaging windows using the domain RMS change in mean velocity and the difference in integrated inlet/outlet mass flux. Default limits are 2.5% of inlet speed and 1.5% of inlet flux, respectively. Peak lattice Mach must stay at or below 0.3. A failed run exits with an error and marks the recording unconverged. For fluctuating wakes, lengthen the sampling windows. For excessive Mach, lower the lattice inlet speed. At each operational speed and bearing, compare finer meshes at individual entrances, inside flooded compartments and in the wake. A small domain-wide discrepancy can hide local errors.

## Read the result

`field.json` records the geometry hashes, axes, first cell centre, grid spacing, units, acceptance diagnostics and file checksums. Each cell occupies seven bytes on disk. The first six are three signed little-endian velocity components in east, north and up order. The last byte lives in a separate file and stores six Cartesian wall-face flags. `loadWreckCurrent` in `viewer/wreck-current.mjs` checks the selected geometry and both binary payloads. It returns a velocity sampler that excludes disconnected cells across plates and signals when a position leaves the recorded domain.

## Reproduce the flooded-compartment test

```sh
python scripts/benchmarks/wreck-current/check.py build/wreck-operator/PropellerFlow build/wreck-check
node scripts/benchmarks/wreck-current/check-sampler.mjs build/wreck-check/dx-0.25-bearing-90
```

The synthetic test has an open four-metre passage next to a sealed compartment. It uses a deliberately viscous liquid for a repeatable laminar check. At 0.30 m/s eastward inflow the 0.25 m grid gave 0.268 m/s east at the open passage centre and zero speed in the closed compartment. Reversing the flow gave a centre-speed discrepancy of 0.86% of inflow speed. Refining the spacing from 0.16 m to 0.125 m changed the worst of three passage probes by 5.24% of inflow speed. The script checks three grid spacings, both through-flow directions, seal integrity and inlet/outlet balance. These results describe the synthetic duct. They establish no measured currents for the K-18 Bryza.
