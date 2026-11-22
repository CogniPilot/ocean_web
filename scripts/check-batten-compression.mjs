// Check full-batten segment collapse after easing the sheet under either crosswind.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

function segmentLength(points, node) {
  const i = 3 * node;
  return Math.hypot(points[i+3]-points[i], points[i+4]-points[i+1], points[i+5]-points[i+2]);
}

for (const windNorth of [-8, 8]) {
  const boat = await loadInstance('Hobie16', {
    windEast: 5.5, windNorth, launchSpeed: 2.4, launchHeading: 0,
    launchHeight: .2, ballastManual: 1, ballastCmdY: -.55*Math.sign(windNorth),
    deckManual: 1, manualHelm: 1
  }, async url => new Response(await readFile(url)));
  boat.set('trimInput', -1);
  for (let i=0; i<500; i++) boat.advance(.01);
  const rest = boat.get('cloth[1].mesh');
  let maxShortening = 0;
  let maxWetArea = 0;
  boat.set('trimInput', 1);
  for (let i=0; i<500; i++) {
    boat.advance(.01);
    const [points,wetArea] = boat.getMany(['cloth[1].vertex','wettedArea']);
    maxWetArea = Math.max(maxWetArea,...wetArea);
    // Four interior rows, three chordwise elements in each battened strip.
    for (let row=1; row<=4; row++) {
      for (let col=0; col<3; col++) {
        const node = 4*row+col;
        maxShortening = Math.max(maxShortening, 1-segmentLength(points,node)/segmentLength(rest,node));
      }
    }
  }
  assert(maxWetArea < .01, 'Sail entered the water during the airborne batten check');
  assert(maxShortening < .12, 'battened chord collapsed after sheet release');
  console.log({windNorth, maxShortening});
}
