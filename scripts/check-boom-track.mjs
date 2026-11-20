// Exercise the moving mainsail foot and the loose-footed jib in the compiled rig.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const boat = await loadInstance('Hobie16', {
  windEast: 5.5, windNorth: 11, launchSpeed: 2.4, launchHeading: 0,
  launchHeight: .2, manualHelm: 1, deckManual: 1
}, async url => new Response(await readFile(url)));
let trackError = 0, jibDeflection = 0, boomMin = Infinity, boomMax = -Infinity;
for (const trim of [-1, 1, -1]) {
  boat.set('trimInput', trim);
  for (let step=0; step<400; step++) {
    boat.advance(.01);
    const [main, jib, elevation] = boat.getMany(['cloth[1].vertex','cloth[2].vertex','boomElevation']);
    boomMin = Math.min(boomMin,elevation);
    boomMax = Math.max(boomMax,elevation);
    for (let col=1; col<3; col++) {
      const u=col/3;
      for (const [sail,isMain] of [[main,true],[jib,false]]) {
        const residual = [0,1,2].map(k=>sail[3*col+k]-(1-u)*sail[k]-u*sail[9+k]);
        const deviation = Math.hypot(...residual);
        if (isMain) trackError=Math.max(trackError,deviation);
        else jibDeflection=Math.max(jibDeflection,deviation);
      }
    }
  }
}
assert(trackError<1e-8, 'mainsail foot detached from the boom');
assert(boomMax-boomMin>.05, 'boom did not rotate during the test');
assert(jibDeflection>.01, 'jib foot should remain free');
console.log({trackError,jibDeflection,boomTravelRadians:boomMax-boomMin});
