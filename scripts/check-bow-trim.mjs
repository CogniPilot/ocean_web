import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const boat = await loadInstance('Sailboat', {
  windEast: 10, windNorth: 4, currentEast: .2, currentNorth: .04,
}, async url => new Response(await readFile(url)));
let minFreeboard = Infinity;
for (let tick = 0; tick < 3000; tick++) {
  if (tick === 800) {
    boat.set('manualHelm', 1);
    boat.set('trimInput', 1);
  }
  boat.advance(.01);
  const pitch = boat.get('pitch'), heel = boat.get('heel');
  const bowDeck = boat.get('heave') - 1.22*Math.sin(pitch) + .077*Math.cos(heel)*Math.cos(pitch);
  if (tick > 200) minFreeboard = Math.min(minFreeboard, bowDeck);
}
assert(minFreeboard > .07, 'Bow lost design deck clearance in the flat-water sheet-easing maneuver');
console.log({minFreeboard});
