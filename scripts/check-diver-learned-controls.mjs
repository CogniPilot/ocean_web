import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.env.DIVER_RL_RUNTIME?pathToFileURL(resolve(process.env.DIVER_RL_RUNTIME,'instance.mjs')):
  new URL('../viewer/fmi3/instance.mjs',import.meta.url);
const {loadInstance}=await import(runtime);
import {decisionSteps,loadSwimPolicy} from '../viewer/diver-swim-policy.mjs';

const read=async url=>new Response(await readFile(url));
const weights=process.env.DIVER_RL_WEIGHTS?JSON.parse(await readFile(process.env.DIVER_RL_WEIGHTS)).weights:undefined;
const flow=[0,0,0],drive=.65;
async function swim(pitch,roll,turn){
  const controller=await loadSwimPolicy(read,weights);
  const initialState=[0,0,-12,0,0,0,0,0,0,0,0,0,.2,0,0,0];
  const model=await loadInstance('ScubaDiver',{initialState,bedHeight:-90,
    policyMode:1,meshCollision:1,pilot:[1,turn,pitch,drive,roll]},read);
  let held;
  for(let tick=0;tick<500;tick++){
    const state=model.get('state'),pressed=tick<300;
    controller.command(flow,drive,turn,pressed?pitch:0,pressed?roll:0);
    if(tick%decisionSteps===0)controller.decide(state);
    controller.stroke(model,state);
    model.advance(.01);
    if(tick===299)held=model.get('state').slice(7,9);
  }
  const released=model.get('state').slice(7,9);
  assert.ok([...held,...released].every(Number.isFinite));
  return {held,released};
}

for(const sign of [-1,1]){
  const pitch=await swim(sign,0,0),roll=await swim(0,sign,0);
  const mixed=await swim(.65*sign,.65*sign,.35*sign);
  assert.ok(sign*pitch.held[0]>.25,'commanded pitch sign');
  assert.ok(sign*roll.held[1]>.35,'commanded roll sign');
  assert.ok(sign*mixed.held[0]>.1&&sign*mixed.held[1]>.15,'simultaneous fin control');
  assert.ok(Math.abs(pitch.released[0]-pitch.held[0])<.25,'released pitch trim');
  console.log({sign,pitch,roll,mixed});
}
