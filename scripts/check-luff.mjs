import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

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
