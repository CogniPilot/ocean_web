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

// The ball joint lets the mast rake aft until the forestay takes the load.
const headToWind = await loadInstance('Hobie16', {
  launchEast:-500, launchNorth:-500, launchHeading:0, launchSpeed:0, windEast:-5, manualHelm:1
}, async url => new Response(await readFile(url)));
function standingLoads(halyard, ticks) {
  headToWind.set('jibHalyardInput', halyard);
  for (let i=0; i<ticks; i++) headToWind.advance(.01);
  const [forestay,jib,rake,path] = headToWind.getMany([
    'forestayTension','jibHalyardTension','mastRake','forestayPath'
  ]);
  const sag = Math.hypot(...path.slice(3,6).map((v,i) => v-(path[i]+path[i+6])/2));
  return {forestay,jib,rake,sag};
}
const sailingRig = standingLoads(.55, 300);
const easedHalyard = standingLoads(0, 600);
const hauledHalyard = standingLoads(.9, 400);
assert(sailingRig.jib > sailingRig.forestay && sailingRig.sag > .2);
assert(easedHalyard.forestay > 25 && easedHalyard.forestay > easedHalyard.jib);
assert(easedHalyard.sag < .08 && easedHalyard.rake > sailingRig.rake);
assert(hauledHalyard.jib > 100 && hauledHalyard.forestay < 8 && hauledHalyard.rake < sailingRig.rake);
console.log({sailingRig,easedHalyard,hauledHalyard});

// The boom can swing with the spar against either of the mast-step stops.
for (const tack of [-1,1]) {
  const rig = await loadInstance('Hobie16', {
    launchEast:-500, launchNorth:-500, launchHeading:0, launchSpeed:1.5,
    windEast:-4.5, windNorth:tack*8, manualHelm:1
  }, async url => new Response(await readFile(url)));
  const stop = rig.get('mastRotationStop');
  let separation = 0;
  for (let i=0; i<430; i++) {
    rig.advance(.01);
    const [mast,trim] = rig.getMany(['mastRotation','trim']);
    assert(Math.abs(mast) < stop+.04, 'The spar stays within the compliance of the stops');
    separation = Math.max(separation, Math.abs(mast-trim[0]));
  }
  assert(separation > .18, 'The boom rotates independently of the spar');
  console.log({tack,separation,stop});
}
