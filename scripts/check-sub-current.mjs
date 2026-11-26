import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {marineSnow} from '../viewer/marine-snow.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {sampleCurrent} from '../viewer/physics-view.mjs';

const read=async url=>new Response(await readFile(url));
const probe=await loadInstance('CurrentProbe',{},read);
const fields=['ocean.tide','ocean.wind','ocean.bearing','ocean.tidalEast'];
for(const position of [[-5,0,-8],[14,0,-8],[14,7,-2]]){
  const plant=await loadInstance('Wreck_Plant',{spawnPosition:position,windSpeed:8,windDirection:-.56},read);
  const frame=sampleCurrent(probe,position,plant.getMany(fields));
  assert.deepEqual(frame.dimensions,[5,5,5]);
  const mean=plant.get('ocean.meanCurrent');
  assert(mean.every((v,i)=>Math.abs(frame.velocity[3*62+i]-v)<1e-10));
  const orbital=plant.get('ocean.probe').slice(1,4),total=plant.get('current');
  assert(mean.every((v,i)=>Math.abs(v+orbital[i]-total[i])<1e-10));
  assert(frame.velocity.every(Number.isFinite));
  assert(frame.velocity[3*112]>frame.velocity[3*12]);
}
console.log('Three 125-point water-current volumes match the ambient velocity used for Piccard drag at the vehicle.');

const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js'),scene=new T.Scene();
const env=[.21,7,.5,.12];
for(const mobile of [true,false]){
  const eye=new T.Vector3(2,4,-9),sediment=marineSnow(T,scene,mobile);
  sediment.update(0,eye,0,1,probe,env,[0,0,0]);
  const particles=scene.getObjectByName('Suspended sediment');
  const p=particles.geometry.attributes.position.array;
  assert.equal(p.length,(mobile?750:1500)*3);
  const before=p.slice(),dimensions=125*3,dt=.1;
  for(let start=0;start<p.length;start+=dimensions){
    probe.set('points',before.subarray(start,start+dimensions));
    const v=probe.get('velocity');
    if(start===0)sediment.update(dt,eye,0,1,probe,env,[0,0,0]);
    for(let i=0;i<dimensions;i++){
      const travel=p[start+i]-before[start+i]-dt*v[i];
      assert(Math.abs(travel-13*Math.round(travel/13))<2e-6,'tracer velocity at its sample depth');
    }
  }
  const parked=p.slice();
  sediment.update(dt,eye,0,1,probe,env,[0,0,0]);assert.deepEqual(p,parked);
  eye.z=1;sediment.update(.2,eye,0,1,probe,env,[0,0,0]);assert.equal(particles.visible,false);
  sediment.dispose();assert.equal(scene.children.length,0);
}
console.log('All 750 mobile and 1,500 desktop tracers follow the Modelica velocity at their depth, freeze on pause and disappear above water.');
