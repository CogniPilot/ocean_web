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
  near(length,80);
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
  move(gate(-2,length/2+3),299);
  assert.equal(move(gate(-1,length/2+3),300),1);
  assert.equal(move(gate(1,length/2+3),301),1);
  assert.equal(move(gate(-1,30),302),1);
  assert.equal(move(gate(1,30),303),2);
  assert.equal(move(marks[0],330),3);
  assert.equal(move(marks[1],360),4);
  assert.equal(move(gate(-1,0),390),5);
  near(race.get('elapsed'),90);
  near(race.get('lapTime'),87);
  assert.equal(move(gate(-2,0),399),5);
  near(race.get('lapTime'),87);
}
console.log('Three wind bearings passed course geometry, start, both marks, finish and elapsed time.');
const launch=await loadInstance('Regatta',{windBearing:-Math.PI},read);
const settle=seconds=>{for(let i=0;i<seconds*20;i++)launch.advance(.05);};
const pose=()=>Array.from(launch.get('launchPose'));
const anchors=launch.get('mooringPath');
settle(2);
assert.ok(pose().every(v=>Math.abs(v)<1e-4),'launch settles under the weight of its bow line');
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

launch.set('surfaceWind',[8,2]);
launch.set('surfaceFlow',[.3,.1]);
settle(30);
const buoyPositions=launch.get('buoyPosition'),path=launch.get('mooringPath');
for(let body=0;body<4;body++){
  const i=12*body;
  assert.deepEqual(path.slice(i,i+3),anchors.slice(i,i+3),'fixed seabed endpoint');
  assert.equal(path[i+2],-13.7);
  assert.ok(Math.hypot(...path.slice(i+3,i+6).map((v,j)=>v-anchors[i+3+j]))>.1,'submerged link moves');
  const tension=launch.get('rode['+(body+1)+'].tension');
  assert.ok(tension.every(v=>v>=0)&&tension[2]>0,'rode carries tensile load');
  if(body>0){
    const [x,y,z]=buoyPositions.slice(3*(body-1),3*body);
    assert.deepEqual(path.slice(i+9,i+11),[x,y]);
    assert.ok(Math.abs(path[i+11]-z+.1)<1e-9);
    assert.ok(Math.abs(z-.25)<.05,'mark follows tide with loaded rode');
    const excursion=Math.hypot(x-anchors[i+9],y-anchors[i+10]);
    assert.ok(excursion>.2 && excursion<14,'anchored mark swings with wind and current');
  }
}
console.log('Four fixed anchors, moving submerged links, line loads and floating mark positions passed.');

const contactRace=await loadInstance('Regatta',{windBearing:-Math.PI,hullStations:[-2.555,-1.9,-.9,.15,1.12,1.95,2.555],hullWidths:[.09,.156,.185,.184,.155,.093,.009],hullOffset:1.02},read);
const initialEast=contactRace.get('committeeEast'),initialNorth=contactRace.get('committeeNorth');
contactRace.set('racerState',[1,0,0,0,.15,0,-1,0,0,0,0]);
function where(x,y){contactRace.set('east',initialEast+x);contactRace.set('north',initialNorth+y);contactRace.advance(.001);return contactRace.get('contact');}
const far=where(15,0),near=where(2,2.09);
assert.equal(Math.max(...far.map(Math.abs)),0);
assert(near[1]>0 && near[7]<0);
for(let i=0;i<3;i++)assert(Math.abs(near[i]+near[i+6])<1e-7);
const beforeContact=contactRace.get('committeeNorth');
for(let i=0;i<30;i++)contactRace.advance(.01);

assert(contactRace.get('committeeNorth')<beforeContact && Math.abs(contactRace.get('launchHeading'))>.0001);
console.log('Separated hulls are clear and a glancing impact pushes and turns the moored launch.');
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

// Strike each pyramid from both sides. Read the initial forces before stepping,
// then check that the buoy moves under the opposite reaction.
const hulls=[
  {stations:[-2.555,-1.9,-.9,.15,1.12,1.95,2.555], widths:[.09,.156,.185,.184,.155,.093,.009], offset:1.02, track:1.35},
  {stations:[-1.1,-.82,-.3,.18,.63,.98,1.22], widths:[.22,.29,.335,.32,.235,.12,.01], offset:0, track:.62}
];
for(const hull of hulls)for(const index of [0,1,2]){
  for(const side of [-1,1]){
    const mark=await loadInstance('Regatta',{windBearing:-Math.PI,hullStations:hull.stations,
      hullWidths:hull.widths,hullOffset:hull.offset},read);
    const position=mark.get('buoyPosition').slice(3*index,3*index+3);
    const x=position[0],y=position[1]+side*hull.track;
    mark.set('east',x);mark.set('north',y);
    mark.set('racerState',[1,0,0,0,3,0,-side,0,0,0,0]);
    assert(mark.get('racerLoad').every(v=>v===0),'clear above the mark');
    mark.set('racerState',[1,0,0,0,.15,0,-side,0,0,0,0]);
    const wrench=mark.get('markWrench').slice(12*index,12*(index+1));
    const racer=mark.get('racerLoad');
    assert(wrench[1]*side>1,'buoy resists incoming hull');
    for(let i=0;i<3;i++){
      assert(Math.abs(wrench[i]+wrench[i+6])<1e-7);
      assert.equal(racer[i],wrench[i]);
    }
    for(let k=0;k<12;k++)mark.advance(.005);
    assert((mark.get('buoyPosition')[3*index+1]-position[1])*side<0,'mark moves away');
    mark.set('east',x+12);
    assert(mark.get('markWrench').every(v=>v===0),'separation releases contact');
  }
}
console.log('Start pin and both course marks passed port and starboard impacts, clearance and release.');
