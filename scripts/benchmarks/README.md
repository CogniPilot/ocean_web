# University of Iowa ship hydrodynamics benchmarks

The IIHR towing tank and wave basin publish two complementary benchmarks. The
files below are available from the workshop archives. Download them into the
ignored build directory for local analysis. Their redistribution terms have
not been verified.

## DTMB 5512 calm-water tow

IIHR measured total resistance, sinkage and trim over Froude numbers 0.05–0.45.
At Froude 0.28 and 0.41, Iowa measured hull wave profiles at the running attitude.
The 0.28 case also has free-surface elevations and particle-image-velocimetry
measurements of the nominal wake. The 5512 test model was a 3.048 m bare hull.

- [IIHR experiment and references](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-steady)
- [Gothenburg workshop database paper, Figure 4 and Table 5](https://www.nmri.go.jp/archives/institutes/fluid_performance_evaluation/cfd_rd/cfdws05/gothenburg2000/PDF/database-paper.pdf)
- [Longo and Stern experimental uncertainties](https://doi.org/10.5957/jsr.2005.49.1.55)

Run from the repository root with Python 3 and Node.js.

```sh
data=build/validation/iihr
nmri=https://www.nmri.go.jp/archives/institutes/fluid_performance_evaluation/cfd_rd/cfdws05/gothenburg2000
wavebem=https://raw.githubusercontent.com/mathLab/WaveBEM/b44b0fb11e47ec3f954d494c061c5c278a912696
mkdir -p "$data"
curl -fL "$nmri/data/5415/5415_static.net" -o "$data/5415_static.net"
curl -fL "$wavebem/experimental-results/dtmb-5415/goteborgExpFr028_5512.csv" -o "$data/profile-Fr028.dat"
python3 scripts/benchmarks/prepare-iihr-5512.py "$data"
node scripts/benchmarks/iihr-5512-wake.mjs "$data" > "$data/wake-results.jsonl"
```

The geometry script uses the workshop 5.72 m DTMB 5415 half-hull grid, scaled
to the Iowa 5512 model length. It integrates wetted strip volumes at the Figure
4c running attitude, using 9.3 mm forward and 2.4 mm aft sinkage. It uses the
same sinkages to bring the hull profile to the undisturbed water datum. The
profile consists of 39 points distributed along the hull, from a numeric copy
used by WaveBEM. The correction follows the approach of CNR Figure 13. The
published Gothenburg uncertainty of ±1 mm applies to the original hull profile.
The copy, datum conversion, and reconstruction of the probe locations introduce
additional uncertainty. [CNR report and trace provenance](https://www.inm.cnr.it/trim/wp-content/uploads/2022/11/TRIM-RT-SP.4-OR.9-D.1.pdf)

The test drives the shipped Modelica `WakeSpectrum` model at 1.531 m/s and 3 m
water depth. It averages on-hull elevations over the last 10 seconds of a
45-second tow and writes the measurements and predictions to
`profile-comparison.csv`. It exercises the periodic spectral displacement
model in isolation. The Iowa tank walls and the browser's local bow-wave patch
are outside this comparison. The tank's measured total resistance includes
viscous and pressure effects, so the spectral wave-resistance values are
reported as diagnostics.

| Period | Time step | Profile RMSE | Predicted peak | Predicted wave resistance |
| ---: | ---: | ---: | ---: | ---: |
| 64 m | 0.100 s | 17.3 mm | 4.4 mm | 2.28 N |
| 20 m | 0.050 s | 39.8 mm | 23.4 mm | 30.44 N |
| 12 m | 0.050 s | 43.8 mm | 32.2 mm | 31.86 N |
| 8 m | 0.050 s | 50.4 mm | 56.5 mm | 23.70 N |
| 12 m | 0.025 s | 42.0 mm | 42.5 mm | 30.17 N |

The measured peak is 53.0 mm. The current spectral solver resolves only a small fraction of
the bow crest at the default 64 m period. The 1 m grid cells cannot resolve
the approximately 1.5 m centerline transverse wavelength given by linear
gravity-wave dispersion at this speed. Smaller periods retain the 64×64 grid,
simultaneously changing its spatial resolution and the distance to the
periodic boundary. These runs show sensitivity to that choice. An independent
grid and domain convergence study and a comparison against measured off-hull
wave cuts are still required.

The combined-field test adds the same local Modelica surface used for the
cruiser. It uses the 5512 hull sections, the 8 m near-field tile and the same
39 gauge positions. To run it, build the source adapter with the browser
toolchain and pass its directory as the second benchmark argument.

```sh
"$RUMOCA" compile scripts/benchmarks/Iihr5512Bow.mo -m Iihr5512Bow --target fmi3 \
  --source-root viewer/board/BowWavePatch.mo --source-root viewer/board/WakeSpectrum.mo \
  --source-root .deps/msl -o build/iihr-bow-compile
python3 scripts/browser-fmi3.py build/iihr-bow-compile/Iihr5512Bow build/iihr-bow
cp viewer/fmi3/instance.mjs build/iihr-bow/
node scripts/benchmarks/iihr-5512-wake.mjs build/validation/iihr build/iihr-bow
```

At the default 64 m spectral period, adding the local field brings the
predicted peak to 17.9 mm and profile RMSE to 14.1 mm. The measured peak is
53.0 mm. At an 8 m spectral period the combined peak reaches 53.7 mm while
profile RMSE rises to 47.2 mm. Choosing the period by peak height alone would
give a misleading impression of accuracy. The CSV includes each local
contribution and the combined elevation in metres.

## ONR Tumblehome free-running tests

IIHR's ONRT model was fitted with twin propellers, twin rudders, and bilge keels.
The Tokyo 2015 archives include measured course keeping at five wave headings:
000° head, 045° oblique head, 090° beam, 135° quartering, and 180° following.
The tests use a 3.147 m waterline, 1.11 m/s approach speed, 538 rpm, and regular
waves with wavelength equal to the waterline length and height 2% of wavelength.
The workshop's `*_EFD.dat` files are measurements labelled `EFD(IIHR)`. Each has
15 columns and contains nondimensional time and track, six-axis motions and
velocities, rudder angle in degrees and measured wave elevation. The companion `Case3.12-000_CFD.dat` header reads `CFD(Dummy)`. It is a submission template and is excluded from validation.

- [Model particulars and hull, rudder and propeller CAD](https://t2015.nmri.go.jp/onrt_gc.html)
- [IIHR experimental procedure and release conditions](https://t2015.nmri.go.jp/Instructions_ONRT/IIHR_ONRT_DATA_06-12-2015.pdf)
- [Head waves, verified 1,322 measured rows](https://t2015.nmri.go.jp/Instructions_ONRT/Case_3.12/Case3.12-000.zip)
- [Oblique head, beam, quartering and following wave archives](https://t2015.nmri.go.jp/Instructions_ONRT/Case_3.13/Case_3-13.html)
- [IIHR port and starboard propeller open-water curves and geometry](https://simman2020.kr/download/propeller_IIHR2%28ONRT%29.zip)
- [Iowa turning-circle and zigzag results from SIMMAN Case 5.2](https://simman2020.kr/contents/test_case_5.2.php)
- [SIMMAN data request for the full maneuver time histories](https://simman2020.kr/contents/FTP.php)

### Reproduce the comparison

Select **ONR Tumblehome** in the model picker or open `onrt.html`. The same
vessel and wave FMUs run headlessly:

```sh
node scripts/benchmarks/onrt-basin.mjs build/validation/onrt path/to/Case3.12-000_EFD.dat
```

IIHR's procedure, tables 2 and 3, identifies the head-sea condition as three
physical runs (HWT469 on July 8, HWT524 and HWT525 on July 15, 2013).
The public Tecplot zone is labelled EFD(IIHR) without a serial number. Treat
the distributed time history as one reference, without assuming it is three
independent samples or their mean. At 18 °C, the carriage towed the model
at 1.11 m/s and released it at 37.5 s with a crest at the bow gauge,
approximately 0.10 m to starboard of the forward perpendicular. The reference
includes the approach and release in IIHR's 40 × 20 × 3 m wave basin. The
single gauge gives a time series at one location. It cannot establish a
spatial map of the ship-generated wake. [Facility](https://iihr.uiowa.edu/facilities-and-resources/wave-basin-and-towing-tank)

The steady-tow display regression runs the shipped 40 ms wave sampler and reconstructs
the surface in coordinates that translate with the hull. Run
`node scripts/benchmarks/check-onrt-wake.mjs` to check for repeated frames
and measure changes at hull-following probes. From 26 to 32 seconds, the display
varied by 0.00482 mm RMS per snapshot over 350,448 probe comparisons. This
measures presentation stability. Wave-cut CSVs sample the native grid using
bilinear interpolation.

The head-sea replay initializes from the release row and applies the measured
rudder history. On 572 post-release samples over 28.55 s, track RMS error was
0.827 m, surge RMS error 0.083 m/s and heave RMS error 0.024 m. The model
uses lumped added mass and damping, six hydrostatic sections and regular-wave
forcing. Free-surface radiation is one-way coupled. Input file SHA-256:
`5366e01617f829c28958041d6c9ceeb29d5270d5008b7336a2f8ed54d4d9392b`.

The 2025 workshop also publishes the head-seas shaft-speed history.
Case 1.1-2 has the same 1,322 samples and release clock as Case 3.12,
with slightly different rounding of time. The replay integrates the two
shaft rates independently. Both columns contain identical rates, ranging
from 526 to 553 rpm after release. The initial blade azimuth is arbitrary.
The same file flags its thrust and torque columns as dummy. The measured
bow wave gauge ranges from −32.4 to +39.1 mm over the replay. The scene
reconstructs the surrounding incident plane wave and the corresponding
synchronous plunger stroke using linear theory.
[Wageningen 2025 sample archive](https://w2025.nl/download/onrt-sample-files/)

The calm-water speed at 538 rpm and the steady 35° port turning diameter
were calibration targets. Other SIMMAN FRMT measurements remained outside
the fit:

| Quantity | Model | Experiment |
| --- | ---: | ---: |
| Advance at 90° (ship lengths) | 2.71 | 2.35 |
| Transfer at 90° (ship lengths) | 1.35 | 1.32 |
| Tactical diameter (ship lengths) | 3.30 | 3.19 |
| Steady speed / approach speed | 0.623 | 0.63 |
| First / second 20° zigzag overshoot (degrees) | 4.04 / 4.02 | 5.9 / 5.4 |

For spatial wake validation, the Istanbul Technical University experiment
reports off-hull cuts at 0.49 and 1.14 m. The basin can export predicted
cuts at those offsets. A matched comparison requires the published elevations,
test speed, hull configuration, coordinate origin and an assessment of grid
and domain errors. [ITU wave cuts and resistance experiment](https://research.itu.edu.tr/en/publications/a-comprehensive-experimental-investigation-of-total-drag-and-wave/)

## Measurements for additional comparisons

| Output | IIHR reference | Required model capability |
| --- | --- | --- |
| Calm-water total drag and running attitude | [5512 steady tow](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-steady) | Viscous and pressure resistance with free heave and pitch |
| Drift forces, yaw moment and wake velocities | [5512 static drift](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-static-drift) | Matched hull and drift angle for integral loads, plus a volume velocity field for the PIV planes |
| Heave and pitch response and phase | [5512 regular head waves](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-pitch-and-heave) | Matched hull mass properties and incident wave conditions |
| Propeller thrust and torque | [ONRT open water](https://simman2020.kr/download/propeller_IIHR2%28ONRT%29.zip) | An independent prediction using ONRT propeller geometry and measured advance ratios |
| Rudder response and free-running tracks | [ONRT course keeping case setup](https://t2015.nmri.go.jp/Instructions_ONRT/instruction_ONRT.html) | Full ONRT configuration, actuator rate limits, release condition, and matched wave phase |

### Isolated port propeller

The propeller viewer compares a steady rotating-frame OpenFOAM v2412 calculation with the transient Rumoca blade-normal calculation. The benchmark also records the volume no-slip sensitivity runs. Both use the dimensional port propeller from the corrected Wageningen 2025 archive, aligned to the shaft through the two hub-end centres. The shaft coordinate points downstream. Inflow is +0.76468 m/s along that axis and the angular velocity is −56.33923 rad/s. A point at the top of the port blade moves inboard. Both runs use the blade and its integral hub. The separate hub cap, shaft, hull and rudder are excluded. The nominal diameter for nondimensionalization is 0.1066 m and the tessellated tip diameter is 0.1070 m. The IIHR port comparison below matches advance ratio; 538 rpm is the imposed *simulation* speed. [Corrected workshop geometry](https://w2025.nl/news/update-of-onrt-shaft-geometry/) · [IIHR port open-water measurements](https://simman2020.kr/download/propeller_IIHR2%28ONRT%29.zip)

| Case at J = 0.8 | Cells per diameter for uniform lattices | Thrust coefficient Kₜ | Torque coefficient Kq |
|---|---:|---:|---:|
| IIHR open water | | 0.35075 | 0.09091 |
| OpenFOAM, 84,266 cells | | 0.41585 | 0.10812 |
| Rumoca, volume no-slip, independently voxelized CAD | 12 | −0.54905 | 0.40526 |
| Same model | 16 | −0.36656 | 0.34457 |
| Rumoca, volume no-slip, voxelized OpenFOAM wall | 12 | −0.48171 | 0.40508 |
| Same model | 16 | −0.26263 | 0.33471 |
| Rumoca, blade-normal constraint, voxelized OpenFOAM wall | 12 | 0.29284 | 0.12703 |
| Same model | 16 | 0.32629 | 0.12263 |
| Same model | 20 | 0.31115 | 0.13012 |
| OpenFOAM, increased surface refinement, 128,048 cells | | 0.40705 | 0.10567 |

At zero phase the two 16-cell masks contain 27.36 and 22.74 cm³ of solid. Their fractional intersection divided by union across phases is 0.612. Reusing the OpenFOAM wall isolates this effect. The original Modelica force drives all three velocity components of a partially occupied cell toward the moving wall velocity. Its axial wall target is zero, so it brakes axial inflow in mixed cells. A sensitivity run projects the velocity difference onto the local CAD wall normal in those cells and retains the full constraint in filled cells. This single change reverses the erroneous thrust sign at both resolutions. At 16 cells per diameter the resulting torque exceeds IIHR by 35%. At 20 cells per diameter it exceeds IIHR by 43%. The three-grid series is nonmonotonic in thrust and torque. These lattices do not resolve the viscous boundary layer.

At a second advance ratio, J = 1.0, the 16-cell blade-normal model with the same wall and settings gave Kₜ = 0.22584 and Kq = 0.10363. The corresponding IIHR values were 0.26381 and 0.07336. OpenFOAM on the 84,266-cell mesh gave 0.32995 and 0.08963. The lattice was closer for thrust at both operating points. OpenFOAM was closer for torque at both. The IIHR file supplies no uncertainty column for these coefficients. To establish parity, specify acceptable differences in errors for each quantity before examining the remaining advance ratios, quantify discretization and averaging uncertainty for each solver, and obtain uncertainty for the experimental loads. ITTC describes the open-water and self-propulsion procedures. An interpolated moving-wall boundary offers a published treatment of curved surfaces for a further lattice test. SVA's independent VP1304 benchmark supplies measured downstream velocities as well as open-water loads. [ITTC self-propulsion CFD](https://ittc.info/media/11964/75-03-03-01.pdf) · [ITTC open-water uncertainty example](https://ittc.info/media/1840/75-02-03-022.pdf) · [Bouzidi, Firdaouss & Lallemand (2001)](https://doi.org/10.1063/1.1399290) · [Potsdam Propeller Test Case](https://www.sva-potsdam.de/pptc-smp11-workshop/)

The third operating point increases inlet speed to 1.147 m/s at J = 1.2.
The input STL, OpenFOAM mesh points and faces have identical file hashes at
all three speeds. Every lattice case uses the same 16-cell/D mask and normal
tensors. The final-revolution Kₜ and Kq at J = 1.2 are 0.11310 and 0.08211;
OpenFOAM gives 0.21879 and 0.06547. The measured values are 0.17247 and
0.05455. Here OpenFOAM is closer on both loads. Lattice torque changes by
0.31% between the last two revolution means, compared with a 50.51%
overprediction relative to IIHR. This window comparison measures remaining
drift and does not quantify discretization uncertainty.

| Advance ratio J | Measured open-water efficiency | OpenFOAM | Rumoca, blade-normal |
|---:|---:|---:|---:|
| 0.8 | 0.491 | 0.490 | 0.339 |
| 1.0 | 0.572 | 0.586 | 0.347 |
| 1.2 | 0.604 | 0.638 | 0.263 |

Open-water efficiency is useful thrust power divided by shaft power,
η = J Kₜ/(2π Kq). At J = 0.8 the OpenFOAM thrust and torque errors largely
cancel in this ratio. At J = 1.2 the lattice produces too little axial thrust
while requiring too much shaft torque. One diameter downstream, the lattice
disk-average azimuthal velocity is −0.262 m/s and OpenFOAM gives −0.139 m/s.
This identifies excessive rotation relative to the reference solution as a
specific target for a blade boundary-condition test. Independent velocity
measurements would be needed to validate either wake field experimentally.

At J = 1.2 the innermost 20% of the propeller radius contributed −0.0659 to
Rumoca Kₜ and −0.0210 to OpenFOAM Kₜ. This accounts for about 43% of the
net thrust difference between solvers. The outermost radial bin (r/R ≥ 0.8)
accounts for about 67% of the excess lattice torque, contributing Kq = 0.0327
versus 0.0216. The comparison sums Modelica momentum exchange over the final
revolution and integrates OpenFOAM pressure and wall shear on the blade and
hub at iteration 302. Each set of bins sums to its solver's reported axial
load. Force location within these coarse cells is only accurate to grid scale.
Generate `wallShearStress` in the running MRF solver so it uses the imposed
wall velocity. Pass `--annuli PATH_TO_LATTICE_RUN` to `audit-setup.py` to
repeat the radial comparison.

A signed face-velocity audit of the baseline OpenFOAM run recovered −56.33923 rad/s on 1,233 wall faces. Integrating the original pressure field over the patch reproduced the axial pressure force (−4.32444 N) and moment (+0.118796 N·m) in a continuation at iteration 352. The Rumoca audit measures the physical orientation of the rotating mask from its fourth angular harmonic. The collision-kernel test independently computes the stress tensor and momentum exchange in NumPy and compares each output with the compiled FMI function. These checks cover the local operator and shaft conventions.

The lattice loads are averaged over the last complete revolution of 3.5 actual turns including startup. OpenFOAM uses the last 20 iterations of 300 steady SIMPLE iterations with k–ω SST, local mesh refinement and no prism layers. One diameter behind the rotor, disk-mean axial velocity is 1.114 m/s for OpenFOAM and 1.074 m/s for the finer blade-normal run. Pointwise axial RMS difference is 0.234 m/s and mean swirl is −0.254 and −0.387 m/s respectively. Those probes compare one transient field to a steady rotating-frame result at aligned blade phase. The disk average can conceal substantial local errors.

Run the benchmark from the repository root with Python, NumPy, Gmsh, VTK, Docker, an OpenMP C compiler and the Rumoca build toolchain. Set `RUMOCA` to the compiler executable if using a separate checkout. The generated Modelica kernel computes the fluid collision and blade forces. The native driver streams populations between cells and exports the volume. The browser displays the resulting fields.

```sh
tools=scripts/benchmarks/onrt-propeller
case_dir=$(realpath -m build/onrt-open-water)
lattice_dir=$(realpath -m build/onrt-lattice)
python3 "$tools/prepare.py" /path/to/w2025-geometry.zip "$case_dir"
bash "$tools/run.sh" "$case_dir"
touch "$case_dir/run.foam"
bash "$tools/build-lattice.sh" "$lattice_dir"
python3 "$tools/check-kernel.py" "$lattice_dir"
mkdir -p "$case_dir"/{cad,volume,normal}
python3 "$tools/rotor-mask.py" "$case_dir/constant/triSurface/propeller.stl" "$case_dir/cad/rotor.mask" --resolution 16
python3 "$tools/rotor-mask.py" "$case_dir/run.foam" "$case_dir/normal/rotor.mask" --normal-tensors "$case_dir/normal/tensors.bin" --resolution 16
cp "$case_dir/normal/rotor.mask" "$case_dir/volume/rotor.mask"
(cd "$case_dir/volume" && OMP_NUM_THREADS=8 "$lattice_dir/lattice" rotor.mask .8 538 4)
(cd "$case_dir/normal" && OMP_NUM_THREADS=8 "$lattice_dir/lattice" rotor.mask .8 538 4 tensors.bin)
python3 "$tools/audit-setup.py" "$case_dir" "$case_dir/cad/rotor.mask" "$case_dir/volume/rotor.mask" --rotation-run "$case_dir/normal"
python3 "$tools/check-wake.py" "$case_dir" "$case_dir/normal"
python3 "$tools/compare-loads.py" /path/to/Open_Water_EFD.dat "$case_dir" "$case_dir/normal"
python3 "$tools/export.py" "$case_dir" build/propeller-view
python3 "$tools/export.py" "$case_dir" build/rumoca-view --lattice "$case_dir/normal"
```

For the drivable vessel, the independent ITU-AN free-running comparison in `onrt-basin.mjs` prescribes each measured shaft speed. At Froude numbers 0.20 and 0.30, the resulting speed errors were +0.36% and +4.73%. Mean thrust coefficient errors were −5.14% and −1.37%; torque coefficient errors were −3.21% and −4.51%. Both torque errors exceeded the corresponding experimental uncertainty reported in Table 6. The lumped vessel predicts nearly constant advance ratio at both operating points. It uses an open-water curve, fixed wake fraction and predominantly quadratic drag. These integrated vessel results are a separate experiment from the isolated rotor calculation. [Delen and Bal, Ocean Engineering (2024)](https://doi.org/10.1016/j.oceaneng.2024.118230)
