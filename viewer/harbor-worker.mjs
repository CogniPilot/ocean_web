import {createPlayablePolicy} from './live-policy-actor.mjs';
import {mantaTask,whaleTask} from './wildlife-training-tasks.mjs';
import {appendDiverRig} from './diver-frame.mjs';
import {decisionSteps,loadSwimPolicy} from './diver-swim-policy.mjs';
import {loadInstance} from './fmi3/instance.mjs';

import {sampleLoads} from './wildlife-loads.mjs';

const models=new Map();
let sharkPolicy;
async function loadSharkPolicy(){
  const response=await fetch(new URL('./assets/shark-policy.json',import.meta.url),{cache:'no-cache'});
  if(!response.ok)throw Error('Could not load the shark swim policy');
  const {weights}=await response.json();
  if(!Array.isArray(weights)||weights.length!==10||!weights.every(Number.isFinite))throw Error('Invalid shark policy weights');
  return weights;
}
const individualModels={manta:'MantaRay',diver:'ScubaDiver'};
const optionalDiverInputs=new Set(['contactRelativeVelocity','contactMomentArm','contactLink','contactWitness','patrolOrigin','meshCollision','meshSelfContact','vestValve','lateralPilot','verticalPilot','torchEquipped']);
const outputs=['state','whale','breathAge','swimmerState','wetSections','impact','fish','guidanceMemory','whaleSources','sharkSources','sharkFin','sharkTrunkFlex','sharkBankState','swimReserve','whaleShapeFrames'];

