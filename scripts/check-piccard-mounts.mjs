// Check the released Modelica plant against the mount table embedded in the visible shell.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const asset=await readFile(new URL('../viewer/assets/survey-pressure-housing.glb',import.meta.url));
const json=JSON.parse(asset.subarray(20,20+asset.readUInt32LE(12)).toString());
const frame=json.nodes.find(node=>node.name==='PiccardFrame');
const {mounts,axes}=JSON.parse(frame.extras.thrusterLayout);
const plant=await loadInstance('Wreck_Plant',{},async url=>new Response(await readFile(url)));
assert.deepEqual(mounts.flat(),Array.from(plant.get('propMount')));
assert.deepEqual(axes.flat(),Array.from(plant.get('propAxis')));
assert.equal(mounts.length,6);
assert(axes.every(axis=>axis[1]===0));
for(const side of [0,1]){
  const [drive,mid,aft]=[side,side+2,side+4];
  assert(mounts[drive][0]>mounts[mid][0] && mounts[mid][0]>mounts[aft][0]);
  assert.deepEqual(axes[drive],[1,0,0]);
  assert.deepEqual(axes[mid],[0,0,1]);
  assert.deepEqual(axes[aft],[0,0,1]);
}
plant.set('manual',1);
plant.set('pilot',[0,0,0,.2]);
plant.advance(.01);
const lift=Array.from(plant.get('cmd')).slice(2);
const verticalMounts=mounts.slice(2,6);
const torque=axis=>lift.reduce((sum,force,i)=>sum+force*verticalMounts[i][axis],0);
assert(lift.every(force=>force>0 && force<14));
assert(Math.abs(lift.reduce((a,b)=>a+b,0)-plant.get('heave'))<1e-9);
assert(Math.abs(torque(1)-plant.get('rollCmd'))<1e-9);
assert(Math.abs(-torque(0)-plant.get('pitchCmd'))<1e-9);
console.log('Six mount positions and shaft directions agree between the exported shell and plant.');
