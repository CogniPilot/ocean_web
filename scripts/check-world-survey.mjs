// Exercise the integrated guest with its onboard estimator and survey controller.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {piccardClearance} from './piccard-clearance.mjs';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base = process.env.OCEAN_WORLD_RUNTIME
  ? pathToFileURL(resolve(process.env.OCEAN_WORLD_RUNTIME) + '/')
  : new URL('../build/world-runtime/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const world = await openFmuSession({index, base, fetch: fileFetch, instanceName: 'wreck-survey'});

try {
  const browserSteps = process.argv.includes('--browser-steps');
  const follow = process.argv.includes('--follow');
  const dedicated = index.modelName === 'OceanSubmarine';
  assert(!dedicated || !follow, 'The standalone submarine has no drone escort');
  const controls = {subManual: 0, windSpeed: 11, windBearing: .45};
  if (!dedicated) Object.assign(controls, {sailingManual: 1, flightManual: follow ? 0 : 1});
  world.set_inputs(JSON.stringify(Object.entries(controls)));
  const outputs = ['sub.waypoint', 'sub.surveyDone', 'sub.position[1]', 'sub.position[2]',
    'sub.position[3]', 'estimate[1]', 'estimate[2]', 'estimate[3]',
    'estimate[13]', 'estimate[14]', 'estimate[17]'];
  if (follow) outputs.push('drone.position[1]', 'drone.position[2]', 'drone.position[3]');
  const geometry=process.argv.includes('--clearance');
  let measure,minimum=Infinity,backwardDistance=0,forwardDistance=0;
  if(geometry){
    const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
    const wreck=require('../viewer/wreck.js')(T,{});
    const asset=await readFile(new URL('../viewer/assets/survey-pressure-housing.glb',import.meta.url));
    const gltf=JSON.parse(asset.subarray(20,20+asset.readUInt32LE(12)));
    const {mounts,axes}=JSON.parse(gltf.nodes.find(n=>n.name==='PiccardFrame').extras.thrusterLayout);
    const clearance=piccardClearance(T,wreck,mounts,axes);
    const point=new T.Vector3(),relative=new T.Vector3(),attitude=new T.Quaternion(),previous=new T.Vector3(-5,0,-10);
    measure=(x,y,z,[w,qx,qy,qz])=>{
      attitude.set(qx,qy,qz,w);
      const distance=relative.set(x,y,z).sub(previous).dot(point.set(1,0,0).applyQuaternion(attitude));
      forwardDistance+=Math.max(0,distance);backwardDistance+=Math.max(0,-distance);previous.set(x,y,z);
      minimum=clearance(previous,attitude,Math.min(.5,minimum));
    };
    for(let i=1;i<=4;i++)outputs.push('sub.orientation['+i+']');
  }
  const binding = world.bind_outputs(JSON.stringify(outputs));
  let lastStation = 0, frames = 0, squaredError = 0, stepMs = 0, readMs = 0, finished = false;

  const positionErrors = [];
  let highest=-Infinity,lowest=Infinity;
  let depthSquared = 0, matchedFrames = 0, keyframes = 0, closures = 0, finishError = 0;
  let followSquared = 0, altitudeSquared = 0, peakOffset = 0;
  while (world.time() < 240) {
    const start = performance.now();
    if (browserSteps) {
      for (let tick=0; tick<20; tick++) world.step(.01);
    } else world.step(geometry ? .05 : .2);
    const stepped = performance.now();
    const values=world.read_bound(binding);
    const [station, done, x, y, z, east, north, up, keyCount, loopCount, matches, droneEast, droneNorth, altitude] = values;
    if(measure)measure(x,y,z,values.slice(-4));
    stepMs += stepped - start;
    readMs += performance.now() - stepped;
    assert([x, y, z, east, north, up].every(Number.isFinite), 'Non-finite survey pose');
    frames++;highest=Math.max(highest,z);lowest=Math.min(lowest,z);
    const error = Math.hypot(x - east, y - north, z - up);
    positionErrors.push(error);
    squaredError += error ** 2;
    depthSquared += (z - up) ** 2;
    if (matches > 0) matchedFrames++;
    keyframes = keyCount;
    closures = loopCount;
    finishError = error;

    if (follow) {
      const offset = Math.hypot(droneEast - east, droneNorth - north);
      followSquared += offset ** 2;
      altitudeSquared += (altitude - 5) ** 2;
      peakOffset = Math.max(peakOffset, offset);
    }
    if (station !== lastStation) {
      assert.equal(station, lastStation + 1, 'Stations must be visited in order');
      lastStation = station;
      console.log('Waypoint', station, 'at', world.time().toFixed(1), 's');
    }
    if (done) {
      assert(Math.hypot(x + 1.5, y, z + 9.8) < 1, 'Vehicle finished outside the final station');
      finished = true;
      break;
    }
  }

  const rms = Math.sqrt(squaredError / frames);
  console.log({finished, browserSteps, lastStation, rms, seconds: world.time(), stepMs, readMs});
  positionErrors.sort((a,b)=>a-b);
  console.log({frames, positionP95: positionErrors[Math.ceil(.95 * frames) - 1],
    positionPeak: positionErrors.at(-1), depthRms: Math.sqrt(depthSquared / frames),
    finishError, matchedFrames, keyframes, closures});
  assert(keyframes > 1 && matchedFrames > 0, 'Survey must build a map and match camera features');
  if (follow) {
    const horizontalRms = Math.sqrt(followSquared / frames);
    const altitudeRms = Math.sqrt(altitudeSquared / frames);
    console.log({horizontalRms, altitudeRms, peakOffset});
    assert(horizontalRms < 2.5 && altitudeRms < .5, 'Aircraft lost the moving survey station');
  }
  if(geometry){
    console.log({minimumSeparatingMargin:minimum,forwardDistance,backwardDistance});
    assert(minimum>0,'Piccard geometry touched wreck or seabed');
    assert(backwardDistance<.04*forwardDistance,'Sustained reverse survey travel');
  }
  assert(finished, 'The survey timed out');
  assert.equal(lastStation, 17);
  assert(highest-lowest>4, "Survey must traverse the interior and upper hull at different depths");
  assert(rms < 1, 'Pose estimate exceeded 1 m RMS error');
} finally {
  world.free();
}
