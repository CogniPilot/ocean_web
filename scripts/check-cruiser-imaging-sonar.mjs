import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nearestSonarContact,imagingBeepInterval} from '../viewer/cruiser-sonar.mjs';
import {sonarFaces,sonarHalfBearing,sonarMount,sonarRanges} from '../viewer/cruiser-sonar-view.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const model=await loadInstance('CruiserImagingSonar',{},async url=>new Response(await readFile(url)));
const fish=new Float64Array(36*4),animals=new Float64Array(40),tolerance=1e-6;
function largeContact(rows){
  const points=[];
  for(let i=0;i<rows.length;i+=4){
    const [r,b,e,kind]=rows.slice(i,i+4);
    if(kind)points.push({r,kind,beam:i/4,xyz:[r*Math.cos(e)*Math.cos(b),r*Math.cos(e)*Math.sin(b),r*Math.sin(e)]});
  }
  return nearestSonarContact(points);
}
function scan(pose,targets=fish){
  model.set('pose',pose);model.set('waterLevel',0);model.set('fish',targets);model.set('animals',animals);return model.get('returns');
}
const pose=[-55,-38,0,0,0,0];
model.set('rangeLimit',36);model.set('halfBearing',55*Math.PI/180);
let rows=scan(pose);
assert(Math.abs(rows[40]-(13.7+sonarMount[2])/Math.sin(Math.PI/3))<tolerance);
assert.equal(rows[43],1);
assert.equal(largeContact(rows),null,'Flat seafloor qualified as a large return');
function target(slot,pose,position){
  const mount=new T.Vector3(...sonarMount).add(new T.Vector3(...position));
  mount.applyEuler(new T.Euler(...pose.slice(3),'ZYX')).add(new T.Vector3(...pose.slice(0,3)));
  fish.set([1,...mount.toArray()],slot*4);
}
const attitude=[-55,-38,0,.12,-.07,1.3];
target(0,attitude,[8,2,-4]);target(1,attitude,[-7,0,-2]);
target(2,attitude,[11,0,-19]);target(3,attitude,[47,0,-5]);
rows=scan(attitude);
assert.equal(largeContact(rows),null,'A lone baitfish triggered the large-target alarm');
const offset=231*4;
for(const [i,v] of [Math.sqrt(84),Math.atan2(2,8),Math.atan2(-4,Math.hypot(8,2)),3].entries())
  assert(Math.abs(rows[offset+i]-v)<tolerance);
for(const i of [1,2,3])assert.equal(rows[offset+4*i+3],0,'out-of-aperture, occluded or distant target returned');
fish[0]=0;assert.equal(scan(attitude)[offset+3],0,'depleted fish returned');
assert(scan([-55,-38,2,0,0,0]).every(v=>v===0),'A dry transducer produced returns');
fish.fill(0);
target(0,pose,[4,0,-1]);target(1,pose,[4,.5,-1]);target(2,pose,[4,1,-1]);
const schoolRange=largeContact(scan(pose));
assert(Math.abs(schoolRange-Math.sqrt(17))<tolerance,'A coherent bait school should register');
fish[8]=0;assert.equal(largeContact(scan(pose)),null,'An undersized bait school triggered the alarm');
animals.set(fish.slice(0,4));fish.fill(0);
assert(Math.abs(largeContact(scan(pose))-schoolRange)<tolerance,'Single large animal did not register');
animals.fill(0);
const stern=[-8,0,0,0,0,0];
const start=performance.now();
rows=scan(stern);
const structures=rows.filter((v,i)=>i%4===3&&v===2).length;
assert(structures>3,'Forward beams missed the wreck');
const nearRange=largeContact(rows),farRange=largeContact(scan([-22,0,0,0,0,0]));
assert(nearRange>0&&farRange>nearRange&&imagingBeepInterval(nearRange)<imagingBeepInterval(farRange));
assert(largeContact(scan(pose))===null,'Alarm continued after all qualifying contacts left the aperture');
for(let i=0;i<16;i++)scan([stern[0]+i*.1,0,0,0,0,0]);
const wreckPingMs=(performance.now()-start)/17;
rows=scan([10,40,0,0,0,0]);
const nearShore=rows.filter((v,i)=>i%4===0&&v>.1&&v<12).length;
assert(nearShore>10,'Island approach did not return sloping ground');

model.set('halfBearing',sonarHalfBearing);
for(const range of sonarRanges){
  model.set('rangeLimit',range);
  const echoes=scan(pose),points=[];
  for(let i=0;i<echoes.length;i+=4){
    const [r,b,e,kind]=echoes.slice(i,i+4);
    if(!kind)continue;
    assert(r<range&&Math.abs(b)<=sonarHalfBearing+tolerance);
    points.push({r,kind,beam:i/4,xyz:[r*Math.cos(e)*Math.cos(b),r*Math.cos(e)*Math.sin(b),r*Math.sin(e)]});
  }
  assert(points.some(p=>p.r>.9*range&&p.kind===1),'Grazing beams did not reach the selected range');
  assert(sonarFaces(points).some(face=>face.every(p=>p.kind===1)),'The measured seabed should produce a surface');
}
target(0,pose,[10,9.9,-3]);
target(1,pose,[10,10.1,-3]);
rows=scan(pose);
assert.equal(rows[offset+3],3,'A target just inside 45 degrees should return');
assert.equal(rows[offset+7],0,'A target just outside 45 degrees should be excluded');
const corner=(beam,xyz)=>({beam,kind:1,xyz,r:10});
assert.equal(sonarFaces([corner(0,[3,1,-1]),corner(2,[3,3,-1]),corner(21,[4,1,-1])]).length,0,
  'The seabed must leave gaps for missing beams');
console.log({structures,nearShore,wreckPingMs,schoolRange,nearRange,farRange,nearIntervalMs:imagingBeepInterval(nearRange),farIntervalMs:imagingBeepInterval(farRange)});
