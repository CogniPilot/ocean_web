// One shared WASI reactor for independent physical states and one for policies.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareInstance} from '../viewer/fmi3/instance.mjs';
import {loadSwimPolicy} from '../viewer/diver-swim-policy.mjs';

const read=async url=>new Response(await readFile(url));
const wasmHeaps=[];
const instantiate=WebAssembly.instantiate;
WebAssembly.instantiate=async (...args)=>{
  const result=await instantiate(...args);
  wasmHeaps.push((result.instance??result).exports.memory);
  return result;
};
const factory=await prepareInstance('ScubaDiver',read,true);
const lanes=[];
const poses=Array.from({length:64},(_,i)=>[i,0,-5-.1*i,0,0,0,0,0,0,0,0,0,0,0,0,0]);
const standalone=await prepareInstance('ScubaDiver',read);
const start=performance.now();
for(const [i,pose] of poses.entries()){
  const inputs={initialState:pose,bedHeight:-80,meshCollision:1,policyMode:1,neutralTrim:1};
  const model=await factory(inputs);
  const policy=await loadSwimPolicy(read);
  const drive=i%2?1:-.35;
  policy.command([0,0,0],drive,0);
  policy.restoreTrim(pose);
  lanes.push({model,policy,inputs,drive});
}
const loaded=performance.now();
assert.equal(wasmHeaps.length,2,'expected one plant reactor and one controller reactor for the batch');
const heapMiB=wasmHeaps.map(memory=>memory.buffer.byteLength/1048576);
const oracle=await standalone(lanes[11].inputs);
for(const lane of lanes){
  const s=lane.model.get('state');
  lane.policy.decide(s);
}
for(let tick=0;tick<4;tick++){
  for(const [index,lane] of lanes.entries()){
    const s=lane.model.get('state');
    assert.equal(lane.model.time,tick*.01);
    assert(Math.abs(s[0]-index)<.01 && Math.abs(s[2]-poses[index][2])<.01);
    assert.equal(Math.sign(lane.policy.targets()[0]),Math.sign(lane.drive),'policy command crossed lanes');
    lane.policy.stroke(lane.model,s);
    lane.model.advance(.01);
  }
}
const control=await loadSwimPolicy(read);
control.command([0,0,0],lanes[11].drive,0);control.restoreTrim(poses[11]);
control.decide(oracle.get('state'));
for(let tick=0;tick<4;tick++){control.stroke(oracle,oracle.get('state'));oracle.advance(.01);}
assert.deepEqual(lanes[11].model.get('state'),oracle.get('state'));
const stepped=performance.now();
for(const lane of lanes){lane.model.close();lane.policy.dispose();}
control.dispose();
assert.throws(()=>lanes[63].model.get('state'),/closed/);
assert.throws(()=>lanes[63].policy.targets(),/closed/);
const reused=await factory(lanes[3].inputs);
assert.deepEqual(reused.get('state'),poses[3]);reused.close();
console.log('64 independent diver and policy lanes, signed commands, reference trajectory, disposal and reset passed.',{loadMs:loaded-start,heapMiB,steps:256,stepMs:stepped-loaded});

// Older Emscripten plants fill in the options object with the reactor exports.
// Each lane needs its own options object and memory, while reusing the WASM bytes.
const manta=await prepareInstance('MantaRay',read,true);
const left=await manta({initialState:[-4,0,-6,1,0,0,0,0,0,0,0,0,0,.34,0,60]});
const right=await manta({initialState:[9,0,-6,1,0,0,0,0,0,0,0,0,0,.34,0,60]});
assert.equal(left.get('state')[0],-4);
right.advance(.01);left.advance(.01);
assert(Math.abs(left.get('state')[0]+4)<.1&&Math.abs(right.get('state')[0]-9)<.1);
left.close();right.close();
console.log('Independent Emscripten training lanes passed.');
