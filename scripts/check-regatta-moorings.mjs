// Exercise the shipped Modelica moorings in calm water, wind, current and a contact impulse.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {raceCoursePoints,raceTarget} from '../viewer/regatta.mjs';
const read=async url=>new Response(await readFile(url));
const race=await loadInstance('Regatta',{windBearing:0},read);
const anchors=race.get('anchorPosition'),lengths=race.get('rode'),layout=raceCoursePoints(race);
const advance=steps=>{for(let i=0;i<steps;i++)race.advance(.05);};
advance(40);
assert.deepEqual(race.get('mooringTension'),[0,0,0,0]);
assert.deepEqual(raceCoursePoints(race),layout);
for(let i=0;i<4;i++)assert(anchors[3*i+2]<-1);
race.set('mooringWind',[9,3]);race.set('mooringCurrent',[.35,.18]);
advance(10);
assert(race.get('deckState')[7]>0);
assert(race.get('markVelocity').every(v=>v>0));
assert.deepEqual(race.get('mooringTension'),[0,0,0,0],'Bodies must start moving while the rodes remain slack');
advance(2390);
const tensions=race.get('mooringTension'),ends=race.get('fairlead');
const moved=raceCoursePoints(race).map((v,i)=>v-layout[i]);
for(let i=0;i<4;i++){
  assert(Math.hypot(moved[2*i],moved[2*i+1])>1);
  assert(tensions[i]>50);
  const length=Math.hypot(...ends.slice(3*i,3*i+3).map((v,j)=>v-anchors[3*i+j]));
  assert(length>lengths[i]&&length<1.03*lengths[i]);
}
assert.deepEqual(race.get('anchorPosition'),anchors);
const [east,north,,yaw,,,ve,vn]=race.get('deckState');
assert(Math.abs(yaw-Math.PI)>.1&&Math.hypot(ve,vn)<.06);
const [pinEast,pinNorth]=raceCoursePoints(race);
assert.equal(raceTarget(race,1,(east+pinEast)/2,(north+pinNorth)/2),null);
race.set('landingReaction',[1000,0,0,0,0,900]);
advance(5);
assert(race.get('deckState')[6]>ve+.07&&race.get('deckState')[11]>.02,
  'A contact load at the launch must change translation and yaw');
const scorer=await loadInstance('Regatta',{windBearing:0,externalCourse:1,
  coursePoints:[100,200,50,250,110,300,140,200],utc:299,raceStart:300},read);
function cross(x,y,utc){
  scorer.set('east',x);scorer.set('north',y);scorer.set('utc',utc);scorer.advance(.05);
  return scorer.get('stage');
}
cross(120,198,299);assert.equal(cross(120,199,300),1);
assert.equal(cross(120,201,301),2,'The secondary racer must use the live gate orientation and position');
for(let i=0;i<100;i++)scorer.advance(.05);
assert.deepEqual(scorer.get('mooringTension'),[0,0,0,0],
  'A scoring-only coordinate override must not stretch the physical lines');
console.log('Four seabed anchors, slack and tension, contact and moving-line scoring passed.',
  {tensionN:tensions.map(Math.round),excursionM:Array.from({length:4},(_,i)=>+Math.hypot(moved[2*i],moved[2*i+1]).toFixed(2))});
