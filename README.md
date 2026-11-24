# ocean_web

Sail a Pilothouse-inspired keelboat or a full-size Hobie 16, pilot an RDD2 drone, and explore a listed shipwreck with a survey submarine. The browser steps precompiled Rumoca FMI 3 models and draws their outputs with Three.js. [Open the simulator](https://cognipilot.github.io/ocean_web/)

Medium and High keep waves, wakes, reflection and refraction. On touch devices they adjust rendering resolution under load. Rendering is capped at 30 FPS. The HUD reports frame rate and simulation speed separately. Use **Settings → Performance → Offline simulation speed** to request 1×, 1.5× or 2×. **Test frame rate** measures display cadence over 15 seconds, and **Test simulation headroom** measures how fast the physics can run. [Launch the Hobie on High](https://cognipilot.github.io/ocean_web/?boat=Hobie16&quality=high)

New sessions start with the selected vehicle or animal. Open **Settings → Spawn NPC** to add wildlife or a Hobie, sloop, cruiser, RDD2 or Piccard. The Hobie NPC times its approach to the fleet start, rounds the course marks and crosses the finish. Its completed laps appear in **Best laps** alongside player laps. In multiplayer, the host spawns the NPCs for the room. The other vessels follow automatic patrol routes. Each vessel has an orbit camera under **Camera**. The **Players & NPCs** panel shows names, models and racing NPCs’ progress. [Launch the cruiser](https://cognipilot.github.io/ocean_web/?control=motorboat&quality=fast) · [Fly the herring gull](https://cognipilot.github.io/ocean_web/?control=gull&quality=high)

To land the gull, push the right stick forward and glide into the water. It automatically switches to swimming. W paddles, Q/E turns, and holding W and R together runs into takeoff. On touch screens, push the left stick forward to paddle and pull the right stick back to take off. The gull floats on the local wave surface and responds to local gusts in flight.

Choose **Piccard Sub** to explore the shipwreck. You start in the cockpit with the sonar map visible and autopilot surveying the wreck interior and upper hull. **Take control** lets you pilot the same dive, and **Resume survey** hands it back to autopilot. Enable **Multiplayer** and share **Copy room link** to explore together, each in your own sub. [Launch the sub](https://cognipilot.github.io/ocean_web/?control=sub)

[Request tracker](TODO.md)

On the Hobie 16, the red port and green starboard sidestay ribbons stream in the direction the apparent wind is going. A ribbon pointing aft means wind is coming over the bow. They hang down when the air is still relative to the boat. The main has three inspection windows and the jib has two. Each window has a telltale on both faces. The ribbons have five hinged segments that flutter under local apparent airflow and hang under gravity in light air. A lifting or reversing ribbon indicates possible separation. With sound enabled, the luffing sails audibly flutter. The sails have a satin woven finish, stitched batten pockets and clear inspection windows. Water is visible through the open-weave trampoline. The white fiberglass gelcoat and black anodized spars have separate lighting finishes.

Use **Settings → Sail trim → Mainsail outhaul** to move the Hobie’s main clew along the boom and change the loaded sail shape. The Hobie compass defaults to apparent wind from the simulated vane and cups. Choose **True** under **Compass wind** to see the environmental wind. **Physics view** under Settings works across vehicles. The sailboats show body and joint axes, mast stations, cloth nodes, full-length batten paths and wetted hull sections. The cruiser adds buoyancy strips, the Piccard shows thruster axes, measured loads and an optional 5 × 5 × 5 volume of mean water-current vectors, the RDD2 shows rotor axes, and the animals show the joints driven by the simulation.

Enable **Wave grids** to see the solver's sampled fields. On the Hobie, **Automatic** and **Pontoon water samples** show the 12 native Modelica water samples along each pontoon, including with wakes off. Choose **Local displacement wake** for the 25 cm near-hull grid and the nested 10 cm grid covering both spreading bow crests on the Hobie. **Surface height** samples the combined sea surface every 2 m, including analytic swell, wind sea and active wakes. **Automatic** shows this surface for vehicles without a dedicated water layer. For humpback and great white, **Automatic** and **Local displacement wake** show the local 64 × 64 Modelica wake lattice. Gold dots mark points that displace water. Choose **Wind sea** for the 2 m world grid, **Shared displacement wake** for the 1 m grid that drifts with the current, or **All fields** to inspect how they overlap. White dots show the surface elevations sampled by the hull sections. Enable **Collision shapes** in Settings to see the terrain and wreck contact meshes, landing targets, grounding probes and vessel contact geometry. **Inertia shapes** overlays an equivalent ellipsoid for a complete mass tensor and colored rings for individual moments. Press **M** or tap **Map** for a north-up chart with the island, course, players and spawned NPCs. The chart sits in the lower-right corner and stays available while you sail.

The Hobie opens in **Orbit**. Choose **Camera → Skipper** to ride with its movable ballast. The eye stays just above the marker as the ballast shifts on deck or out on the trapeze, and the horizon stays level as the hull heels. Drag or swipe to look around. Right-drag to pan, and scroll or pinch to zoom in any 3D view. **Settings → Crew & ballast → Ballast marker** toggles the sphere marking the movable ballast’s center of mass. In apparent-wind mode the gold arrow shows the vane direction and the red no-go sector uses true wind estimated from the vane, cups and boat velocity. [Skipper view](https://cognipilot.github.io/ocean_web/?boat=Hobie16&view=ballast)

While steering by hand, use **↑/↓** to move the main traveler leeward/windward across the track and **←/→** to move the jib travelers inboard/outboard. Hold **↑** to ease faster, or press **Shift+↑** or tap **Ease traveler** to release it all the way leeward. The first shortcut switches the travelers from Auto to manual.

**Auto ballast** starts enabled on the Hobie. It shifts crew weight windward as the rig loads up. Under sustained load, it can move the weight to the trapeze stance, 2.10 m from the centerline on either side. It also moves fore and aft to trim against the local wave face and shifts aft as the foredeck runs low on clearance. After a side capsize, Auto ballast eases both sheets and shifts the simulated crew onto the lower hull to lean out on the righting line. Gravity on the displaced crew supplies the righting moment.

The default **Swell** has a 30.48 m wavelength and a 0.65 m crest-to-trough height. **Steep swell** uses the same wavelength and a 1.2 m crest-to-trough height. **Long swell** has a 60.96 m primary wavelength and a 3.4 m crest-to-trough height. At 21.4 kn, its directional wind sea has a significant wave height of 0.47 m and a peak period of 5.2 s. The Hobie can catch a following wave as the pressure on its immersed hull accelerates it down the face.

With sound enabled, simulated water motion near the listener drives the surface wash. Slow hull motion adds close gurgles and lapping.

## Combined simulation component

The startup picker loads one Rumoca component for the selected vehicle. Each component includes the shared sea, wind and race infrastructure. The default keyboard layout is **WASD + Q/E + R/F** across the model picker and the ONR basin. Select **WASD + arrows (Mode 2)** to use transmitter controls. The browser remembers the choice. Tap **Reset** to restart the local simulation from the current vehicle’s starting conditions. Vehicle changes through **Vehicle** start a fresh session and retain the room when multiplayer is active. The boats and drone start in Manual. The sub starts on its wreck survey. [Launch the Hobie](https://cognipilot.github.io/ocean_web/?boat=Hobie16)

The coupled development scene uses one FMI 3 LS-WASM component for the Hobie, RDD2, submarine, wave field and onboard perception. Use it to switch between vehicles with their local states preserved or to try the wreck survey with the drone following overhead. In an FMI host, set `sailingManual`, `subManual` and `flightManual` to 1 for manual control or 0 for automatic control. [Open the coupled scene](https://cognipilot.github.io/ocean_web/?runtime=world) · [Open the coupled wreck survey](https://cognipilot.github.io/ocean_web/?runtime=world&demo=wreck&view=fpv) · [Download OceanWorld.fmu](https://cognipilot.github.io/ocean_web/fmi3/OceanWorld.fmu)

Prepare the browser component with `node scripts/prepare-world-runtime.mjs` and run `node scripts/check-world-survey.mjs --clearance` to check all 17 wreck survey stations, forward travel and hull clearance. The clearance check samples the pressure hull, viewport, frame and six thruster guards at 20 Hz. It reports the minimum separating margin against the wreck and seabed in metres. Add `--follow` with the combined OceanWorld runtime to engage the drone escort.

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

The **Room name** field defaults to `regatta`. Open **Settings → Multiplayer**, enter a name, and turn on **Multiplayer** to join that room. Editing the name while connected moves you to the new room. **Copy room link** preserves the name. Press **Enter** or tap **Chat** to open room chat. Press **Enter** to send or **Escape** to return to sailing. The **Players & NPCs** roster identifies the host. In the Multiplayer pane, the host can **Transfer host** to another player or **Restart countdown** to schedule the next fleet start five minutes out. Current NPCs and recorded lap times carry over during transfer. The sailing compass opens with wind speed, speed over ground, true heading and the bearing and distance to the next gate or mark. **Settings → View & diagnostics → Forces** shows loads at their hull or rig attachment points. The committee flag and island palms respond to the wind field at their locations.

For networks that block direct WebRTC connections, set the GitHub Actions variable `OCEAN_TURN_ENDPOINT` to an HTTPS endpoint that issues short-lived TURN credentials and rerun the Pages workflow. It should return a JSON object with an `iceServers` array of `urls`, `username`, and `credential` entries. The endpoint must allow GET requests from the viewer's origin. Keep the provider's API key on the credential server. When a peer is discovered but the WebRTC connection fails, the Multiplayer pane reports the connection failure.

Select **Vehicle → RDD2 drone** to fly, or open `?control=drone`. Manual flight starts in **Position hold**. R/F controls throttle or climb and descent in position hold. Q/E controls yaw, W/S controls pitch or forward/back, and A/D controls roll or strafe. With sound enabled, each propeller has a blade-pass tone driven by its simulated rotor speed. The right touch stick follows the same axes. Space controls the motor switch. On touchscreens W/A/S/D correspond to the left stick and the arrows correspond to the right stick. Sailboats combine helm and sheet on the left stick. The cruiser combines helm and throttle there and retains its separate searchlight controls. Holding a direction progressively increases the stick command. Select **Engage race autopilot** in the Hobie or RDD2 to sail or fly the scored regatta. **Take the helm** returns control to the player.

The drone compass shows heading, the next course target and estimated true wind speed and direction. The controller predicts position, velocity and accelerometer bias at 50 Hz from simulated inertial measurements, then corrects them with 10 Hz simulated GNSS fixes. Attitude propagates from the launch pose using the gyroscope. A separate filter estimates horizontal wind from drag inferred by the accelerometer and rotor speeds. Enable **Settings → Drone covariance** to see the one-standard-deviation uncertainty for position, velocity and horizontal wind.

The live page runs the Pilothouse-inspired sloop and full-size Hobie 16 as Rumoca FMI 3 WebAssembly modules. The race committee runs rolling five-minute UTC starts. The launch and all three inflatable marks drift under wind, current and contact loads until their anchor lines draw tight. The launch swings about its bow fairlead and samples waves at four points on the hull. Each line has a fixed seabed attachment, a paid-out length, axial stiffness and damping. Start upwind between the committee flag and orange pin. The line is initially laid 64 m long, perpendicular to the prevailing wind. Scoring follows the moving endpoints. Both sailboats start 14 m downwind of it. Sail 200 m to the windward mark, reach 200 m to the second mark, then return 200 m to finish across the line from the course side. Round each mark to port through its outside scoring gate. Enable **Wind & signals** for apparent-wind audio and a synthesized start signal. **Multiplayer** joins the selected room. Use `?room=NAME` to prefill the room or `?room=NAME&join=1` to join it directly. Tabs in the same browser profile and site also connect directly over BroadcastChannel. Across devices, participating browsers discover one another via public Nostr relays and exchange boat states over WebRTC. Choose a vehicle when opening the page or a room link. Changing **Control** opens a fresh simulation for that vehicle. A room can include any mix of supported vehicles. To join directly as a drone pilot, open `?room=harbor&join=1&control=drone&view=fpv`; a skipper can use `?room=harbor&join=1&control=boat` and a submarine pilot can use `?room=harbor&join=1&control=sub&view=fpv`. Each window runs one locally selected Rumoca component for its vehicle, wind, sea and race infrastructure. Peers send snapshots used for rendering and physics inputs such as sailboat contact and wind shadow. The drone uses nearby player and NPC vessel poses and velocities for landing contact. The locally simulated committee launch, coupled sailboat and active encounter cruiser receive the corresponding landing forces and moments. Open with `?runtime=world` to run the coupled three-vehicle development scene. Peer hull contact uses compliant contact sections and each browser's most recent peer snapshot. Delay affects contact timing. Rendering peers uses a separate camera layer.

The sailing camera orbits through the surface. **Waterline** straddles it and **Under hull** shows the immersed foils. The Hobie integrates displacement and loads at 12 panels per hull. Adjacent panels are summed into six source bands per hull for the near wake and the 64 × 64 Fourier grid covering 64 m in each direction. Each Fourier source contributes its displaced volume at its subcell position. Finite depth sets the gravity-wave dispersion. The inverse FFT gives both the visible wake and the incoming peer wake. The hull samples the incident sea and wakes from other vessels for buoyancy. Its own radiated wake acts through wave resistance and yaw torque integrated over the displacement spectrum. The periodic domain moves with the surface residual current. Every browser in a room uses the same sea clock to position that domain, including when players join at different times. The near-bow pressure patch uses the wet forward sections to raise a crest on either shoulder of each Hobie hull. Its breaking estimate sets the foam coverage on the moving surface and the flow emitted as spray. Stern foam depends on water displaced by the wet aft sections and through-water speed. The spectral solver describes the broad wake shape. The separate HullWake model retains the earlier 14.4 m finite-difference comparison case.

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

Select **Sub** for the underwater survey. For assisted translation, choose **Settings → Keyboard layout → WASD + Q/E + R/F**, then click **Take control**. W/S drive forward or backward, A/D bank to move to port or starboard, Q/E yaw left or right, and R/F ascend or descend. V switches between orbit and the forward camera. Z toggles the lamp, X the sonar map, and C the DVL beams. The controller floods the trim tanks equally to give the vertical motors a sustained lifting load. Banking vectors part of that thrust sideways, so lateral authority builds as the tanks fill. Releasing A/D levels the sub. The standard transmitter layout retains its selectable position, auto-level and acro modes.

In transmitter **Position** mode, ↑/↓ move forward and back, W/S rise and dive, and A/D yaw. Center the motion sticks to hold the along-heading position and pressure depth. Cross-currents can carry the sub sideways. In **Settings → Physics view**, enable **Submarine water current** to inspect the depth profile, tidal flow, wind drift and wreck shelter. The arrows show ambient mean current in m/s. Wave orbital velocities contribute separately to vehicle drag. **Auto-level** uses the arrows for pitch and roll angle. **Acro** uses the same arrows to command body rates and retains tilt on release. In both attitude modes W/S command heave thrust and A/D yaw. On touchscreens, the left stick controls yaw and heave, and the right stick controls translation or attitude. **Resume survey** returns to the waypoint autopilot.

Enable **DVL rays** under **Onboard sensors** to visualize the beams in **Orbit**. They move with the transducer, and amber dots indicate the measured slant ranges. The sensor panel shows forward color video, an amber range–bearing image and four DVL slant ranges with bottom-lock status. The underwater color preview has synthetic shot and read noise. The navigation model generates its own grayscale measurements. Press **Z** or tap **Lamp (Z)** to toggle the external lamp. In FPV the preview copies the current color frame. Orbit uses a separate forward camera at up to 5 Hz while the panel is open.

On the cabin cruiser, open **Argos 350 · 3D imaging sonar**. The simulated
unit has 100, 200, and 350 m slant-range settings, a 90° horizontal fan, and
an 18 kn operating rating. The perspective view links adjacent sonar returns
into seabed and structure surfaces. Tap a return to read its range, bearing,
and depth below the transducer. The north-up harbor chart shows the simulated
shoreline, depths in metres at mean sea level, the wreck, and the boat's
current sonar coverage. **Fit sonar range** changes the chart scale to show
the full fan. Choose **Sonar** or **Chart** on a narrow screen. Both views
also appear at the helm.

Hold **W** or **S** for forward or reverse throttle. The lever returns to
neutral when you release the key or touch control. The engine sound fades
after a short pause in neutral. The searchlight and
underwater lights start off. Toggle them with **Z** and **X** or the
corresponding controls.

The cruiser samples the incident sea for buoyancy and renders the displacement
wake separately. Keel and chine contact points follow the hull and react to
the island terrain. The water shader excludes the cockpit interior as the
hull moves.

The bow transducer samples 231 beams down to 60° below horizontal, with
shallower beams at longer ranges. It intersects the wreck, shoreline and
seafloor, and tests line of sight to fish, sharks and whales. It updates up
to 2.5 times per second while the sonar or helm is visible, or at night when
sound is enabled or another player is present. A qualifying cluster or large
animal can trigger an audible alert. Run
`node scripts/check-cruiser-imaging-sonar.mjs` to check the coverage and returns.

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
* MultiBodyLie supplies six-degree-of-freedom rigid-body dynamics. Forces include displaced-water buoyancy with a centre-of-buoyancy offset, changing fore/aft tank weights and trim moments, axis-specific effective translational mass and water-relative drag. Both piston tanks have a finite volume, pump lag and pressure-dependent emptying rate. Two axial thrusters and four vertical thrusters have force limits and first-order response. The manual controllers, thruster allocation and immersion-scaled thrust run in Modelica. Propeller RPM is estimated from shaft demand and a static thrust coefficient. A pressure- and tip-speed-based inception model drives the cavitation bubble emitters. These coefficients are illustrative.

* The ship has three deck levels, companionway openings, side cabins and a bridge. Its mesh boxes are exported into Modelica by `scripts/wreck-solids.mjs`. The Piccard uses a faceted pressure barrel, spherical forward viewport, individual frame rails, tray, equipment packs and six open motor ducts. Modelica tests the convex pieces against each nearby wreck or seabed box using separating axes and resolves the resulting contacts at their body-frame lever arms. Normal load, damping, friction and off-centre moments act on the simulated rigid body.
* The 5 Hz sensor exchange uses four downward-looking DVL beams, a forward imaging sonar with a 130° horizontal fan and 20° vertical aperture tilted 6° down, a 36 × 24 raycast navigation camera, a pressure sensor and inertial measurements. The Modelica sensor intersects oriented solids shared with wreck collision geometry. Sensor outputs include slant ranges, signed beam velocities, sonar returns, pressure, angular rates, specific force and image-patch measurements. The navigation front end matches sonar scans against cells accumulated from prior measurements. It tracks a camera patch by its brightness pattern. Modelica uses upstream FAST corner scoring to gate the visual angular-rate estimate and upstream pose-edge residuals to combine the scan match with DVL and gyro odometry. Pressure closes the depth loop and accelerometers help level the vehicle.
* The sonar integrates 15 elevation samples into 128 slant-range bins at each of 65 bearings. The display shows the same ping used to extract the strongest range returns for navigation. Each keyframe stores 48 selected returns projected onto the centre of the vertical aperture. Their elevation is uncertain. Registration corrects horizontal translation and yaw, pressure constrains depth, and gravity helps level the estimate. The navigation filter receives the integrated three-axis gyro increments over each 0.2 s acquisition interval. This preserves rotation through the tight turns between passages.

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

`viewer/board/Sailboat.mo` runs the dynamics and autopilot in the precompiled **Rumoca FMI 3** WebAssembly module. The waypoint coordinates, no-go angle and cross-track switching band are in the Modelica source. A leg advances inside a 2.5 m capture radius. When the next mark is upwind, the controller chooses a close-hauled heading and changes tack using a cross-track band. The Hobie widens that band on long legs. If a tack stalls head-to-wind, the pilot centers the rudders, eases the mainsheet and holds the jib backed. After the water-speed log registers 0.22 m/s of sternway it reverses the rudders. It resumes forward steering above 0.09 m/s of headway and lets the boat accelerate on the new tack. Run `node scripts/check-hobie-tack.mjs` to reproduce the maneuver in both directions. Add `--race` for a complete 600 m scored triangle in steady wind.

Select **Head into wind** on the live page to swing the wind onto the current bow, switch to manual helm, and haul in the sheet. Orbit behind the rig to see the trailing edges cross the boom plane. S hauls in the main and working jib together. W eases them. On the catamaran, Downhaul lowers the tack and tensions the mainsail luff. The display gives luff load in newtons. The sloop has a separate Vang control. On the Hobie, the hoisted mainsail supports the boom with the sheet eased. Mainsheet and downhaul loads flex the raked mast and change the cloth shape in Modelica.

**Settings → Sail trim → Travelers & jib sheet → Jib tack assist** is on by default for the Hobie. When you steer through the wind, it briefly holds the old working sheet to back the jib. It releases after the crossing or a timeout. You control the rudders and mainsheet throughout the maneuver.

The Hobie main has 40 cloth nodes and 54 triangles. Its jib has 24 nodes and 30 triangles. Each full-length batten runs along a row of mesh edges and supplies mass, axial stiffness and bending stiffness along that row. The stitched pockets and physics overlay use the same edges. Wind and water loads act on the moving triangles. The luff and clew attach to the rig while the leech can move under load. Three.js draws the positions exported by Modelica. With sound on, the luffing effect requires both separated airflow and measurable leech motion. The flap frequency sets the cadence of the low cloth noise when a dominant frequency can be resolved. Run `node scripts/check-luff.mjs` to check the headwind maneuver against the browser FMU.

The Hobie hull is 5.04 m in the model, matching the class association's hull-length figure. The modeled mainsail has a nominal luff of 7.15 m and a 2.78 m foot. Its projected area is about 13.83 m². The jib has a 4.84 m luff and 1.98 m foot with about 4.58 m² of projected area. Hobie publishes 13.77 m² and 5.12 m² for the two sails. Girths, cloth stiffness and aerodynamic coefficients remain engineering estimates. [Hobie specifications](https://hobie.co.za/catamarans/hobie-16/) · [IHCA class specifications](https://hobieclass.com/hobie-classes/hobie-16/)

The keel and rudder use local water-relative flow, yaw-induced velocity, effective aspect ratio, lift, drag and moment arms. The board model includes sway, surge, yaw, heel, wave-slope pitch and damped heave. The coefficients and dimensions describe an illustrative 64 kg sloop, rather than measured properties of the photographed RC boat.

## Herring gull flight

Choose **Herring gull** at launch or under **Control**. On the right stick,
push up or down to pitch and left or right to bank. On the default keyboard, R/F controls pitch and A/D banks.
Q/E turns, W flaps, S glides, and Space calls. Release the flap or glide
control to let the bird choose its stroke.

The harbour host advances each gull at 100 Hz. An inner and outer strip on each wing resolve airspeed, stroke velocity, roll rate, incidence and drag. Differential incidence produces a roll moment. Wing loading and the aft tail produce pitch moments. A bounded actuator trims each surface, and the accumulated lift banks the flight path. Guests receive the integrated attitude, wing pose and state needed to take over the flight.

The representative bird uses a mass of 0.705 kg, a span of 1.35 m and a wing area of 0.200 m². A field study reported these dimensions and an average equivalent airspeed of 13.4 ± 1.37 m/s over 47 herring gull runs. Separate migration observations reported active wingbeats at 3.13 Hz and airspeed of 11.8 ± 2.07 m/s. The model uses that wingbeat frequency as a calibration input. [Field airspeed and morphology](https://doi.org/10.1098/rsif.2013.0419) · [Measured wingbeats, Table 2](https://tethys.pnnl.gov/sites/default/files/publications/Pennycuick_2001.pdf)

Run `node scripts/check-herring-gull.mjs` to reproduce the checks against the shipped FMU. Three still-air glides settled to 0.55, 0.68 and 0.92 m/s of sink at horizontal airspeeds of 8.95, 10.67 and 12.66 m/s. The mid-speed run covered 15.8 m horizontally per metre descended. For a related-species comparison, Williamson and colleagues used 0.55 m/s as the minimum sink of their modeled lesser black-backed gull polar. In the simulated harbour with 11 m/s wind, the gull averaged 12.70 m/s over the last 70 seconds of a 90-second run and changed between flapping and gliding 30 times. A desktop Node run took about 0.10 ms per 10 ms step including telemetry. [Gull glide-polar methods and measurements](https://doi.org/10.2514/1.J059438)

The four quasi-steady strips approximate feather twist and wrist folding. The tail area, inertias, control gains and 35 W positive aerodynamic work limit are engineering estimates. The reported power excludes internal wing acceleration, elastic energy recovery and metabolic losses. Experimental gull studies resolve changes in static and dynamic stability across specific wing joint configurations. Feather deformation, sideslip dynamics, stall recovery and vertical gusts remain outside this model's calibrated envelope. [Gull dynamic pitch stability](https://pubmed.ncbi.nlm.nih.gov/36067296/)

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

Original code, shaders and original assets are released under the [Apache License 2.0](LICENSE). Third-party code, models, and audio retain their individual terms. The [distribution notices](viewer/licenses/NOTICE.txt) identify the shipped materials and their licenses. The optional music is by Olivier Bérubé.

### Drive the Iowa ONR Tumblehome

Select **ONR Tumblehome** in the model picker to enter the dedicated basin.
Choose **Free running**, press **538 rpm**, and steer with **Q/E** or the helm
slider. **Straight tow** prescribes forward speed. **Wake contours** shows
hull-induced surface elevation in 5 mm intervals. The headless benchmark uses
the same ship model. [Experimental comparisons](scripts/benchmarks/README.md)

### Calm-water tow study

From the repository root, run `node scripts/tow-study.mjs 2 1.02 0 > tow.csv` for a 2 m/s tow with 1.02 m half-spacing and zero heading in radians. The test uses the loaded Hobie model’s section volumes, a fixed draft and trim, a two-second acceleration ramp, and zero wind and current. CSV output includes the signed wave resistance, side force, yaw moment, and wave-height extremes. Use short runs to limit contamination from the periodic boundary. Total resistance also includes viscous loads. Hull dimensions, wetted shape, speed, attitude and the measurement uncertainty must match the tow experiment before interpreting a design ranking. [Catamaran towing tests and interference measurements](https://eprints.soton.ac.uk/462776/) · [ITTC resistance-test uncertainty](https://www.ittc.info/media/8007/75-02-02-02.pdf)

For the default Hobie strip geometry and 1.02 m half-spacing, the level-tow model produced these averages over 7.1–12.0 s. The crest is the maximum elevation on the grid at each sample. These are numerical model outputs; comparison with a measured tow is still open.

| Tow speed | Wave resistance | Mean crest |
| --- | --- | --- |
| 0.5 m/s | 0.375 N | 0.451 mm |
| 2 m/s | 3.09 N | 7.60 mm |
| 5 m/s | 13.81 N | 33.81 mm |

Add `--wave-field wake.csv` to export the final Modelica wake grid with
hull-relative forward and port coordinates in meters. The resistance time
series still goes to standard output.

Use `--geometry hull.json` to compare custom strip geometries at a prescribed
draft and trim. Supply seven `stations` in increasing fore-aft order in meters
(aft to bow), seven corresponding `beamHalf` values in meters, and twelve
`volume` entries in cubic meters, six consecutive strips per side. Set
half-spacing to zero for a centered source and set the unused row's volumes to
zero. Keep displacement and test conditions matched when comparing designs.

Run `node scripts/check-kelvin-wake.mjs > kelvin.json` for a compact
displacement-source tow at three speeds in deep, still water. It measures
wave elevation along rays 12–22 m astern, verifies port/starboard symmetry and
positive wave resistance, and compares the RMS elevation around the analytical
19.47° Kelvin half-angle with the elevation outside the wedge. The angle of
maximum amplitude is printed separately because it can lie inside the Kelvin
envelope. The check exercises the 64×64 Modelica wave solver. Comparing actual
hull drag, trim and loads with tow-tank data requires a separate validation.
[Kelvin wake angles and finite disturbance size](https://arxiv.org/abs/1304.2653)
[University of Iowa tow and maneuver benchmarks](scripts/benchmarks/README.md)
include a reproducible spectral wake comparison against the 5512 tank profile.

In the viewer, select **Physics view → Wave grids → Wake elevation contours**
under **Settings → View & diagnostics** to inspect the radiated wake in
centimeters. Use Medium or High to enable wake radiation.


### Vehicle assets and underwater lighting

Run `blender -b -P tools/build-vehicle-assets.py` to regenerate the three original textured vehicle shells. The embedded glTF materials carry base color, roughness and metallic response. Dynamic sails, sheets, rudders, thrusters and lights attach to the simulated vehicle frames. The Piccard model uses photo-estimated thruster positions. Its glTF frame carries the six body-frame mounts and shaft axes from the Modelica plant. The RDD2 uses the upstream drone asset.

Medium and High use a pre-baked sunlight caustic texture, with a cached directional depth map for wreck shadows. Fast and Low skip caustics. Receiver depths use projection along the mean refracted ray. Regenerate the texture with `python3 scripts/bake-caustics.py`. The moving Piccard lamp still uses a live lighting pass.

### Wildlife cameras

Spawn a whale or shark from **Settings → Spawn NPC** to enable its camera in **Camera**. Drag to orbit the animal and scroll to zoom. Each player can choose a different camera while watching the host’s shared wildlife simulation. Return to **Orbit** or a vehicle camera to look back at your craft.

### Piloting and stepping the humpback

Choose **Humpback whale** or **Great white shark** under **Control**. W/S adjusts swim effort, Q/E turns, R/F commands rise/dive, and A/D banks port/starboard. The right touch stick uses the same directions. Release the roll input to command level bank. Space triggers the breach cycle.

Node can step the same `HarborTraffic` Wasm plant without a renderer or room. Each action spans 0.01 s of simulated time. The five inputs range from −1 to +1. In order, they command port and starboard fin incidence (±1.20 rad each), peduncle angle relative to the body (±0.85 rad), fluke feather (±1.15 rad) and lateral sculling effort. The joint servo retains its torque and power limits. The ordinary depth, roll, course and speed pilots relinquish those actuators in direct mode.

```js
import {createWhaleEnvironment, stateNames} from './scripts/whale-env.mjs';

const whale = await createWhaleEnvironment({surface: 0, current: [0, 0]});
const observation = whale.step([0.4, -0.4, 0, 0, 0]);
console.log(Object.fromEntries(stateNames.map((name, i) => [name, observation.state[i]])));
await whale.reset();
```

`reset()` restores the initial conditions supplied at creation and returns a fresh observation at time zero. Pass `{state, surface, current}` to reset at a different 18-component state, sea elevation in metres and east/north current in m/s. The exported `stateNames` gives the state order. Position uses east, north and up in metres. Translational velocities use heading-forward, port and up in m/s. Attitudes and fin angles use radians and angular rates use rad/s. Each observation includes time in seconds, state, port/starboard fin lift and tail thrust in newtons, muscle power in watts, total terrain normal force in newtons, and minimum signed terrain clearance across seven sampled skin points in metres. Where a point enters a convex boulder, clearance also includes its signed distance to the nearest exit plane. Contact uses compliant skin points and permits transient overlap during impacts.

Surface-vessel contact uses eleven probes along each hull and oriented ellipsoids for the animal’s body, dorsal fin or flukes and pectoral fins. A submerged animal can pass under a boat when its collision envelope clears the hull. At closer range the simulation applies horizontal forces and yaw moments to the boat and animal. Each skipper computes hull response locally from the latest shared poses, while the harbor host computes the animal response. Sampling and network latency allow brief overlap. The model omits vertical lifting of the boat, foil strikes and tissue deformation. Run `node scripts/check-wildlife-contact.mjs` for approaches by the Hobie, sloop and cruiser against both species, including a spawned animal in the tenth shared slot.

### Sailing the triangle

The committee board identifies the local one-lap course as **TRI 1**. Its first-leg bearing is measured clockwise from true north at the midpoint of the start line. After the five-minute fleet signal, cross between the committee boat and pin toward mark 1. Tack to mark 1, then sail to mark 2, leaving both marks to port. At each mark, cross the outside of the turn within 18 m of the buoy with the buoy to port. Return through the same start gate from the course side. Each leg is 200 m. The lap clock starts at your own crossing and freezes at the finish. The sailing compass shows a pink pointer and true bearing to the start, next mark or finish. Select **Next fleet start** to fold or expand the race panel. **Best laps** ranks the ten fastest completed laps for the selected vehicle class. The RDD2 has its own standings and uses its horizontal position to cross the same gates at any altitude. Solo times stay on this device. In multiplayer, browsers share and cache finishes for the named room, including with later arrivals.

Select **RDD2 drone** and **Camera → Drone FPV** for the nose camera. Approach the committee boat's aft H, descend with **S**, and cut motors after touchdown. Re-enable motors and climb with **W** for takeoff. Drone feet exchange forces and moments with the moving deck. The pin and both rounding marks sample waves individually and respond in heave, roll and pitch.

In drone FPV the pink cue on the heading tape identifies the next gate or mark, with its true bearing and horizontal distance. Off-scale cues point toward the required turn. In **Position hold**, hold **Shift** with the movement keys to command twice the horizontal speed. The heading tape and pitch ladder follow the onboard attitude estimate. The side readouts show ground speed and altitude in metres. The landing surfaces include island sand and boulders, the Hobie trampoline, the sloop’s raised hatch and the cabin cruiser’s exposed decks and roof. In **Piccard Sub FPV**, the camera looks out through the clear bow dome. The instruments show navigation heading, pitch, roll, depth and horizontal speed.

In the integrated catamaran scene, boats transmit the positions and immersed volumes of twelve hull sections. The receiving Modelica solver propagates the resulting waves and applies them to hull buoyancy and wave loads. Up to four sending boats contribute inside the local 64 m water patch, with a 28.8 m source cutoff around the receiving sailboat. A new participant begins accumulating wakes upon joining. Existing waves keep propagating when a sender leaves. The separate pilothouse scene does not yet exchange hull sources.
