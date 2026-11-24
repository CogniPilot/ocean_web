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

## ONR Tumblehome free-running tests

IIHR's ONRT model was fitted with twin propellers, twin rudders, and bilge keels.
The Tokyo 2015 archives include measured course keeping at five wave headings:
000° head, 045° oblique head, 090° beam, 135° quartering, and 180° following.
The tests use a 3.147 m waterline, 1.11 m/s approach speed, 538 rpm, and regular
waves with wavelength equal to the waterline length and height 2% of wavelength.
The workshop's `*_EFD.dat` files are measurements labelled `EFD(IIHR)`. Each has
15 columns and contains nondimensional time and track, six-axis motions and
velocities, rudder angle in degrees and measured wave elevation. The matching
`*_CFD.dat` files contain workshop example predictions.

- [Model particulars and hull, rudder and propeller CAD](https://t2015.nmri.go.jp/onrt_gc.html)
- [IIHR experimental procedure and release conditions](https://t2015.nmri.go.jp/Instructions_ONRT/IIHR_ONRT_DATA_06-12-2015.pdf)
- [Head waves, verified 1,322 measured rows](https://t2015.nmri.go.jp/Instructions_ONRT/Case_3.12/Case3.12-000.zip)
- [Oblique head, beam, quartering and following wave archives](https://t2015.nmri.go.jp/Instructions_ONRT/Case_3.13/Case_3-13.html)
- [IIHR port and starboard propeller open-water curves and geometry](https://simman2020.kr/download/propeller_IIHR2%28ONRT%29.zip)
- [Iowa turning-circle and zigzag results from SIMMAN Case 5.2](https://simman2020.kr/contents/test_case_5.2.php)
- [SIMMAN data request for the full maneuver time histories](https://simman2020.kr/contents/FTP.php)

Replay of these runs requires a model-scale ONRT plant with its mass and
inertia, twin shaft and rudder geometry, propeller curves, and the documented
rudder controller. The current inboard cruiser has a single shaft and different
mass, buoyancy, and planing behavior. When the ONRT plant is available, compare
trajectory and rudder histories, and report heave, roll, pitch and yaw error by
wave heading. Reserve separate wave headings and maneuver runs for validation
after any coefficient fitting.

## Measurements for additional comparisons

| Output | IIHR reference | Required model capability |
| --- | --- | --- |
| Calm-water total drag and running attitude | [5512 steady tow](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-steady) | Viscous and pressure resistance with free heave and pitch |
| Drift forces, yaw moment and wake velocities | [5512 static drift](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-static-drift) | Matched hull and drift angle for integral loads, plus a volume velocity field for the PIV planes |
| Heave and pitch response and phase | [5512 regular head waves](https://stern.lab.uiowa.edu/efd-data/efd-data-towing-tank/5512-pitch-and-heave) | Matched hull mass properties and incident wave conditions |
| Propeller thrust and torque | [ONRT open water](https://simman2020.kr/download/propeller_IIHR2%28ONRT%29.zip) | An independent prediction using ONRT propeller geometry and measured advance ratios |
| Rudder response and free-running tracks | [ONRT course keeping case setup](https://t2015.nmri.go.jp/Instructions_ONRT/instruction_ONRT.html) | Full ONRT configuration, actuator rate limits, release condition, and matched wave phase |
