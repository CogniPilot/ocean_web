import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const boat = await loadInstance('Sailboat', {manualHelm:1, trimInput:1, windEast:8},
  async url => new Response(await readFile(url)));
let worst = 0, maxSwing = 0;
for (let i = 0; i < 800; i++) {
  if (i === 400) boat.set('trimInput', -1);
  boat.advance(.01);
  const r = boat.get('sheetRotation').slice(9), p = boat.get('sailVertex').slice(72);
  const tack = boat.get('footX')[1];
  function hullPoint(node) {
    const xyz = p.slice(3*node, 3*node+3);
    return [tack,0,.19].map((origin,j) => origin + xyz.reduce((v,x,k) => v+r[3*j+k]*x,0));
  }
  for (let row=0; row<6; row++) {
    const [x,y,z] = hullPoint(row*4);
    const stayX = 1.16 + (.12-1.16)*(z-.09)/(2.78-.09);
    worst = Math.max(worst, Math.hypot(y,x-stayX));
  }
  maxSwing = Math.max(maxSwing,Math.abs(hullPoint(3)[1]));
}
assert(worst < 1e-9 && maxSwing > .4, JSON.stringify({worst,maxSwing}));
console.log({worst,maxSwing});
