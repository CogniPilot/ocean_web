import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {sampleCurrent} from '../viewer/physics-view.mjs';

const read=async url=>new Response(await readFile(url));
const probe=await loadInstance('CurrentProbe',{},read);
const fields=['ocean.tide','ocean.wind','ocean.bearing','ocean.tidalEast'];
for(const position of [[-5,0,-8],[14,0,-8],[14,7,-2]]){
  const plant=await loadInstance('Wreck_Plant',{'body.r_0':position,windSpeed:8,windDirection:-.56},read);
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
