import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {sailFlapRate} from '../viewer/regatta.mjs';

const boat = await loadInstance('Sailboat', {
  windEast: 10, windNorth: 4, currentEast: .2, currentNorth: .04,
}, async url => new Response(await readFile(url)));
const excursions = [[], []];
for (let tick = 0; tick < 2000; tick++) {
  if (tick === 600) {
    const bow = boat.get('heading');
    boat.set('windEast', -8 * Math.cos(bow));
    boat.set('windNorth', -8 * Math.sin(bow));
    boat.set('manualHelm', 1);
    boat.set('trimInput', -1);
  }
  boat.advance(.01);
  if (tick < 1000 || tick % 10) continue;
  const points = boat.get('sailVertex');
  assert(points.every(Number.isFinite));
  for (let sail = 0; sail < 2; sail++) {
    // Lateral displacement relative to boom of trailing node in third mesh row.
    excursions[sail].push(points[sail * 72 + 11 * 3 + 1]);
  }
}
for (const [sail, samples] of excursions.entries()) {
  const min = Math.min(...samples), max = Math.max(...samples);
  // Require excursions on both sides beyond a 2 cm deadband.
  let side = 0, reversals = 0;
  for (const y of samples) {
    if (Math.abs(y) < .02) continue;
    const next = Math.sign(y);
    if (side && side !== next) reversals++;
    side = next;
  }
  assert(min < -.02 && max > .02 && reversals >= 3);
  console.log(sail ? 'Jib' : 'Main', {min, max, reversals});
}

// The audio must reject steady camber and trim even when some flow separates.
const tracker = sailFlapRate();
for (let i = 0; i < 150; i++) tracker.sample(i / 32, i / 32, .07 + .001 * i, .18, .6, .5, 1);
assert.deepEqual(tracker.activity, [0, 0]);
for (let i = 150; i < 300; i++) {
  const time = i / 32;
  tracker.sample(time, time, .22 + .065 * Math.sin(2 * Math.PI * 2.5 * time), .18, .6, .5, 1);
}
assert(tracker.activity[0] > .85 && tracker.activity[1] === 0);
assert(Math.abs(tracker.dominant - 2.5) < .15);
for (let i = 300; i < 321; i++) tracker.sample(i / 32, i / 32, .22, .18, .6, .5, 1);
assert.deepEqual(tracker.activity, [0, 0]);
console.log('Luff audio rejects steady cloth and follows a 2.5 Hz flap.');
