# ocean_web

Sail a Pilothouse-inspired keelboat or a full-size Hobie 16, pilot an RDD2 drone, and explore a listed shipwreck with a survey submarine. The browser steps precompiled Rumoca FMI 3 models and draws their outputs with Three.js. [Open the simulator](https://cognipilot.github.io/ocean_web/)

[Request tracker](TODO.md)

## Live build status

Select **Control → RDD2 drone** to fly, or open `?control=drone`. W/S and A/D move horizontally, Q/E yaw, and R/F climb or descend. Releasing the keys holds position. Returning control to the boat sends the drone back to an altitude of 5 m over the latest estimated submarine position. The flight FMU uses CogniPilot’s RDD2 plant and rotor geometry with a local position controller, ideal 10 Hz GNSS, and gyroscope integration. Linear and quadratic body-axis drag use airspeed relative to the local simulated wind. The horizontal gust field is sampled at the aircraft’s location. Drag areas and low-speed damping use the RDD2 template defaults. [CogniPilot RDD2 plant](https://github.com/CogniPilot/modelica_models/blob/main/Vehicles/Rdd2/Plant.mo)

The live page runs the Pilothouse-inspired sloop and full-size Hobie 16 as Rumoca FMI 3 WebAssembly modules. The race committee runs rolling five-minute UTC starts. Cross westward between the committee launch and orange pin, enter the two mark zones in order, then cross the finish westward. These are proximity checks at the marks. Enable **Wind & signals** for apparent-wind audio and a synthesized start signal. **Multiplayer** joins the public regatta, or use `?room=NAME` for a separate room. Participating browsers discover one another via public Nostr relays and exchange boat states over WebRTC. Peer hull contact uses compliant contact sections and each browser's most recent peer snapshot. Delay affects contact timing. Rendering peers uses a separate camera layer. Multiplayer discovery requires reachable external relays.

The sailing camera orbits through the surface. **Waterline** straddles it and **Under hull** shows the immersed foils. Six immersed sections per hull excite a 64 × 64 Fourier grid covering 64 m in each direction. Each strip contributes its displaced volume at its own subcell position. Finite depth sets the gravity-wave dispersion, and the inverse FFT combines the radiated wake with a small wind sea. The boat samples incident wind waves for immersion. It receives wave resistance and yaw torque integrated over the same displacement spectrum. The domain moves with the mean current and repeats periodically. Short waves below 2 m, spray and breaking waves are unresolved. The separate HullWake model retains the earlier 14.4 m finite-difference comparison case.

Foil forces use local angular velocity, wave orbital motion, wet span, aspect ratio and induced drag. Hull viscous resistance uses the immersed skin and the ITTC-1957 correlation above the transition Reynolds number. The laminar-to-turbulent transition, form factor and foil coefficients are assumptions. Speed, leeway, turning radius and wave resistance still require validation against measured data for each hull. [ITTC resistance procedure](https://www.ittc.info/media/1575/75-02-02-01.pdf)

Run `scripts/package-pages.sh` to assemble the static release in `build/pages`. The GitHub Pages workflow uploads these precompiled files. The browser needs no local compiler or simulation service.

## Run

```sh
./serve.sh
```

Open **http://127.0.0.1:8074**. The launcher uses Python 3, with a Nix fallback. The prebuilt simulator requires a WebGL2 browser with WebAssembly and gzip DecompressionStream support. The contents of `viewer/` also work on a static HTTP host.

Select **Submarine** for the underwater survey. Switch the helm to manual for W/S surge, A/D sway, Q/E yaw and R/F rise or dive. The onboard camera overlay shows detected features. A 5 Hz navigation FMU receives 1,017 geometric ranges from a GPU pass over the listed wreck and seabed. The plant and navigation exchange samples in a dedicated worker. The sailing sea runs in a second worker.

## Ocean and sub

The combined build targets Rumoca FMI 3 co-simulation. Body coordinates are forward, port and up. World coordinates are east, north and up. Both the wreck geometry and the trajectory use metres.

* `Wreck/SpectralSea.mo` constructs a directional JONSWAP-shaped wind sea on a 64 m periodic domain, with finite-depth dispersion, seeded random amplitudes and phases, a crossing swell, and fetch-dependent significant wave height. A separable 32 × 32 inverse radix-two FFT reconstructs the surface every 0.2 s. The plant evaluates the same Fourier modes at the vehicle for pressure and three-axis orbital velocity. This avoids interpolating an entire underwater volume. The renderer interpolates successive FMU tiles and adds short visual ripples, reflections, refraction, crest foam, shoreline foam and a yacht wake.
* `Wreck/package.mo` combines a depth-interpolated residual current, a semidiurnal tidal constituent, near-surface wind drift, and a phenomenological wreck shelter factor. Positive depth in `Ocean.profile` is below mean sea level. Each row holds depth in metres and the east/north residual velocities in m/s. Replace the example profile with site measurements, order rows by increasing depth, and set the tide coefficients independently. Subtract constituents already present in measurements before adding them separately.
* MultiBodyLie supplies six-degree-of-freedom rigid-body dynamics. Forces include displaced-water buoyancy with a centre-of-buoyancy offset, changing fore/aft tank weights and trim moments, axis-specific effective translational mass and water-relative drag. Both piston tanks have a finite volume, pump lag and pressure-dependent emptying rate. Two axial thrusters, four vertical thrusters and a reversible transverse thruster have force limits and first-order response. The manual velocity controller and immersion-scaled delivered thrust run in Modelica. Propeller RPM is estimated from shaft demand and a static thrust coefficient. A pressure- and tip-speed-based inception model drives the cavitation bubble emitters. These coefficients are illustrative.

* The ship has three deck levels, companionway openings, side cabins and a bridge. Its mesh boxes are exported into Modelica by `scripts/wreck-solids.mjs`. At 100 Hz six sphere proxies attached to the sub use MultiBodyLie.Collision.sphereBox and contactForce against those oriented boxes and the seabed. Normal load, damping, friction and off-centre moments act on the simulated rigid body.
* The 5 Hz sensor exchange uses four downward-looking DVL beams, a forward sonar with a 49-ray centre fan and four 25-ray fans at −24°, −12°, +12° and +24° elevation, a 36 × 24 raycast navigation camera, a pressure sensor and inertial measurements. Three.js intersects the same structural meshes used in the viewer. Sensor outputs include slant ranges, signed beam velocities, sonar returns, pressure, angular rates, specific force and image-patch measurements. The navigation front end matches sonar scans against cells accumulated from prior measurements. It tracks a camera patch by its brightness pattern. Modelica uses upstream FAST corner scoring to gate the visual angular-rate estimate and upstream pose-edge residuals to combine the scan match with DVL and gyro odometry. Pressure closes the depth loop and accelerometers help level the vehicle.
* Each survey keyframe stores 48 selected sonar returns across horizontal and elevated fans. Estimated attitude places those returns in 3D. Registration corrects horizontal translation and yaw, pressure constrains depth, and gravity helps level the estimate. The 12-station regression completed in 112.8 simulated seconds with 0.585 m translational RMS error, temporal feature matches on 558 of 565 frames, and a peak contact force of 45.1 N.

### Sensor vector

| Plant input lanes (one-based) | Measurement or derived observation |
|---|---|
| 1–4, 5–8 | DVL radial velocities in m/s, slant ranges in m. A zero range marks an invalid beam. |
| 9–57 | Horizontal sonar fan slant ranges, 18 m maximum. Zero denotes no usable echo. |
| 58–59 | Yaw gyro in rad/s, gauge pressure in Pa. |
| 60–63 | Scan-matched east, north, yaw and DVL lock. |
| 64–67 | DVL surge/sway, mapped cells, valid sonar returns. |
| 68–85 | Sixteen FAST-circle intensity differences, tracked angular rate, patch-valid flag. |
| 86–91 | Accelerometer specific force and three-axis gyro. |

## Sailboat

`viewer/board/Sailboat.mo` runs the dynamics and autopilot in the precompiled **Rumoca FMI 3** WebAssembly module. The waypoint coordinates, no-go angle and cross-track switching band are in the Modelica source. A leg advances inside a 2.5 m capture radius. When the next mark is upwind, the controller chooses a close-hauled heading and changes tack using cross-track hysteresis. 

Select **Head into wind** on the live page to swing the wind onto the current bow, switch to manual helm, and haul in the sheet. Orbit behind the rig to see the trailing edges cross the boom plane. The header reports mainsail leech speed relative to the boom. W hauls the sheet in and S eases it. The Vang slider adjusts tackle length and displays line tension in newtons. The loaded clew can lift the boom, changing leech tension independently of the sheet.

Each sail has 24 material points and 30 triangular panels. Wind and water loads act on the moving panels, and tension-only fabric links couple adjacent points. The luff and clew attach to the rig while the leech moves freely. Three.js draws the positions exported by the model. Crosswind fluctuations are prescribed, and the panel pressure law and cloth parameters have not been calibrated against sail measurements. Run `node scripts/check-luff.mjs` to check the headwind maneuver against the browser FMU.

The keel and rudder use local water-relative flow, yaw-induced velocity, effective aspect ratio, lift, drag and moment arms. The board model includes sway, surge, yaw, heel, wave-slope pitch and damped heave. The coefficients and dimensions describe an illustrative 64 kg sloop, rather than measured properties of the photographed RC boat.

## Fidelity and validation

This is a research prototype with an illustrative current profile, synthetic wreck, regular depth, and a reduced-order cloth and hydrodynamic model. The shelter factor approximates interior flow. Site-calibrated currents, resolved breaking waves, sail wrinkling, acoustic multipath, full camera calibration, measured cavitation performance and tether dynamics are future modelling work. The smooth-shaded Quaternius school, ray, dolphin, grass, island and foam are visual scenery. The optical sensor uses its own low-resolution headlamp and attenuation model on the shared structural geometry.

The waypoint controller is a baseline for later reinforcement-learning experiments. It already exposes observations suited to testing scan timing, retreat decisions and station keeping. No trained policy is included.

## Rebuild and verify

```sh
./build.sh
node scripts/check-rdd2.mjs
node scripts/check-luff.mjs
node scripts/check-wake-spectrum.mjs
```

The source build uses the pinned Rumoca compiler, Modelica Standard Library and CogniPilot modelica_models. Set `RUMOCA` to test a different compiler. With Emscripten and Python 3 on PATH, run `scripts/rebuild-browser.sh` after `./build.sh` to link the generated C to WebAssembly and repackage the site.

## Sources and licenses

* Sailboat inspiration and autonomous sailing background. [Pilothouse, a robotic sailboat](https://srlm.io/2015/07/02/introducing-pilothouse-a-robotic-sailboat/)
* Submarine and marine dynamics inspiration. [Piccard](https://piccard.science/)
* Animated fish and swim cycle, licensed CC0. [Quaternius Animated Fish Pack](https://quaternius.com/packs/animatedfish.html)
* Spectral ocean synthesis. [Tessendorf, Simulating Ocean Water](https://people.computing.clemson.edu/~jtessen/reports/papers_files/simdoc.pdf)
* Finite-depth orbital motion and pressure. [USACE Automated Coastal Engineering System Technical Reference](https://usace.contentdm.oclc.org/digital/api/collection/p266001coll1/id/2320/download)
* Depth-specific current data. [NOAA current predictions FAQ](https://tidesandcurrents.noaa.gov/noaacurrents/faq.html)
* Acoustic navigation sensor reference. [Water Linked DVL A50 datasheet](https://waterlinked.com/datasheets/dvl-a50)
* Modelica rigid-body dynamics, vision and SLAM algorithms. [CogniPilot modelica_models](https://github.com/CogniPilot/modelica_models)
* Browser runtime and architecture references. [Rumoca](https://github.com/CogniPilot/rumoca), [slam_web](https://github.com/CogniPilot/slam_web), [microduck_web](https://github.com/CogniPilot/microduck_web)
* Water presentation reference. [Three.js Water Pro](https://threejsroadmap.com/assets/threejs-water-pro)

Original code, shaders and original assets are released under the [Apache License 2.0](LICENSE). Third-party libraries and fish retain their individual terms. See the [distribution notices](viewer/licenses/NOTICE.txt).

### Calm-water tow study

From the repository root, run `node scripts/tow-study.mjs 2 1.02 0 > tow.csv` for a 2 m/s tow with 1.02 m half-spacing and zero heading in radians. The test uses the loaded Hobie model’s section volumes, a fixed draft and trim, a two-second acceleration ramp, and zero wind and current. CSV output includes the signed wave resistance, side force, yaw moment, and wave-height extremes. Use short runs to limit contamination from the periodic boundary. Total resistance also includes viscous loads. Hull dimensions, wetted shape, speed, attitude and the measurement uncertainty must match the tow experiment before interpreting a design ranking. [Catamaran towing tests and interference measurements](https://eprints.soton.ac.uk/462776/) · [ITTC resistance-test uncertainty](https://www.ittc.info/media/8007/75-02-02-02.pdf)

### Vehicle assets and underwater lighting

Run `blender -b -P tools/build-vehicle-assets.py` to regenerate the three original textured vehicle shells. The embedded glTF materials carry base color, roughness and metallic response. Dynamic sails, sheets, rudders, thrusters and lights attach to the simulated vehicle frames. The RDD2 uses the upstream drone asset.

A GPU pass refracts sunlight through the wave normals and accumulates flux on a reference seabed 13.7 m below mean water. A cached directional depth map of the wreck gates illumination on each receiver. Receiver depths away from the seabed use projection along the mean refracted ray. This approximation resolves blocked sunlight and deck openings but omits multiple scattering and a full volumetric photon solution.
