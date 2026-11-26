// Check signed wind conventions and the mapping from each policy action to rig hardware.
import assert from 'node:assert/strict';
import {sailTrainingTasks} from '../viewer/sail-training-tasks.mjs';

const [hobie,sloop]=sailTrainingTasks;
const values={heading:0,ve:2,vn:0,windEast:0,windNorth:-5,heel:0,yawRate:0,payout:.3};
const model={get:key=>values[key],set:(key,value)=>{values[key]=value;}};
for(const tack of [1,-1]){
  values.windNorth=-5*tack;
  const target={pointOfSail:tack*Math.PI/2};
  const obs=hobie.observe(model,target);
  assert.equal(obs.length,hobie.featureNames.length);
  assert.equal(obs[1],5/12);assert.equal(obs[2],tack);
  assert(Math.abs(obs[4]-Math.hypot(2,5)/15)<1e-12);
  assert(Math.abs(obs[5]-tack*5/Math.hypot(2,5))<1e-12);
  assert(Math.abs(obs[7])<1e-12 && obs[8]===1);
  assert.equal(hobie.reward(model,target),.5);
}
const controls=['rudderInput','trimInput','mainCarInput','jibCarInput','jibTrimInput','downhaulInput','outhaulInput','jibHalyardInput','ballastCmdX','ballastCmdY'];
for(const task of [hobie,sloop]){
  const keys=task===hobie?controls:[...controls.slice(0,2),'vangInput'];
  const baseline=Array(keys.length).fill(0);
  const read=actions=>{
    const written=new Map();
    task.act({set:(key,value)=>written.set(key,value)},null,actions);
    assert.deepEqual([...written.keys()],keys);
    return [...written.values()];
  };
  const midpoint=read(baseline);
  for(let i=0;i<keys.length;i++){
    const command=baseline.slice();command[i]=1;
    const changes=read(command).map((v,j)=>v-midpoint[j]);
    assert(changes[i]>0,keys[i]);
    assert(changes.every((d,j)=>j===i||d===0),keys[i]);
  }
}
console.log('Signed true/apparent wind on both tacks and all sailing policy channels passed.');
