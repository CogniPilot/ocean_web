# Sundancer 320 propulsion and reference shaft model

The playable Sea Ray Sundancer 320 uses a 10.01 m hull with a 3.23 m beam and 21° transom deadrise. Its design displacement is 6,890 kg and the simulated tank holds 598 L. The 182 L/h full-throttle rate is estimated from the published 142 mi range at 48 mph with 90% usable fuel. The 47–49 mph wide-open throttle range is the calibration target. [2025 European brochure](https://www.searay.com/content/dam/searay/sundancer-series/sundancer-320-eu/2025-sundancer-320-europe-model-brochure.pdf)

The twin sterndrive model shares a throttle and steering command between both drives. It evaluates the immersed fraction of each propeller disk at its own location. Forward thrust is limited by a reduced-order load curve and the rated combined 448 kW power, with a fixed efficiency factor. At high speed a planing-resistance curve sets the equilibrium speed. Drive geometry and tank location are estimates based on the layout. The model supplies a net disk for each drive's coaxial propellers.

## Standalone shaft and rudder reference

The following fixed-shaft component remains available for standalone tests and other craft.

The 7.6 m, 3,250 kg cruiser uses body axes with forward (x), port (y), and up (z). Signed shaft speed is positive ahead. Positive helm command turns the bow to port under ahead flow. It rotates the rudder stock toward negative yaw because the blade trails its hinge.

## Parameters and evidence

| Quantity | Value | Basis |
| --- | --- | --- |
| Water density | 1,025 kg/m³ | Existing seawater model |
| Propeller diameter and blade count | 0.46 m, three blades | Chosen for the simulated hull and reflected by the mesh |
| Propeller expanded area and pitch ratios | 0.50 and 0.95 | Reference Wageningen B3-50 configuration |
| Shaft centre and inclination | (-3.11, 0, -0.95) m, 0.1974 rad upward toward the bow | Cabin cruiser shaft geometry |
| Rudder stock | (-3.50, 0, -0.89) m | Foil mounted aft of the wheel |
| Rudder chord, span and travel | 0.34 m, 0.43 m, ±0.52 rad | Foil geometry and helm range |
| Ahead and astern shaft speed limits | 1,750 and 1,100 rev/min | Chosen for the existing hull-resistance curve |
| Hull wake fraction and thrust deduction | 0.10 and 0.06 | Assumed installation factors |
| Astern thrust and torque factors | 0.55 and 0.72 | Assumed, pending four-quadrant data |

For the reference propeller, the source coefficients reduce to cubics in $J=V_A/(|n|D)$ for rotation and inflow of the same sign. In increasing order of exponent they are `[0.3853974837, -0.2449743044, -0.1894542159, 0.0641471649]` for thrust and `[0.05401982266, -0.03122365829, -0.01941178288, 0.002751653757]` for torque. The model uses $T=\rho n^2D^4K_T$, $Q=\rho n^2D^5K_Q$, and $P=2\pi nQ$, with direction and immersed disk area accounted for separately. The ideal RPM governor retains the existing 0.85 s response. It supplies the calculated shaft load without an engine torque-speed map. [Oosterveld and van Oossanen, Wageningen B-series regression, Table 5](https://doi.org/10.3233/ISP-1975-2225102) · [ITTC open-water procedure](https://ittc.info/media/11808/75-02-03-021.pdf)

The propeller slipstream follows axial momentum $T=2\rho A(V_A+v_i)v_i$. The code contracts the streamtube, projects it to the rudder plane, and calculates the loads over the washed and unwashed wet spans independently. The rudder uses local sway and yaw inflow and Fujii's finite-aspect lift gradient. High incidence and section friction use bounded closures. The force acts at the foil and contributes roll, pitch, and yaw through its lever arm. [Yasukawa and Yoshimura, MMG standard method, equations 19 and 38–40](https://doi.org/10.1007/s00773-014-0293-y)

The propeller has a swept three-blade mesh with spanwise twist set by pitch,
a turned hub and a locking nut. The rudder hangs on a quarter-chord stock.
The rotating wheel and deflected blade clear the hull plating. Propeller
induction at the rudder mid-chord varies with downstream distance. Conservation
of volume flux sets the corresponding jet radius, and a vertical cut through
the inclined jet sets the washed span. These are axial, uniform-disk
approximations. [Numerical analysis of rudder–propeller interaction](https://www.mdpi.com/2077-1312/8/12/990)

## Running the benchmark

After building the simulator, prepare the standalone FMI component with the same pinned Rumoca and Emscripten used for the browser assets. Set `RUMOCA` to that compiler.

```bash
"$RUMOCA" compile models/CruiserPropulsion.mo -m CruiserPropulsion \
  --source-root .deps/msl --source-root .deps/marine-models --target fmi3 -o build/fmi3/CruiserPropulsion
mkdir -p build/propulsion-browser
python3 scripts/browser-fmi3.py build/fmi3/CruiserPropulsion/CruiserPropulsion \
  build/propulsion-browser
cp viewer/fmi3/instance.mjs build/propulsion-browser/
node scripts/prepare-world-runtime.mjs build/pages/motorboat \
  viewer/fmi3/OceanMotorboat.fmu OceanMotorboat
node scripts/check-cruiser-propulsion.mjs build/pages/motorboat build/propulsion-browser
```

The test reports machine-readable component sweeps and the coupled vessel's ahead, astern, turn, and coast runs. The standalone sweep includes bollard conditions, dry and half-immersed geometry, and crossflow. The coupled run uses calm water and the simulator's default current with a start at ENU (-120, -80) m. These are numerical benchmarks of the model.

| Standalone case | Shaft speed (rev/min) | Hull-relative speed (m/s) | Thrust (kN) | Torque (N·m) | Shaft power (kW) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ahead bollard | 1,750 | 0 | 15.05 | 970.2 | 177.8 |
| Ahead with advance | 1,750 | 6.8 | 9.51 | 654.0 | 119.9 |
| Astern with advance | -1,100 | -2.5 | -2.63 | -227.7 | 26.2 |
| Coasting | 0 | 5.0 | 0 | 0 | 0 |

At ahead bollard speed the model adds 12.38 m/s to the washed portion of the rudder. Full port helm gives a 4.34 kN starboard force at the foil. Starboard helm mirrors that result. The coasting case retains wet-disk drag and rudder authority in the incoming flow.

The coupled portion of the test exercises the Sundancer's twin-drive geometry, warm and cold starts, forward and reverse thrust, coastdown, and port helm. Modelica exports both propeller load vectors, their geometry, individual local water sampling and aggregate immersed disk fraction.
