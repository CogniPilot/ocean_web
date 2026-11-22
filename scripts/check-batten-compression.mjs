// Check full-batten segment collapse after easing the sheet under either crosswind.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

function segmentLength(points, node) {
  const i = 3 * node;
  return Math.hypot(points[i+3]-points[i], points[i+4]-points[i+1], points[i+5]-points[i+2]);
}

for (const windNorth of [-11, 11]) {
  const boat = await loadInstance('Hobie16', {
    windEast: 5.5, windNorth, launchSpeed: 2.4, launchHeading: 0,
    launchHeight: .2, ballastManual: 1, deckManual: 1, manualHelm: 1
  }, async url => new Response(await readFile(url)));
  boat.set('trimInput', -1);
  for (let i=0; i<500; i++) boat.advance(.01);
  const rest = boat.get('cloth[1].mesh');
  let maxShortening = 0;
  boat.set('trimInput', 1);
  for (let i=0; i<500; i++) {
    boat.advance(.01);
    const points = boat.get('cloth[1].vertex');
    // Four interior rows, three chordwise elements in each battened strip.
    for (let row=1; row<=4; row++) {
      for (let col=0; col<3; col++) {
        const node = 4*row+col;
        maxShortening = Math.max(maxShortening, 1-segmentLength(points,node)/segmentLength(rest,node));
      }
    }
  }
  assert(maxShortening < .12, 'battened chord collapsed after sheet release');
  console.log({windNorth, maxShortening});
}
