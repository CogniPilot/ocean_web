// Exercise the shipped WebAssembly scorer with a rotated course and timed crossings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
for(const angle of [Math.atan2(4,10),Math.PI/2,-2.5]){
  const race=await loadInstance('Regatta',{windBearing:angle,utc:299},read);
  const position=label=>[race.get(label+'East'),race.get(label+'North')];
  const pin=position('pin'),committee=position('committee'),center=position('gate');
  const dx=committee[0]-pin[0],dy=committee[1]-pin[1],length=Math.hypot(dx,dy);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
  near(length,40);
  near(dx*Math.cos(angle)+dy*Math.sin(angle),0);
  const east=race.get('markEast'),north=race.get('markNorth');
  const marks=east.map((v,i)=>[v,north[i]]);
  const points=[center,...marks,center];
  for(let i=1;i<points.length;i++)near(Math.hypot(...points[i].map((v,j)=>v-points[i-1][j])),200);
  const move=(p,t)=>{
    race.set('east',p[0]);race.set('north',p[1]);race.set('utc',t);race.advance(.05);
    return race.get('stage');
  };
  const gate=(up,cross)=>[center[0]-up*Math.cos(angle)+cross*dx/length,center[1]-up*Math.sin(angle)+cross*dy/length];
  move(gate(-2,23),299);
  assert.equal(move(gate(-1,23),300),1);
  assert.equal(move(gate(1,23),301),1);
  assert.equal(move(gate(-1,0),302),1);
  assert.equal(move(gate(1,0),303),2);
  assert.equal(move(marks[0],330),3);
  assert.equal(move(marks[1],360),4);
  assert.equal(move(gate(-1,0),390),5);
  near(race.get('elapsed'),90);
}
console.log('Three wind bearings passed course geometry, start, both marks, finish and elapsed time.');
const launch=await loadInstance('Regatta',{windBearing:-Math.PI},read);
const settle=seconds=>{for(let i=0;i<seconds*20;i++)launch.advance(.05);};
const pose=()=>Array.from(launch.get('launchPose'));
settle(2);
assert.ok(pose().every(v=>Math.abs(v)<1e-6),'balanced in still water');
launch.set('tide',.25);
settle(6);
assert.ok(Math.abs(pose()[0]-.25)<1e-3,'follows tide');
const e=launch.get('committeeEast'),n=launch.get('committeeNorth');
const waves=Float64Array.from({length:4096},(_,k)=>
  .15*Math.sin(2*Math.PI*(k%64-e)/64)+.12*Math.sin(2*Math.PI*(Math.floor(k/64)-n)/64));
launch.set('wakeTile',waves);
settle(6);
assert.ok(pose()[1]>.009 && pose()[2]>.012,'heels and pitches toward the local wake slope');
launch.set('wakeTile',new Float64Array(4096));
settle(6);
assert.ok(pose().slice(1).every(v=>Math.abs(v)<1e-3),'settles after the wake passes');
console.log('Committee launch passed still water, tide, oblique wake and settling checks.');
