// Exercise the shipped Modelica moorings in calm water, wind, current and a contact impulse.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {raceCoursePoints,raceGateEnds,raceTarget} from '../viewer/regatta.mjs';
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
const [east,north,,yaw,roll,pitch,ve,vn]=race.get('deckState');
assert(Math.abs(yaw-Math.PI)>.1&&Math.hypot(ve,vn)<.06);
const [pinSightEast,pinSightNorth,mastSightEast,mastSightNorth]=raceGateEnds(race);
const mast=race.get('committeeMastTop');
const mastX=race.has('committeeMastX')?race.get('committeeMastX'):0;
assert(Math.abs(mastSightEast-east-mastX*Math.cos(yaw)*Math.cos(pitch)-mast*(-Math.cos(yaw)*Math.sin(pitch)*Math.cos(roll)+Math.sin(yaw)*Math.sin(roll)))<1e-6);
assert(Math.abs(mastSightNorth-north-mastX*Math.sin(yaw)*Math.cos(pitch)-mast*(-Math.sin(yaw)*Math.sin(pitch)*Math.cos(roll)-Math.cos(yaw)*Math.sin(roll)))<1e-6);
assert.equal(raceTarget(race,1,(mastSightEast+pinSightEast)/2,(mastSightNorth+pinSightNorth)/2),null);
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
const rocking=await loadInstance('Regatta',{windBearing:0,externalCourse:1,
  coursePoints:[100,200,50,250,110,300,140,200],courseGateEnds:[100,200,140,204],
  east:120,north:199,utc:299,raceStart:300},read);
rocking.set('utc',300);rocking.advance(.05);
rocking.set('north',201);rocking.set('utc',301);rocking.advance(.05);
assert.equal(rocking.get('stage'),1,'Crossing the body-center line does not cross the sighted line');
rocking.set('courseGateEnds',[100,200,140,202]);rocking.set('north',202);rocking.set('utc',302);rocking.advance(.05);
assert.equal(rocking.get('stage'),2,'Crossing the rotating line between the pin and staff counts');
assert(Math.abs(rocking.get('lapTime')-.5)<.001,'Crossing time accounts for both the racer and sighting point motion');
function moveRocking(east,north,utc){
  rocking.set('east',east);rocking.set('north',north);rocking.set('utc',utc);rocking.advance(.05);
  return rocking.get('stage');
}
const course=[[120,201],[50,250],[110,300],[120,201]];
for(let i=1;i<=2;i++){
  const [before,mark,after]=course.slice(i-1,i+2);
  const outside=Math.atan2(2*mark[1]-before[1]-after[1],2*mark[0]-before[0]-after[0]);
  for(const side of [-.3,.3]){
    const stage=moveRocking(mark[0]+6*Math.cos(outside+side),mark[1]+6*Math.sin(outside+side),310+10*i+side);
    assert.equal(stage,i+(side<0?1:2));
  }
}
assert.equal(moveRocking(120,203,350),4);
rocking.set('courseGateEnds',[100,200,140,204]);
assert.equal(moveRocking(120,201,352),5,'The finish uses the same moving sighted line');
assert(Math.abs(rocking.get('finishUtc')-(350+4/3))<.002);
console.log('Four seabed anchors, slack and tension, contact and moving-line scoring passed.',
  {tensionN:tensions.map(Math.round),excursionM:Array.from({length:4},(_,i)=>+Math.hypot(moved[2*i],moved[2*i+1]).toFixed(2))});
