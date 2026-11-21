// Exercise the shipped WebAssembly scorer with a rotated course and timed crossings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lapTable,lapClock} from '../viewer/lap-board.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {raceTarget} from '../viewer/regatta.mjs';
import {sailingStart,startGate} from '../viewer/sailing-start.mjs';
const read=async url=>new Response(await readFile(url));
for(const angle of [Math.atan2(4,10),Math.PI/2,-2.5]){
  const race=await loadInstance('Regatta',{...startGate,windBearing:angle,utc:299},read);
  const position=label=>[race.get(label+'East'),race.get(label+'North')];
  const pin=position('pin'),committee=position('committee'),center=position('gate');
  const dx=committee[0]-pin[0],dy=committee[1]-pin[1],length=Math.hypot(dx,dy);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
  near(length,startGate.lineLength);
  for(const cat of [true,false]){
    const start=sailingStart(cat,angle);
    const offset=[start.launchEast-center[0],start.launchNorth-center[1]];
    const down=offset[0]*Math.cos(angle)+offset[1]*Math.sin(angle);
    near(down,14);
    const distance=-down/Math.cos(start.launchHeading-angle);
    assert(distance>0);
    const crossing=Math.hypot(offset[0]+distance*Math.cos(start.launchHeading),offset[1]+distance*Math.sin(start.launchHeading));
    assert(length/2-crossing>15);
  }
  near(dx*Math.cos(angle)+dy*Math.sin(angle),0);
  const east=race.get('markEast'),north=race.get('markNorth');
  const marks=east.map((v,i)=>[v,north[i]]);
  for(const [stage,label,point] of [[0,'Start',center],[1,'Start',center],[2,'Mark 1',marks[0]],
    [3,'Mark 2',marks[1]],[4,'Finish',center]]){
    const target=raceTarget(race,stage,point[0]-3,point[1]-4);
    assert.equal(target.label,label);assert.equal(target.bearing,'037°T');near(target.range,5);
    near(target.angle,Math.atan2(4,3));
    assert.equal(raceTarget(race,stage,...point),null);
  }
  assert.equal(raceTarget(race,5,...center),null);
  const points=[center,...marks,center];
  for(let i=1;i<points.length;i++)near(Math.hypot(...points[i].map((v,j)=>v-points[i-1][j])),200);
  const move=(p,t)=>{
    race.set('east',p[0]);race.set('north',p[1]);race.set('utc',t);race.advance(.05);
    return race.get('stage');
  };
  const gate=(up,cross)=>[center[0]-up*Math.cos(angle)+cross*dx/length,center[1]-up*Math.sin(angle)+cross*dy/length];
  move(gate(-2,length/2+3),299);
  assert.equal(move(gate(-1,length/2+3),300),1);
  assert.equal(move(gate(1,length/2+3),301),1);
  assert.equal(move(gate(-1,0),302),1);
  assert.equal(move(gate(1,0),303),2);
  for(let mark=0;mark<2;mark++){
    const [arrival,apex,departure]=points.slice(mark,mark+3);
    const outside=Math.atan2(2*apex[1]-arrival[1]-departure[1],2*apex[0]-arrival[0]-departure[0]);
    const point=(side,distance)=>apex.map((coordinate,i)=>coordinate+distance*
      (i===0?Math.cos(outside+side):Math.sin(outside+side)));
    const time=320+mark*30,current=mark+2;
    const clearance=mark===0?4:7;
    assert.equal(move(point(-.3,24),time),current);
    assert.equal(move(point(.3,24),time+1),current,'A distant pass should not count');
    assert.equal(move(point(.3,clearance),time+2),current);
    assert.equal(move(point(-.3,clearance),time+3),current,'A starboard crossing should not count');
    assert.equal(move(point(.3,clearance),time+4),current+1,'A port rounding with clearance should count');
  }
  assert.equal(move(gate(-1,0),390),5);
  near(race.get('elapsed'),90);
  near(race.get('lapTime'),87);
  assert.equal(move(gate(-2,0),399),5);
  near(race.get('lapTime'),87);
}
console.log('Three wind bearings passed start, port roundings at 4 m and 7 m, finish and lap time.');
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

// Force the marks with a local travelling swell after still-water equilibrium.
const marks=await loadInstance('Regatta',{swellHeight:0},read);
marks.advance(.1);
assert(marks.get('markPose').every(v=>Math.abs(v)<1e-8));
marks.set('swellHeight',.30);
const lo=Array(9).fill(Infinity),hi=Array(9).fill(-Infinity);
let difference=0;
for(let step=0;step<220;step++){
  marks.advance(.05);
  const p=marks.get('markPose');
  if(step<80)continue;
  p.forEach((v,i)=>{lo[i]=Math.min(lo[i],v);hi[i]=Math.max(hi[i],v);});
  difference=Math.max(difference,Math.abs(p[0]-p[3]));
}
for(let i=0;i<9;i++){
 const travel=hi[i]-lo[i];
 assert(travel>(i%3===0?.35:.03) && travel<(i%3===0?.9:.5),JSON.stringify({i,travel}));
}
assert(difference>.1);
console.log({markRanges:hi.map((v,i)=>v-lo[i]),difference});

// Ranking uses the same tenth-second precision as the race clock. Replayed
// peer snapshots and simultaneous browser sessions must preserve each finish.
const items=new Map();
const storage={
  get length(){return items.size;},
  key:i=>Array.from(items.keys())[i],
  getItem:key=>items.get(key),
  setItem:(key,value)=>items.set(key,value),
  removeItem:key=>items.delete(key)
};
const table=()=>lapTable(storage,'room/regatta','Hobie16');
const first=table(),second=table();
const finish=i=>({id:i.toString(16).padStart(32,'0'),captain:'Captain Kai',tenths:700+i});
for(let i=0;i<12;i++)(i%2?first:second).add([finish(i)]);
const ranked=table();
assert.deepEqual(ranked.rows,Array.from({length:10},(_,i)=>finish(i)));
assert.equal(items.size,10);
assert.equal(ranked.add([finish(0)]),false);
assert.equal(ranked.add([{...finish(0),tenths:NaN}]),false);
assert.equal(ranked.add([{...finish(20),tenths:-1}]),false);
assert.equal(ranked.add(Array(11).fill(finish(20))),false);
assert.equal(lapTable(storage,'room/regatta','Sailboat').rows.length,0);
assert.equal(lapTable(storage,'room/private','Hobie16').rows.length,0);
assert.equal(lapTable(storage,'personal','Hobie16').rows.length,0);
assert.equal(lapClock(600),'1:00.0');
assert.equal(lapClock(599),'0:59.9');
console.log('Lap leaderboard passed ordering, persistence, top-ten limit, replay and room/hull isolation.');
