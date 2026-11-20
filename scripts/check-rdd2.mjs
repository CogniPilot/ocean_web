import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const drone=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0},async u=>new Response(await readFile(u)));
function observe(seconds){for(let i=0;i<seconds*200;i++)drone.advance(.005);return drone.get('position');}
const hover=observe(8);
drone.set('pilot',1);drone.set('forward',1);drone.set('climb',.5);
const flying=observe(2);
drone.set('forward',0);drone.set('climb',0);
const hold=observe(6);
drone.set('pilot',0);const back=observe(12);
console.log({hover,flying,hold,back,rotors:drone.get('rotorSpeed')});
assert(Math.abs(hover[2]-5)<.15&&Math.abs(hover[0]+5)<.15);
assert(flying[0]>hover[0]+1&&flying[2]>hover[2]+.4);
assert(Math.abs(hold[0]+1)<.3&&Math.abs(hold[2]-6)<.2);
assert(Math.hypot(back[0]+5,back[1],back[2]-5)<.2);
// At rest, a lateral wind produces positive side force. Reversing it reverses
// the force, and the controller must lean into it to hold the station.
for(const speed of [-5,0,5]){
  const gust=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0,windENU:[0,speed,0]},async u=>new Response(await readFile(u)));
  gust.advance(.005);
  const sideForce=gust.get('dragBody')[1];
  const expected=(.5*1.225*.08*Math.abs(speed)+.12)*speed;
  assert(Math.abs(sideForce-expected)<.02);
  for(let i=0;i<1200;i++)gust.advance(.005);
  const y=gust.get('position')[1],roll=gust.get('quaternion')[1];
  if(speed!==0)assert(y*speed>0 && roll*speed>0);
  console.log({windNorth:speed,sideForce,y,rollQuaternion:roll});
}
const sinking=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0},async u=>new Response(await readFile(u)));
for(let i=0;i<400;i++)sinking.advance(.005);
sinking.set('motorCut',1);
let lowest=5;
for(let i=0;i<8500;i++){
  sinking.advance(.005);
  lowest=Math.min(lowest,sinking.get('position')[2]);
}
const bottom=sinking.get('position')[2];
console.log({lowest,bottom});
assert(Math.abs(bottom+13.61)<.03 && lowest>-13.71);
assert(sinking.get('immersed')>.99 && Math.max(...sinking.get('rotorSpeed'))<.01);