async function advance({actors,environment,steps}){
  const frames=[];
  const active=new Set(actors.map(actor=>actor.id));
  for(const id of models.keys())if(!active.has(id))models.delete(id);
  for(const actor of actors){
    let model=models.get(actor.id);
    if(!model||actor.seed){
      model=await loadInstance(individualModels[actor.kind]??'HarborTraffic',actor.seed??{});
      if(actor.kind==='diver'){
        model.logSample=model.get('priorLog');
        const resumedAt=actor.seed?.initialState?.[14]??0;
        model.nextLogTime=1-(resumedAt-Math.floor(resumedAt));
      }
      models.set(actor.id,model);
    }
    if(!individualModels[actor.kind]){
      for(const [name,value] of Object.entries(environment))if(model.has(name))model.set(name,value);
    }
    if(actor.inputs.sharkDirect===2){
      if(actor.inputs.sharkPolicyWeights){
        model.shippedSharkPolicy=false;
      }else if(!model.shippedSharkPolicy){
        sharkPolicy??=await loadSharkPolicy();
        model.set('sharkPolicyWeights',sharkPolicy);model.shippedSharkPolicy=true;
      }
    }
    const legacyObservers=actor.inputs.observerIds&&!model.has('observerIds');
    for(const [name,value] of Object.entries(actor.inputs)){
      if((name==='whaleWater'||name==='sharkWater')&&!model.has(name))continue;
      if(legacyObservers&&name==='observerIds')continue;
      if(optionalDiverInputs.has(name)&&!model.has(name))continue;
      if(legacyObservers&&name==='craft'){
        const rows=value.slice();
        for(let i=0;i<rows.length;i+=8)if(actor.inputs.observerIds.includes(rows[i]))rows[i+1]=0;
        model.set(name,rows);
      }else model.set(name,value);
    }
    if(actor.kind==='diver'){
      model.set('policyMode',actor.learned?1:0);
      if(model.has('neutralTrim'))model.set('neutralTrim',actor.learned?1:0);
      if(actor.learned){
        if(!model.swimController||model.policyRevision!==actor.policyRevision){
          model.swimController=await loadSwimPolicy(fetch,actor.swimWeights);
          model.policyRevision=actor.policyRevision;model.swimDecision=undefined;
        }
        if(model.swimDecision===undefined)model.swimController.restoreTrim(model.get('state'));
        const [,turn,pitch,drive,roll]=actor.inputs.pilot;
        model.swimController.command(actor.inputs.currentVelocity,drive,turn,pitch,roll,actor.inputs.sprint>.5,
          actor.inputs.lateralPilot??0,actor.inputs.verticalPilot??0,model.has('torchDeployment')?model.get('torchDeployment')>.5:actor.inputs.torchEquipped>.5);
      }else model.swimDecision=undefined;
    }
    const controls=actor.inputs,whalePolicy=actor.policies?.whale,mantaPolicy=actor.policies?.manta;
    let swimTask,target,checkpoint;
    if(actor.kind==='manta'){
      swimTask=mantaTask;checkpoint=mantaPolicy;
      const [,turn,pitch,effort,roll]=controls.pilot;
      target={speed:3.5*Math.max(0,effort),turn,pitch:.5*pitch,roll:.6*roll,current:controls.currentVelocity};
    }else if(!individualModels[actor.kind]){
      swimTask=whaleTask;checkpoint=whalePolicy;
      if(checkpoint)target={speed:1+2.5*controls.whalePilot[2],turn:controls.whaleTurn,pitch:controls.whalePilot[1],roll:controls.whaleBank};
    }
    if(swimTask&&checkpoint){
      // Each host message is a structured clone. Keep the same policy identity
      // between batches so the actor continues its decision clock.
      const key=JSON.stringify(checkpoint.weights);
      if(model.swimPolicyKey!==key){model.swimPolicyKey=key;model.swimCheckpoint=checkpoint;}
      checkpoint=model.swimCheckpoint;
      model.bestSwimPolicy??=createPlayablePolicy(swimTask);
    }
    for(let step=0;step<steps;step++){
      if(swimTask&&model.bestSwimPolicy){
        const applied=model.bestSwimPolicy(model,target,checkpoint);
        model.set(swimTask===mantaTask?'directDrive':'whaleDirect',Number(applied));
      }
      if(actor.learned){
        const state=model.get('state');
        const decision=Math.floor((state[14]+1e-7)/(.01*decisionSteps));
        if(model.swimDecision!==decision){
          model.swimDecision=decision;
          model.swimController.decide(state);
        }
        model.swimController.stroke(model,state);
      }
      model.advance(.01);
      if(model.logSample && model.time+1e-7>=model.nextLogTime){
        model.logSample=model.get('diveLog');
        model.set('priorLog',model.logSample);
        model.nextLogTime+=1;
      }
    }
    if(individualModels[actor.kind]){
      // A single FMI observation settles algebraic outputs once and gives all
      // channels the same observation instant. Cache the schema per live FMU.
      model.frameFields??=(actor.kind==='diver'
        ? ['state','activity','dive','gauge','upright','computer','jointAngles','jointRates','footContact','lateralAngles','lateralRates','vestGas','vestLitres','axialAngles','axialRates','torchDeployment']
        : ['state','activity','wingJoints','wingWake']).filter(key=>model.has(key));
      const [state,activity,...channels]=model.getMany(model.frameFields);
      const frame=[state[14],...state,...activity];
      if(actor.kind==='diver')appendDiverRig(frame,model);
      frames.push({id:actor.id,frame,loads:actor.inspect?.map(([id,kind])=>[id,sampleLoads(model,kind)])});
      continue;
    }
    const hasForebody=model.has('sharkForebody');
    const [state,animal,age,...rest]=model.getMany(hasForebody?[...outputs,'sharkForebody']:outputs);
    const forebody=hasForebody?rest.pop():[];
    const finAngles=actor.inputs.sharkDirect===2?model.getMany(['whiteShark.portAngle','whiteShark.starboardAngle']):[rest[7],rest[7]];
    // The host samples the live sea at the resulting whale position.
    frames.push({id:actor.id,loads:actor.inspect?.map(([id,kind])=>[id,sampleLoads(model,kind)]),attempt:model.get('feedingAttempt'),frame:[...state,...animal,age,0,...rest.flat(),...finAngles,...forebody]});
  }
  return frames;
}

self.onmessage=async({data})=>{
  try{self.postMessage({frames:await advance(data)});}
  catch(error){self.postMessage({error:error.message});}
};
