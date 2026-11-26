// Exercise the integrated guest with its onboard estimator and survey controller.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {collisionSurface} from '../viewer/wreck-contact.mjs';
import {wreckSites, wreckApproach} from '../viewer/red-sea-sites.mjs';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base = process.env.OCEAN_WORLD_RUNTIME
  ? pathToFileURL(resolve(process.env.OCEAN_WORLD_RUNTIME) + '/')
  : new URL('../build/world-runtime/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const site=process.argv.includes('--satil')?'satil':'yatush';
const expectedSite=site==='satil'?2:1;
const wreck=wreckSites.find(row=>row.id===site);
const spawn=wreckApproach(wreck);
const start=spawn.position;
const parameters={};
start.forEach((value,i)=>{parameters['sub.spawnPosition['+(i+1)+']']=value;});
const firstStation=site==='satil'?[56,-57,-8.5]:[-24,21.4,-10.1];
const world = await openFmuSession({index, base, fetch: fileFetch, parameters, instanceName: 'wreck-survey',downloadFirst:true});

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
  let measure,minBed=Infinity,minHull=Infinity,backwardDistance=0,forwardDistance=0,attitudeErrorSquared=0;
  if(geometry){
    const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
    const bed=require('../viewer/bathymetry.js');
    const sites=await Promise.all(wreckSites.map(async site=>({
      mesh:collisionSurface(JSON.parse(await readFile(new URL('../viewer/assets/red-sea/'+site.id+'/collision.json',import.meta.url)))),
      origin:[site.east,site.north,bed.height(site.east,site.north)-site.burial]
    })));
    const point=new T.Vector3(),relative=new T.Vector3(),attitude=new T.Quaternion(),previous=new T.Vector3(...start);
    const euler=new T.Euler(0,0,0,'ZYX'),estimatedAttitude=new T.Quaternion();
    measure=(x,y,z,[roll,pitch,yaw,w,qx,qy,qz])=>{
      attitude.set(qx,qy,qz,w);
      estimatedAttitude.setFromEuler(euler.set(roll,pitch,yaw,'ZYX'));
      attitudeErrorSquared+=attitude.angleTo(estimatedAttitude)**2;
      const distance=relative.set(x,y,z).sub(previous).dot(point.set(1,0,0).applyQuaternion(attitude));
      forwardDistance+=Math.max(0,distance);backwardDistance+=Math.max(0,-distance);previous.set(x,y,z);
      // A 40 cm sphere encloses the pressure housing, skids and thrusters at any attitude.
      const bodyRadius=.4;
      minBed=Math.min(minBed,z-bed.height(x,y)-bodyRadius);
      for(const site of sites){
        const local=[x,y,z].map((v,i)=>v-site.origin[i]);
        const hit=site.mesh.nearest(local,minHull+bodyRadius);
        if(hit)minHull=Math.min(minHull,hit.distance-bodyRadius);
      }
    };
    outputs.push('estimate[7]','estimate[8]','estimate[4]');
    for(let i=1;i<=4;i++)outputs.push('sub.orientation['+i+']');
  }
  const binding = world.bind_outputs(JSON.stringify(outputs));
  const selected=world.bind_outputs(JSON.stringify(['sub.surveySite','sub.surveyTelemetry[2]']));
  let lastStation = 0, frames = 0, squaredError = 0, stepMs = 0, readMs = 0, finished = false;

  const positionErrors = [];
  let highest=-Infinity,lowest=Infinity;
  let depthSquared = 0, matchedFrames = 0, keyframes = 0, closures = 0, finishError = 0;
  let followSquared = 0, altitudeSquared = 0, peakOffset = 0;
  while (world.time() < 650) {
    const start = performance.now();
    if (browserSteps) {
      for (let tick=0; tick<20; tick++) world.step(.01);
    } else world.step(geometry ? .05 : .2);
    const stepped = performance.now();
    const values=world.read_bound(binding);
    const [station, done, x, y, z, east, north, up, keyCount, loopCount, matches, droneEast, droneNorth, altitude] = values;
    if(measure)measure(x,y,z,values.slice(-7));
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
    if(world.time()>.3){
      const [active,count]=world.read_bound(selected);
      assert.equal(active,expectedSite,'Survey chose the wrong wreck');
      assert.equal(count,9);
      assert(Math.abs(x-wreck.east)<wreck.halfLength+8 && Math.abs(y-wreck.north)<wreck.halfBeam+10,
        'Survey left the local wreck perimeter');
    }
    if (done) {
      assert(Math.hypot(east-firstStation[0],north-firstStation[1],up-firstStation[2])<.55,'Measured circuit failed to close');
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
  const landmarkFields=[];
  for(let row=1;row<=keyframes;row++){
    for(let col=176;col<=180;col++)landmarkFields.push(`keyframes[${row},${col}]`);
  }
  const landmarks=world.read_bound(world.bind_outputs(JSON.stringify(landmarkFields)));
  let dvlLandmarks=0;
  for(let row=0;row<keyframes;row++){
    if(landmarks[5*row]===0)continue;
    const slantRanges=landmarks.slice(5*row+1,5*row+5);
    assert(slantRanges.every(range=>range>0&&Number.isFinite(range)), 'Invalid keyframe DVL lock');
    dvlLandmarks+=4;
  }
  console.log({dvlLandmarks});
  if (follow) {
    const horizontalRms = Math.sqrt(followSquared / frames);
    const altitudeRms = Math.sqrt(altitudeSquared / frames);
    console.log({horizontalRms, altitudeRms, peakOffset});
    assert(horizontalRms < 2.5 && altitudeRms < .5, 'Aircraft lost the moving survey station');
  }
  if(geometry){
    console.log({minimumHullMargin:minHull,minimumBedMargin:minBed,forwardDistance,backwardDistance});
    assert(Math.min(minHull,minBed)>0,'Piccard geometry touched wreck or seabed');
    const attitudeRmsDegrees=Math.sqrt(attitudeErrorSquared/frames)*180/Math.PI;
    console.log('Attitude RMS error',attitudeRmsDegrees,'degrees');
    assert(attitudeRmsDegrees<10,'Survey attitude estimate lost the actual vehicle orientation');
    assert(backwardDistance<.04*forwardDistance,'Sustained reverse survey travel');
  }
  assert(finished, 'The survey timed out');
  assert.equal(lastStation, 9);
  assert(highest-lowest>.55, 'Survey should visit the wreck at multiple elevations');
  assert(rms < 1, 'Pose estimate exceeded 1 m RMS error');
} finally {
  world.free();
}
