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

// The catamaran's jib head attaches partway along the moving upper forestay.
const cat = await loadInstance('Hobie16', {manualHelm:1, windNorth:8},
  async url => new Response(await readFile(url)));
const jibTack = [cat.get('footX')[1],0,cat.get('footZ')[1]];
let shortestStrop = Infinity;
for (let i=0; i<400; i++) {
  cat.advance(.01);
  const [vertices,rotations,paths,stations] = cat.getMany(['sailVertex','sheetRotation','stayPath','jibStation']);
  const head = vertices.slice(132,135);
  const rotation = rotations.slice(9);
  const station = stations[5];
  const worldHead = jibTack.map((origin,j) =>
    origin + head.reduce((v,x,k) => v+rotation[3*j+k]*x,0));
  const midway = paths.slice(21,24), tang = paths.slice(24,27);
  for (let axis=0; axis<3; axis++) {
    const expected = midway[axis]+(2*station-1)*(tang[axis]-midway[axis]);
    assert(Math.abs(expected-worldHead[axis])<1e-6, 'jib head drifted off forestay');
  }
  shortestStrop = Math.min(shortestStrop, Math.hypot(...tang.map((x,j)=>x-worldHead[j])));
}
assert(shortestStrop>.38 && shortestStrop<.55);
console.log({shortestStrop});
