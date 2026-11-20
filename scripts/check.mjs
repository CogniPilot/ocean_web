import assert from 'node:assert/strict';
import {subHarness} from './sub-harness.mjs';

// The controller sees only sensor estimates. Ground truth below scores the run.
const {plant, sample, step} = await subHarness();
const visited = new Set();
let squaredError = 0, trackedFrames = 0, frames = 0, contactPeak = 0;
let maxEast = -Infinity, minNorth = Infinity, maxNorth = -Infinity;
let complete = false, atFinish, headingSquared = 0, maxHeadingError = 0, loopClosures = 0;
for (; frames < 1200; frames++) {
  const {pos, q, estimate} = await sample();
  const [w,x,y,z] = q;
  const yaw = Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z));
  const headingError = Math.atan2(Math.sin(estimate[3]-yaw), Math.cos(estimate[3]-yaw));
  headingSquared += headingError**2;
  maxHeadingError = Math.max(maxHeadingError, Math.abs(headingError));
  loopClosures = estimate[13];
  const [station, count, done, ...forces] = plant.get('surveyTelemetry');
  assert.equal(count, 12);
  if (!visited.has(station)) {
    assert.equal(station, visited.size + 1, 'survey skipped a waypoint');
    visited.add(station);
    console.log('Station', station, 'at', plant.time.toFixed(1), 's; position',
      pos.map(v=>v.toFixed(2)).join(', '), 'm; estimate',
      estimate.slice(0,3).map(v=>v.toFixed(2)).join(', '), 'm');
  }
  squaredError += pos.reduce((sum, value, i) => sum + (value - estimate[i])**2, 0);
  trackedFrames += Number(estimate[16] > 0);
  contactPeak = Math.max(contactPeak, Math.hypot(...forces.slice(10)));
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
console.log({complete, headingRmsDeg, maxHeadingDeg:maxHeadingError*180/Math.PI, loopClosures, seconds:plant.time, stationsReached:visited.size, rmse, trackedFrames, frames, maxEast, minNorth, maxNorth, contactPeak, atFinish});
assert(complete && visited.size === 12, 'survey timed out');
assert(maxEast > 16 && minNorth < -1.3 && maxNorth > 1.3, 'vehicle missed one of the listed decks');
assert(trackedFrames > frames * .5, 'too few frames matched camera features');
assert(headingRmsDeg<5 && maxHeadingError<Math.PI/12, 'Estimated heading diverged from vehicle attitude');
assert(rmse < 1, 'pose RMS error exceeded one metre');
assert(Math.hypot(atFinish[0] + 1.5, atFinish[1], atFinish[2]+9.8) < 1, 'physical sub missed the stern');
