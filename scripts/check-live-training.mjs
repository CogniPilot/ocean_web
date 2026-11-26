// Exercise the actual FMI plants, compiled inference and optimizer without a browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {trainLivePolicy} from '../viewer/live-training-worker.mjs';
import {getTrainingTask,trainingTasks,validateTrainingCheckpoint} from '../viewer/live-training-tasks.mjs';
import {openPolicyActor,createPlayablePolicy} from '../viewer/live-policy-actor.mjs';

globalThis.fetch=async url=>new Response(await readFile(url));
const actor=await openPolicyActor();
assert(Math.abs(actor.decide([[.5,1]],[1,.25])[0]-Math.tanh(.75))<1e-12);
assert.deepEqual(actor.decide([[.5,1]],[1,.25],[2],.25,true),[1.25]);
assert.throws(()=>actor.decide([[1,2]],[NaN,0]));

async function run(task,lanes,checkpoint){
  const scores=[],firstPoses=[];
  let firstRound;
  await trainLivePolicy({task:task.id,lanes,rounds:1,checkpoint,backend:'cpu',physics:'cpu',seed:19450727,
    initialization:checkpoint?'current':task.pretrained?'pretrained':'scratch'},message=>{
    if(message.type==='frames'&&message.phase==='exploration'&&message.tick%message.total===0)firstPoses.push(...message.frames);
    if(message.type==='progress'){
      const best=validateTrainingCheckpoint(task,message.checkpoint);
      assert(best.score>=message.baseline&&best.score>=message.candidateScore);
      if(!message.round)firstRound=best;
      scores.push(message.candidateScore);
    }
  });
  assert.equal(scores.length,2);assert(scores.every(Number.isFinite));
  if(lanes===4){
    assert.deepEqual(firstPoses[0],firstPoses[1],'opposing exploration actors must start at the same pose');
    assert.deepEqual(firstPoses[2],firstPoses[3]);
  }
  return {scores,firstRound};
}
const ids=process.argv.slice(2),tasks=ids.length?ids.map(getTrainingTask):trainingTasks;
for(const task of tasks){
  const {scores,firstRound}=await run(task,4);
  assert.throws(()=>validateTrainingCheckpoint(task,{...firstRound,task:'different-task'}));
  assert.throws(()=>validateTrainingCheckpoint(task,{...firstRound,weights:[[null]]}));
  assert.throws(()=>validateTrainingCheckpoint(task,{...firstRound,score:Infinity}));
  // A singleton must serialize the two noise pairs in the same order as a
  // four-lane batch. The held-out validation scenarios stay independent.
  if(task.id==='gull'){
    const resumed=await run(task,1,firstRound);
    resumed.scores.forEach((value,i)=>assert(Math.abs(value-scores[i])<1e-10));
    const controls=[],model={time:0,get:k=>({x:[0,0,10,0,12,0,0,.3],memory:Array(7).fill(0),surfaceMotion:[0,12,0,0,0,0]})[k],
      set:(k,value)=>controls.push([k,value])};
    const apply=createPlayablePolicy(task),target={climb:.4,bank:0,speed:13};
    apply(model,target,firstRound);await new Promise(resolve=>setTimeout(resolve,0));
    assert(apply(model,target,firstRound));
    assert.deepEqual(controls.at(-1),['pilot',[1,0,0,0]]);
    assert.equal(apply(model,target,null),false);
  }
  console.log(task.id,scores.map(n=>n.toFixed(6)).join(' → '));
}
