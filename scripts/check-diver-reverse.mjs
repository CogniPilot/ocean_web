import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {decisionSteps,loadSwimPolicy} from '../viewer/diver-swim-policy.mjs';

const directory=process.env.DIVER_RL_RUNTIME;
const {loadInstance}=await import(directory?pathToFileURL(resolve(directory,'instance.mjs')):new URL('../viewer/fmi3/instance.mjs',import.meta.url));
const weights=process.env.DIVER_RL_WEIGHTS?JSON.parse(await readFile(process.env.DIVER_RL_WEIGHTS)).weights:undefined;
const read=async url=>new Response(await readFile(url));
const controller=await loadSwimPolicy(read,weights);
const current=[0,0,0],mixed=[-.62,.40,.24,-.2];
for(const axes of [mixed,[1,-1,1,1],[0,0,0,0]]){
  controller.command(current,...axes,false);
  const normal=controller.targets();
  controller.command(current,...axes,true);
  const fast=controller.targets();
  assert.deepEqual(fast,normal.map(x=>2*x),'double all signed requests');
}

async function swim(drive,fast,handsOnly=false){
  const start=[0,0,-10,0,0,0,0,0,0,0,0,0,.17,0,0,0];
  const model=await loadInstance('ScubaDiver',{initialState:start,bedHeight:-90,meshCollision:1,policyMode:1,
    pilot:[1,0,0,drive,0],sprint:Number(fast)},read);
  const control=await loadSwimPolicy(read,weights);
  control.command(current,drive,0,0,0,fast);
  const plant=handsOnly?{set(key,value){
    const target=value.slice();
    if(key==='jointAction'){
      target.fill(0,0,3);
      target.fill(0,5,8);
    }else if(key==='axialAction'){target[0]=0;target[2]=0;}else target.fill(0);
    model.set(key,target);
  }}:model;
  let meanSpeed=0,meanPalm=0;
  for(let i=0;i<650;i++){
    const state=model.get('state');
    if(i%decisionSteps===0)control.decide(state);
    control.stroke(plant,state);model.advance(.01);
    if(i>=300){
      const force=model.get('limbForces');
      meanSpeed+=(state[3]*Math.cos(state[6])+state[4]*Math.sin(state[6]))/350;
      meanPalm+=(force[6]+force[9])/350;
    }
  }
  return {meanSpeed,meanPalm,displacement:model.get('state')[0]};
}
for(const sign of [-1,1]){
  const normal=await swim(sign,false),fast=await swim(sign,true),arms=await swim(sign,true,true);
  assert.ok(sign*normal.displacement>.10&&sign*fast.displacement>.10,'signed motion from rest');
  assert.ok(sign*arms.meanSpeed>.016&&sign*arms.displacement>.06,'arms-only propulsion');
  assert.ok(sign*arms.meanPalm>.04,'actual palm water force');
  console.log({sign,normal,fast,arms});
}
const idle=await swim(0,true);
assert.ok(Math.abs(idle.displacement)<.01,'boost alone cannot start a stroke');
