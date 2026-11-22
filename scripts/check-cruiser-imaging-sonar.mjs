import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nearestSonarContact,imagingBeepInterval} from '../viewer/cruiser-sonar.mjs';
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
let rows=scan(pose);
assert(Math.abs(rows[40]-13.07/Math.sin(Math.PI/3))<tolerance);
assert.equal(rows[43],1);
assert.equal(largeContact(rows),null,'Flat seafloor qualified as a large return');
function target(slot,pose,position){
  const mount=new T.Vector3(1,0,-.63).add(new T.Vector3(...position));
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
console.log({structures,nearShore,wreckPingMs,schoolRange,nearRange,farRange,nearIntervalMs:imagingBeepInterval(nearRange),farIntervalMs:imagingBeepInterval(farRange)});
