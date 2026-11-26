import assert from 'node:assert/strict';
import {subHarness} from './sub-harness.mjs';

// The controller sees only sensor estimates. Ground truth below scores the run.
const satil=process.argv.includes('--satil');
const first=satil?[56,-57,-8.5]:[-24,21.4,-10.1];
const {plant, sample, step} = await subHarness({spawnPosition:satil?[56,-58.3,-8]:[-24,18,-9.8]});
const visited = new Set();
let squaredError = 0, trackedFrames = 0, frames = 0, contactPeak = 0;
let maxEast = -Infinity, minNorth = Infinity, maxNorth = -Infinity;
let comparableFrames=0,matchedComparable=0,previousCorners=0;
let complete = false, atFinish, headingSquared = 0, maxHeadingError = 0, loopClosures = 0;
for (; frames < 2000; frames++) {
  const {pos, q, estimate} = await sample();
  const [w,x,y,z] = q;
  const yaw = Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z));
  const headingError = Math.atan2(Math.sin(estimate[3]-yaw), Math.cos(estimate[3]-yaw));
  headingSquared += headingError**2;
  maxHeadingError = Math.max(maxHeadingError, Math.abs(headingError));
  loopClosures = estimate[13];
  const telemetry=plant.get('surveyTelemetry'),[station,count,done]=telemetry;
  assert.equal(count,9);
  if(plant.time>.3)assert.equal(telemetry[15],satil?2:1);
  if (!visited.has(station)) {
    assert.equal(station, visited.size + 1, 'survey skipped a waypoint');
    visited.add(station);
    console.log('Station', station, 'at', plant.time.toFixed(1), 's; position',
      pos.map(v=>v.toFixed(2)).join(', '), 'm; estimate',
      estimate.slice(0,3).map(v=>v.toFixed(2)).join(', '), 'm');
  }
  squaredError += pos.reduce((sum, value, i) => sum + (value - estimate[i])**2, 0);
  trackedFrames += Number(estimate[16] > 0);
  // Exterior legs include open water. Image tracking needs corners in both frames.
  if(previousCorners>=3&&estimate[15]>=3){
    comparableFrames++;
    matchedComparable+=Number(estimate[16]>0);
  }
  previousCorners=estimate[15];
  contactPeak = Math.max(contactPeak, Math.hypot(...telemetry.slice(12,15)));
  maxEast = Math.max(maxEast, pos[0]);
  minNorth = Math.min(minNorth, pos[1]);
  maxNorth = Math.max(maxNorth, pos[1]);
  if (done > .5) {
    complete = true;
    atFinish = pos;
    frames++;
    break;
  }
  await step();
}
const rmse = Math.sqrt(squaredError / frames);
const headingRmsDeg = Math.sqrt(headingSquared/frames)*180/Math.PI;
console.log({complete, headingRmsDeg, maxHeadingDeg:maxHeadingError*180/Math.PI, loopClosures, seconds:plant.time, stationsReached:visited.size, rmse, trackedFrames, comparableFrames, matchedComparable, frames, maxEast, minNorth, maxNorth, contactPeak, atFinish});
assert(complete && visited.size === 9, 'survey timed out');
assert(maxEast>first[0]+7 && minNorth<first[1] && maxNorth>first[1]+8,'Survey missed a flank of the wreck');
assert(comparableFrames>30 && matchedComparable>comparableFrames*.5, 'Too few comparable images matched camera features');
assert(headingRmsDeg<5 && maxHeadingError<Math.PI/12, 'Estimated heading diverged from vehicle attitude');
assert(rmse < 1, 'pose RMS error exceeded one metre');
assert(Math.hypot(...atFinish.map((x,i)=>x-first[i]))<1,'Physical sub missed its first inspection station on return');
plant.set('manual',1);
await step(20);
plant.set('manual',0);
await step(20);
const restarted=plant.get('surveyTelemetry');
assert(restarted[0]<=2 && restarted[2]===0 && restarted[15]===(satil?2:1), 'Completed circuit should restart on request');
