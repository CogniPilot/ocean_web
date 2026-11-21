# Wreck survey navigation

## What runs in ocean_web

The submarine tracks 12 preplanned 3D waypoints from a known launch pose. Modelica synthesizes four DVL beams, pressure, gyro and accelerometer measurements, a grayscale navigation camera, and sonar returns at five elevations. The estimator propagates position with DVL and inertial measurements, uses pressure for vertical position, and corrects horizontal position and yaw by registering sonar scans. Camera patches contribute yaw information and help verify revisits. Control uses the resulting measurements for the waypoint error, velocity, heading and attitude feedback. Simulated true state generates the sensor readings and provides a reference for evaluation.

In the integrated survey test, the submarine completed all 12 stations in 108.8 simulated seconds. The position estimate had 0.46 m RMS error and recorded 36 keyframes with one loop closure. This is localization on a known route under simulated sensing conditions. The renderer draws Gaussian splats at the measured sonar returns and redraws their world positions when a loop closure updates the keyframes.

## Field-tested methods

| Method | Sensors and architecture | Relevance to the wreck |
| --- | --- | --- |
| [SVIn+ (2026)](https://arxiv.org/html/2610.36454v1) | Visual and IMU factors, pressure and DVL in a sliding-window optimizer. A 3D sonar registration front end supplies relative 6-DoF pose factors. | The closest comparison to this sensor suite. On the BajanQueen wreck sequence the reported marker-revisit error was 0.21 m versus 0.53 m for the visual-inertial baseline. Global loop closure is future work in this system. |
| [AQUA-SLAM (IEEE T-RO, 2025)](https://ieeexplore.ieee.org/document/10938346) | Stereo, IMU and DVL in a joint graph. Online calibration includes sensor extrinsics and DVL beam misalignment. | A reference for calibrated raw velocity fusion, validated in a tank and offshore. |
| [SVIn2 (IROS)](https://doi.org/10.1109/IROS40897.2019.8967703) | Stereo, inertial, profiling sonar and pressure in a keyframe optimizer, with visual loop closure and relocalization. | A reference for initialization, keyframe selection and graph correction after revisits. |
| [Compact 3D sonar mapping (2025)](https://arxiv.org/html/2510.18991v1) | Sonar registration seeded by visual-inertial motion with pose-graph loop closures. | On one 700 m cave route, fusion gave 6.76 m start-to-end revisit error versus 17.02 m for the visual pose graph and 21.51 m for the sonar pose graph. Thin or smooth surfaces and specular acoustic returns still cause gaps and outliers. |
| [FAR-AVIO (2025 preprint)](https://arxiv.org/html/2512.20355v2) | Camera, DVL and IMU in a filter with landmark marginalization and adaptive measurement weights. | An embedded-odometry option. The authors measured about 35 updates/s on Jetson Orin NX. A separate map and loop-closure layer would provide long-range correction. |

These metrics describe distinct test routes and reference measurements. The simulation’s RMS trajectory error and a field experiment’s marker-revisit error measure different quantities.

## Applying the evidence

For this wreck, a practical architecture is high-rate IMU propagation and a bounded local smoothing window. The window can fuse individual valid DVL beam velocities, pressure depth with a bias term, and relative pose constraints from sonar scan-to-submap registration. Visual reprojection factors can enter when feature coverage and geometric consistency support them. Sonar factors also need consistency tests because repeated bulkheads and specular returns can produce plausible false matches. Revisits should pass geometric verification before correcting the global pose graph. [SVIn+](https://arxiv.org/html/2610.36454v1) · [AQUA-SLAM](https://ieeexplore.ieee.org/document/10938346) · [Compact 3D sonar mapping](https://arxiv.org/html/2510.18991v1)

The current simulator returns a range along each known elevation ray. A single real 2D imaging sonar measures range and azimuth while leaving elevation ambiguous. To preserve the simulator’s 3D geometry assumptions on hardware, use a 3D sonar or resolve elevation with overlapping sonar views. A clearance map for control should represent occupied, free and unknown space, with confidence in each contact. A display splat encodes a return and its spread. It does not establish that a passage is clear. [Opti-acoustic volumetric mapping (ICRA 2026)](https://arxiv.org/html/2603.14457v1)

NAS-GS and Z-Splat show how a denser scene model can be optimized from overlapping sonar images or from camera–sonar data. They use an image-formation model and multiple viewpoints. The browser’s sparse Gaussian overlay visualizes existing measurements at keyframes. [NAS-GS](https://arxiv.org/abs/2601.06285) · [Z-Splat](https://arxiv.org/abs/2404.04687)

Field readiness requires calibrated geometry and clocks, a repeatable sensor-log interface, realistic acoustic failure modes, and tests of degraded conditions. A useful progression starts with partial and lost DVL bottom lock, missing or biased visual measurements, pressure drift, and sonar dropout and multipath. Compare tracking error, loop-closure precision, clearance, completion and compute time with each sensor disabled in turn. Replay synchronized field recordings before using the estimator in a controlled-water vehicle trial.
