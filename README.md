# ocean_web

Sail a Pilothouse-inspired keelboat or a full-size Hobie 16, pilot an RDD2 drone, and explore a listed shipwreck with a survey submarine. The browser steps precompiled Rumoca FMI 3 models and draws their outputs with Three.js. [Open the simulator](https://cognipilot.github.io/ocean_web/)

Choose **Piccard Sub** to explore the shipwreck. You start in the cockpit with the sonar map visible and autopilot surveying the wreck interior and upper hull. **Take control** lets you pilot the same dive, and **Resume survey** hands it back to autopilot. Enable **Multiplayer** and share **Copy room link** to explore together, each in your own sub. [Launch the sub](https://cognipilot.github.io/ocean_web/?control=sub)

[Request tracker](TODO.md)

On the Hobie 16, the red port and green starboard sidestay ribbons stream in the direction the apparent wind is going. A ribbon pointing aft means wind is coming over the bow. They hang down when the air is still relative to the boat. Paired telltales on the main and jib follow local cloth motion and apparent flow. A lifting or reversing ribbon indicates possible separation. The incidence-based response is an approximation for sail trim. Rumoca calculates each ribbon direction using local rig velocity and gravity.

## Combined simulation component

The startup picker loads one Rumoca component for the selected vehicle. Each component includes the shared sea, wind and race infrastructure. Vehicle changes through **Control** start a fresh session and retain the room when multiplayer is active. The boats and drone start in Manual. The sub starts on its wreck survey. [Launch the Hobie](https://cognipilot.github.io/ocean_web/?boat=Hobie16)

The coupled development scene uses one FMI 3 LS-WASM component for the Hobie, RDD2, submarine, wave field and onboard perception. Use it to switch between vehicles with their local states preserved or to try the wreck survey with the drone following overhead. In an FMI host, set `sailingManual`, `subManual` and `flightManual` to 1 for manual control or 0 for automatic control. [Open the coupled scene](https://cognipilot.github.io/ocean_web/?runtime=world) · [Open the coupled wreck survey](https://cognipilot.github.io/ocean_web/?runtime=world&demo=wreck&view=fpv) · [Download OceanWorld.fmu](https://cognipilot.github.io/ocean_web/fmi3/OceanWorld.fmu)

To run the integrated wreck survey headlessly, prepare the browser component with `node scripts/prepare-world-runtime.mjs`, then run `node scripts/check-world-survey.mjs`. With the sailboat and drone in manual mode, the submarine reached all 12 stations in order and finished the survey in 109.6 simulated seconds. Its onboard estimate had 0.351 m RMS position error over the route. Run `node scripts/check-world-survey.mjs --follow` to engage the drone autopilot as well. In the combined survey it tracked the submarine estimate with 0.874 m horizontal RMS error and held its 5 m altitude target with 0.236 m RMS error.

The Pages build also serves a dedicated simulation worker at `world/ocean-world-worker.mjs`. From a same-origin page, open a module worker, bind input and observation names once, then send fixed-step requests. Entire arrays such as `waves.height` and `subPilot` bind by name. The opening reply includes their shapes, offsets and lengths in FMI row-major order. Replies echo the request ID and contain simulation time and a transferable Float64Array. This example advances the world through one navigation update.

```js
const world = new Worker('./world/ocean-world-worker.mjs', {type: 'module'});
world.onmessage = ({data}) => console.log(data);
world.postMessage({
  id: 1, type: 'open', inputs: ['subPilot[1]'],
  outputs: ['boat.east', 'sub.position[1]', 'drone.position[3]', 'estimate[1]']
});
world.postMessage({id: 2, type: 'advance', steps: 21, values: Float64Array.of(0.7)});
```

## Live build status

Select **Control → RDD2 drone** to fly, or open `?control=drone`. W/S and A/D move horizontally, Q/E yaw, and R/F climb or descend. Releasing the keys holds position. The drone starts in manual mode. Autopilot flies at 5 m over its survey station or follows the estimated submarine position in the coupled scene. The flight FMU uses CogniPilot’s RDD2 plant and rotor geometry with a local position controller, ideal 10 Hz GNSS, and gyroscope integration. Linear and quadratic body-axis drag use airspeed relative to the local simulated wind. The horizontal gust field is sampled at the aircraft’s location. Drag areas and low-speed damping use the RDD2 template defaults. [CogniPilot RDD2 plant](https://github.com/CogniPilot/modelica_models/blob/main/Vehicles/Rdd2/Plant.mo)

The live page runs the Pilothouse-inspired sloop and full-size Hobie 16 as Rumoca FMI 3 WebAssembly modules. The race committee runs rolling five-minute UTC starts. Its anchored launch heaves, rolls and pitches as the model samples water elevation at four points on the hull. Horizontal position and heading stay fixed. Start upwind between the committee flag and orange pin. The 40 m line lies perpendicular to the prevailing wind. Sail 200 m to the windward mark, reach 200 m to the second mark, then return 200 m to finish across the line from the course side. These are proximity checks at the marks. Enable **Wind & signals** for apparent-wind audio and a synthesized start signal. **Multiplayer** joins the public regatta, or use `?room=NAME` for a separate room. Participating browsers discover one another via public Nostr relays and exchange boat states over WebRTC. Choose a vehicle when opening the page or a room link. Changing **Control** opens a fresh simulation for that vehicle. A room can include any mix of supported vehicles. To join directly as a drone pilot, open `?room=harbor&control=drone&view=fpv`; a skipper can use `?room=harbor&control=boat` and a submarine pilot can use `?room=harbor&control=sub&view=fpv`. Each window runs one locally selected Rumoca component for its vehicle, wind, sea and race infrastructure. Peers send snapshots used for rendering and physics inputs such as sailboat contact and wind shadow. The drone uses nearby sailboat poses for landing contact and calculates committee launch contact against its locally simulated launch. Open with `?runtime=world` to run the coupled three-vehicle development scene. Peer hull contact uses compliant contact sections and each browser's most recent peer snapshot. Delay affects contact timing. Rendering peers uses a separate camera layer. Multiplayer discovery requires reachable external relays.

The sailing camera orbits through the surface. **Waterline** straddles it and **Under hull** shows the immersed foils. Six immersed sections per hull excite a 64 × 64 Fourier grid covering 64 m in each direction. Each strip contributes its displaced volume at its own subcell position. Finite depth sets the gravity-wave dispersion, and the inverse FFT combines the radiated wake with a small wind sea. The boat samples incident wind waves for immersion. It receives wave resistance and yaw torque integrated over the same displacement spectrum. The periodic domain moves with the surface residual current. Every browser in a room uses the same sea clock to position that domain, including when players join at different times. Short waves below 2 m, spray and breaking waves are unresolved. The separate HullWake model retains the earlier 14.4 m finite-difference comparison case.

Foil forces use local angular velocity, wave orbital motion, wet span, aspect ratio and induced drag. Hull viscous resistance uses the immersed skin and the ITTC-1957 correlation above the transition Reynolds number. The laminar-to-turbulent transition, form factor and foil coefficients are assumptions. Speed, leeway, turning radius and wave resistance still require validation against measured data for each hull. [ITTC resistance procedure](https://www.ittc.info/media/1575/75-02-02-01.pdf)

The GitHub Pages workflow packages the viewer and generates a browser host from the released LS-WASM archive. To serve that same integrated build locally, run these commands from the repository root with Node.js 22, npm and Git available.

```sh
git clone https://github.com/CogniPilot/microduck_web .deps/microduck_web
git -C .deps/microduck_web checkout f567b8c452d5c759436a568ffad5632dc1046916
npm install --prefix .deps/ocean-component --no-save @bytecodealliance/jco-transpile@0.23.0
scripts/package-pages.sh build/pages --world
./serve.sh
```

On an existing checkout, reuse the pinned microduck_web dependency. Open `http://127.0.0.1:8074/?runtime=world` for the integrated scene. The combined browser worker advances the vehicle plants and samples the submarine navigation sensors.

## Run

```sh
./serve.sh
```

Open **http://127.0.0.1:8074**. The launcher uses Python 3, with a Nix fallback, and serves the packaged viewer when available. The prebuilt simulator requires a WebGL2 browser with WebAssembly. Set `SERVE_DIR=viewer` to serve the legacy split-runtime development viewer.

Select **Sub** for the underwater survey. In manual mode use W/S for surge, A/D for sway, Q/E for yaw and R/F to rise or dive. Use **Resume survey** to re-engage the autopilot. The sensor panel shows forward color video, an amber range–bearing image and four DVL slant ranges with bottom-lock status. Press **Z** or tap **Lamp (Z)** to toggle the external lamp. In FPV the preview copies the current frame. Orbit uses a separate forward camera at 5 Hz while the panel is open.

## Piccard survey sensors and SLAM

The interior route follows the passages of the wreck lying on its side. The sub then ascends outside the stern, passes over the upper hull and returns to the stern at depth. Station arrival uses the onboard horizontal estimate and measured pressure.

| Reference instrument | Representation in the simulator |
| --- | --- |
| Blue Robotics Low-Light HD USB Camera, Sony IMX322/323, 80° horizontal and 64° vertical lens, up to 1080p30 | The pilot sees a color scene through the bow viewport. Navigation uses a 36 × 24 grayscale pinhole image covering the nominal lens aperture at 5 Hz. The raycaster uses illustrative lighting and texture. The color image and measured pixels are generated separately. [Camera specifications](https://bluerobotics.com/store/sensors-cameras/cameras/cam-usb-low-light-r1/) |
| QYSEA M750d, 750 kHz wide mode, 130° × 20° aperture | 65 azimuth samples and 15 elevation samples populate 128 slant-range bins out to 18 m. Echo strength includes occlusion, grazing angle, spreading across range bins and synthetic speckle. Only range and bearing enter registration. The 5 Hz scan rate and reduced resolution are simulation settings. [M750d specifications](https://fr.store.qysea.com/m750d-imaging-sonar.html) |
| Water Linked A50 Standard, 1 MHz, four Janus beams tilted 22.5° | Each beam intersects the wreck or seabed independently. The model projects body translation and mount rotation onto each beam, quantizes velocity to 0.1 mm/s and rejects overspeed or missing returns. It applies an assumed +0.6% scale bias and bounded 0.009 m/s noise. The project uses a fixed 5 Hz sensor clock. Real ping rate varies with altitude, and the upper 35–50 m of the altitude range depends on acoustic conditions. [A50 datasheet](https://waterlinked.com/datasheets/dvl-a50) and [output protocol](https://docs.waterlinked.com/dvl/dvl-json-protocol/) |

These are reference instruments. Piccard mounting offsets, water attenuation, bottom reflectivity and noise need calibration from hardware logs.

### Using the estimator with real measurements

`Wreck.SurveySLAM` exports the same Modelica sonar registration, visual feature matching, pressure/DVL/inertial odometry and keyframe loop-closure code used by the survey. Its FMI inputs are measurements. Its outputs include estimated ENU position, heading, roll/pitch, keyframes and accepted loop closures. Scan alignment estimates horizontal displacement and yaw. Depth comes from pressure and leveling from the IMU. Echo elevation remains ambiguous within the vertical sonar fan. The renderer draws the stored echoes as Gaussian splats.

The packaged `viewer/fmi3/Wreck_SurveySLAM.fmu` contains generated FMI 3 C sources. On Linux x86_64 or aarch64, build the shared library for the host with `python3 scripts/build-survey-slam-native.py viewer/fmi3/Wreck_SurveySLAM.fmu build/PiccardSurveySLAM-linux.fmu`. The builder accepts `--headers` for an installed FMI 3 C header directory and `CC` for the native compiler.

Initialize the FMU in a stationary, level cradle with the local X axis aligned with initial heading. Set `initialPosition` in local ENU metres and `pressureDatum` to the local ENU height of the reference water surface. Supply gauge pressure in Pa, specific force in m/s² including +g upright and angular rate in rad/s, both in forward/port/up coordinates. Resample synchronized measurements onto the 0.2 s estimator clock. Supply DVL radial velocities positive along the outward beam for instrument motion, with zero range for an invalid return. Supply 49 slant ranges across the fan in increasing port bearing and a rectified, row-major grayscale frame. Mark missing optical or sonar frames invalid. The hardware host must supply calibrated extrinsics, time alignment, measured density or pressure normalization and initial alignment. Initialize with the first synchronized sensor packet while stationary, then provide one packet per 0.2 s. The estimator retains up to 48 keyframes. Simulation and replay exercise the algorithm; independent wet-test logs are needed to measure field accuracy.

## Ocean and sub

The combined build targets Rumoca FMI 3 co-simulation. Body coordinates are forward, port and up. World coordinates are east, north and up. Both the wreck geometry and the trajectory use metres.

* `Wreck/SpectralSea.mo` constructs a directional JONSWAP-shaped wind sea on a 64 m periodic domain, with finite-depth dispersion, seeded random amplitudes and phases, a crossing swell, and fetch-dependent significant wave height. A separable 32 × 32 inverse radix-two FFT reconstructs the surface every 0.2 s. The plant evaluates the same Fourier modes at the vehicle for pressure and three-axis orbital velocity. This avoids interpolating an entire underwater volume. The renderer interpolates successive FMU tiles and adds short visual ripples, reflections, refraction, crest foam, shoreline foam and a yacht wake.
* `Wreck/package.mo` combines a depth-interpolated residual current, a semidiurnal tidal constituent, near-surface wind drift, and a phenomenological wreck shelter factor. Positive depth in `Ocean.profile` is below mean sea level. Each row holds depth in metres and the east/north residual velocities in m/s. Replace the example profile with site measurements, order rows by increasing depth, and set the tide coefficients independently. Subtract constituents already present in measurements before adding them separately.
* MultiBodyLie supplies six-degree-of-freedom rigid-body dynamics. Forces include displaced-water buoyancy with a centre-of-buoyancy offset, changing fore/aft tank weights and trim moments, axis-specific effective translational mass and water-relative drag. Both piston tanks have a finite volume, pump lag and pressure-dependent emptying rate. Two axial thrusters, four vertical thrusters and a reversible transverse thruster have force limits and first-order response. The manual velocity controller and immersion-scaled delivered thrust run in Modelica. Propeller RPM is estimated from shaft demand and a static thrust coefficient. A pressure- and tip-speed-based inception model drives the cavitation bubble emitters. These coefficients are illustrative.

* The ship has three deck levels, companionway openings, side cabins and a bridge. Its mesh boxes are exported into Modelica by `scripts/wreck-solids.mjs`. At 100 Hz six sphere proxies attached to the sub use MultiBodyLie.Collision.sphereBox and contactForce against those oriented boxes and the seabed. Normal load, damping, friction and off-centre moments act on the simulated rigid body.
* The 5 Hz sensor exchange uses four downward-looking DVL beams, a forward imaging sonar with a 130° horizontal fan and 20° vertical aperture tilted 6° down, a 36 × 24 raycast navigation camera, a pressure sensor and inertial measurements. The Modelica sensor intersects oriented solids shared with wreck collision geometry. Sensor outputs include slant ranges, signed beam velocities, sonar returns, pressure, angular rates, specific force and image-patch measurements. The navigation front end matches sonar scans against cells accumulated from prior measurements. It tracks a camera patch by its brightness pattern. Modelica uses upstream FAST corner scoring to gate the visual angular-rate estimate and upstream pose-edge residuals to combine the scan match with DVL and gyro odometry. Pressure closes the depth loop and accelerometers help level the vehicle.
* The sonar integrates 15 elevation samples into 128 slant-range bins at each of 65 bearings. The display shows the same ping used to extract the strongest range returns for navigation. Each keyframe stores 48 selected returns projected onto the centre of the vertical aperture. Their elevation is uncertain. Registration corrects horizontal translation and yaw, pressure constrains depth, and gravity helps level the estimate. The 12-station regression completed in 108 simulated seconds with 0.23 m translational RMS error and temporal feature matches on 539 of 540 frames in the submarine runtime.

The [wreck navigation review](NAVIGATION.md) covers the current estimator, field-tested alternatives, and validation for real sensors.

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

Select **Head into wind** on the live page to swing the wind onto the current bow, switch to manual helm, and haul in the sheet. Orbit behind the rig to see the trailing edges cross the boom plane. The header reports mainsail leech speed relative to the boom. S hauls in the main and working jib together. W eases them. On the catamaran, Downhaul lowers the tack and tensions the mainsail luff. The display gives luff load in newtons. The sloop has a separate Vang control. The loaded clew can lift the boom, changing leech tension independently of the sheet.

Each sail has 24 material points and 30 triangular panels. Wind and water loads act on the moving panels, and tension-only fabric links couple adjacent points. The luff and clew attach to the rig while the leech moves freely. Three.js draws the positions exported by the model. Crosswind fluctuations are prescribed, and the panel pressure law and cloth parameters have not been calibrated against sail measurements. Run `node scripts/check-luff.mjs` to check the headwind maneuver against the browser FMU.

The keel and rudder use local water-relative flow, yaw-induced velocity, effective aspect ratio, lift, drag and moment arms. The board model includes sway, surge, yaw, heel, wave-slope pitch and damped heave. The coefficients and dimensions describe an illustrative 64 kg sloop, rather than measured properties of the photographed RC boat.

## Fidelity and validation

This is a research prototype with an illustrative current profile, synthetic wreck, regular depth, and a reduced-order cloth and hydrodynamic model. The shelter factor approximates interior flow. Site-calibrated currents, resolved breaking waves, sail wrinkling, acoustic multipath, full camera calibration, measured cavitation performance and tether dynamics are future modelling work. The smooth-shaded Quaternius school, ray, dolphin, grass, island and foam are visual scenery. The optical sensor uses its own low-resolution headlamp and attenuation model on the shared structural geometry.

The waypoint controller is a baseline for later reinforcement-learning experiments. It already exposes observations suited to testing scan timing, retreat decisions and station keeping. No trained policy is included.

## Rebuild and verify

```sh
./build.sh
node scripts/check-sensor-geometry.mjs
node scripts/check.mjs
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

For the default Hobie strip geometry and 1.02 m half-spacing, the level-tow model produced these averages over 7.1–12.0 s. The crest is the maximum elevation on the grid at each sample. These are numerical model outputs; comparison with a measured tow is still open.

| Tow speed | Wave resistance | Mean crest |
| --- | --- | --- |
| 0.5 m/s | 0.29 N | 0.42 mm |
| 2 m/s | 2.85 N | 9.38 mm |
| 5 m/s | 10.29 N | 29.17 mm |


### Vehicle assets and underwater lighting

Run `blender -b -P tools/build-vehicle-assets.py` to regenerate the three original textured vehicle shells. The embedded glTF materials carry base color, roughness and metallic response. Dynamic sails, sheets, rudders, thrusters and lights attach to the simulated vehicle frames. The Piccard model uses photo-estimated thruster positions. Its glTF frame carries the seven body-frame mounts and shaft axes from the Modelica plant. The RDD2 uses the upstream drone asset.

A GPU pass refracts sunlight through the wave normals and accumulates flux on a reference seabed 13.7 m below mean water. A cached directional depth map of the wreck gates illumination on each receiver. Receiver depths away from the seabed use projection along the mean refracted ray. This approximation resolves blocked sunlight and deck openings but omits multiple scattering and a full volumetric photon solution.

### Sailing the triangle

The committee board identifies the local one-lap course as **TRI 1**. Its first-leg bearing is measured clockwise from true north at the midpoint of the start line. After the five-minute fleet signal, cross between the committee boat and pin toward mark 1. Tack to mark 1, then sail to mark 2, leaving both marks to port. At each mark, cross the outside of the turn within 18 m of the buoy with the buoy to port. Return through the same start gate from the course side. Each leg is 200 m. The lap clock starts at your own crossing and freezes at the finish. The race panel retains your last time until another finish or page reload.

Select **RDD2 drone** and **View → Drone FPV** for the nose camera. Approach the committee boat's aft H, descend with **F**, and cut motors after touchdown. Re-enable motors and climb with **R** for takeoff. Drone feet exchange forces and moments with the moving deck. The pin and both rounding marks sample waves individually and respond in heave, roll and pitch.

In drone FPV, hold **Shift** with **W/A/S/D** to command twice the horizontal speed. The heading tape and pitch ladder follow the onboard attitude estimate. The side readouts show ground speed and altitude in metres. The sailboat landing surfaces are the catamaran trampoline and the sloop’s raised hatch. In **Piccard Sub FPV**, the camera looks out through the clear bow dome. The instruments show navigation heading, pitch, roll, depth and horizontal speed.

In the integrated catamaran scene, boats transmit the positions and immersed volumes of twelve hull sections. The receiving Modelica solver propagates the resulting waves and applies them to hull buoyancy and wave loads. Up to four sending boats contribute inside the local 64 m water patch, with a 28.8 m source cutoff around the receiving sailboat. A new participant begins accumulating wakes upon joining. Existing waves keep propagating when a sender leaves. The separate pilothouse scene does not yet exchange hull sources.
