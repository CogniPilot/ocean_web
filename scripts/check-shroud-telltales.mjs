// Exercise apparent wind in hull axes, including wind induced by boat motion.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
for (const [east,north,speed,axis,sign] of [
  [0,0,0,2,-1],[8,0,0,0,1],[-8,0,0,0,-1],[0,8,0,1,1],[0,-8,0,1,-1],[0,0,3,0,-1]
]) {
  const model=await loadInstance('Hobie16',{windEast:east,windNorth:north,launchSpeed:speed,
    launchHeading:0,manualHelm:1},async url=>new Response(await readFile(url)));
  model.advance(.001);
  const ribbons=model.get('shroudTail');
  for(const start of [0,3]){
    assert(Math.abs(Math.hypot(...ribbons.slice(start,start+3))-1)<1e-8);
    assert(ribbons[start+axis]*sign>.99,`unexpected ribbon direction at wind (${east}, ${north}) and speed ${speed}`);
  }
}
console.log('Both sidestay telltales passed all six apparent-wind cases.');
