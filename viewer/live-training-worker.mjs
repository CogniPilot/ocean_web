import {openTrainingUpdate} from './diver-training-update.mjs';
import {trainingPhysics} from './training-physics.mjs';
import {calibrateCount} from './training-count.mjs';
import {openPolicyActor} from './live-policy-actor.mjs';
import {getTrainingTask,validateTrainingCheckpoint,validateWeights} from './live-training-tasks.mjs';

const decisions=6,sigma=.20;
function generator(seed){
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
}
const nextSeed=draw=>Math.floor(draw()*4294967296);
const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));

function observation(model,fields){
  const values=model.getMany(fields);
  if(!values.every(v=>Array.isArray(v)||ArrayBuffer.isView(v)?v.every(Number.isFinite):Number.isFinite(v)))throw Error('Nonfinite '+fields.join('/')+' observation');
  const map=new Map(fields.map((name,i)=>[name,values[i]]));
  return {time:model.time,get:key=>{
    if(!map.has(key))throw Error('Missing observation '+key);
    return map.get(key);
  },set:(key,value)=>model.set(key,value)};
}

export async function trainLivePolicy(request,send,active=()=>true){
  const task=getTrainingTask(request.task),automatic=request.lanes==='auto',seed=request.seed??58429;
  const backend=request.backend??'cpu',physicsBackend=request.physics??'cpu';
  if(!['cuda','cpu'].includes(physicsBackend))throw Error('Unknown physics backend');
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be a 32-bit unsigned integer');
  if(request.rounds!=null&&(!Number.isSafeInteger(request.rounds)||request.rounds<1))throw Error('Round count must be positive');
  let lanes=automatic?4:Number(request.lanes??4),round=0,steps=0,learner,physics;
  if(!Number.isSafeInteger(lanes)||lanes<1)throw Error('Count must be a positive whole number');
  const publish=(type,fields={})=>{
    if(active())send({type,task:task.id,lanes,backend,adapter:learner?.adapter,dispatches:learner?.dispatches??0,...fields});
  };
  const stage=message=>publish('stage',{message});
  const zeros=()=>task.actionNames.map(()=>task.featureNames.map(()=>0));
  try{
    learner=await openTrainingUpdate(backend,stage);
    if(!active())return;
    const actor=await openPolicyActor();
    stage('Loading '+task.plant+' physics…');
    physics=await trainingPhysics(physicsBackend,task.plant,id=>publish('deviceSession',{id}));
    if(!active())return;
    if(!automatic&&lanes>physics.maxLanes)throw Error('Count exceeds the physics backend capacity of '+physics.maxLanes);
    let initial;
    switch(request.initialization??'scratch'){
      case 'scratch':initial=zeros();break;
      case 'current':initial=validateTrainingCheckpoint(task,request.checkpoint).weights;break;
      case 'pretrained':
        if(!task.pretrained)throw Error(task.label+' has no shipped training checkpoint.');
        initial=typeof task.pretrained==='function'?await task.pretrained():task.pretrained;break;
      default:throw Error('Unknown policy initialization');
    }
    validateWeights(task,initial);
    let state={weights:initial,m:zeros(),v:zeros(),step:0};
    const draw=generator(seed),fixedInputs=await task.fixedInputs?.();
    async function rollout(weights,phase){
      const probe=phase==='sizing',explore=phase==='exploration';
      // The optimizer needs four histories per group even when the user
      // selects one, two, or an odd number of simultaneous physics instances.
      let waves=1;
      if(explore)while((waves*lanes)%4)waves++;
      else if(!probe)waves=Math.ceil(4/lanes);
      const population=waves*lanes,specs=[];
      const scenarioDraw=explore?draw:generator(902171);
      for(let lane=0;lane<population;){
        const scenario=task.scenario(scenarioDraw),noiseSeed=nextSeed(scenarioDraw);
        const signs=explore?[1,-1]:[0];
        for(const sign of signs){
          specs.push({scenario,sign,noiseSeed});lane++;
        }
      }
      const histories=[],rewards=[];
      const perWave=task.ticksPerDecision*decisions;
      for(let wave=0;wave<waves;wave++){
        if(!active())return;
        const group=specs.slice(wave*lanes,(wave+1)*lanes);
        const models=await physics.reset(group.map(({scenario})=>({...fixedInputs,...scenario.inputs})),task.outputs);
        const actors=group.map(({scenario,sign,noiseSeed},i)=>({
          scenario,sign,noise:generator(noiseSeed),model:models[i],view:observation(models[i],task.outputs),history:[],visual:{}
        }));
        const batchStart=performance.now();
        const frames=tick=>{
          const rows=actors.map(a=>task.pose(a.view,a.scenario));
          if(!rows.every(row=>row.length===6&&row.every(Number.isFinite)))throw Error('Invalid rollout pose for '+task.label);
          const seconds=(performance.now()-batchStart)/1000;
          publish('frames',{frames:rows,realTime:tick&&seconds>0?tick*task.dt/seconds:0,
            stepsPerSecond:tick&&seconds>0?tick*lanes/seconds:0,kernelMs:physics.kernelMs,rig:task.rigPose?actors.map(a=>task.rigPose(a.view,a.visual)):undefined,tick:wave*perWave+tick,total:waves*perWave,batchSeconds:models[0].time,round,phase,steps});
        };
        frames(0);
        let lastFrame=performance.now();
        const probeStart=lastFrame;
        for(let block=0;block<decisions;block++){
          for(const a of actors){
            const features=task.observe(a.view,a.scenario);
            const eps=task.actionNames.map(()=>a.sign*Math.sqrt(-2*Math.log(a.noise()))*Math.cos(2*Math.PI*a.noise()));
            const action=actor.decide(weights,features,eps,sigma,task.linear);
            task.act(a.view,a.scenario,action);
            a.history.push({features,eps,reward:0});a.samples=0;
          }
          for(let tick=1;tick<=task.ticksPerDecision;tick++){
            if(!active())return;
            const emit=performance.now()-lastFrame>=160||tick===task.ticksPerDecision;
            const sample=tick===Math.ceil(task.ticksPerDecision/2)||tick===task.ticksPerDecision;
            const observe=emit||sample||probe;
            await physics.advance(models,task.dt,observe?task.outputs:[]);
            if(!probe)steps+=lanes;
            if(observe){
              for(const a of actors){
                a.view=observation(a.model,task.outputs);
                if(sample){
                  const reward=task.reward(a.view,a.scenario);
                  if(!Number.isFinite(reward))throw Error('Nonfinite '+task.label+' reward');
                  a.history[block].reward+=reward;a.samples++;
                }
              }
            }
            if(probe&&(tick>=3||performance.now()-probeStart>=250))return {steps:tick,milliseconds:performance.now()-probeStart};
            if(emit){frames(block*task.ticksPerDecision+tick);lastFrame=performance.now();await yieldTurn();}
          }
          for(const a of actors)a.history[block].reward/=a.samples;
        }
        for(const a of actors){histories.push(a.history);for(const sample of a.history)rewards.push(sample.reward);}
      }
      const score=rewards.reduce((sum,r)=>sum+r,0)/rewards.length;
      if(!Number.isFinite(score))throw Error('Nonfinite '+task.label+' rollout score');
      return {histories,score};
    }
    if(automatic){
      const memory=globalThis.navigator?.deviceMemory;
      const limit=physicsBackend==='cpu'&&memory&&memory<=4?Math.min(physics.maxLanes,4*memory):physics.maxLanes;
      const capacity=await calibrateCount({groupSize:1,stepSeconds:task.dt,maximum:limit,
        stepsToUpdate:2*decisions*task.ticksPerDecision,onProbe:count=>publish('sizing',{count}),
        probe:async count=>{lanes=count;const sample=await rollout(initial,'sizing');if(!sample)throw Error('Stopped');return sample;}});
      lanes=capacity;
    }
    if(!active())return;
    publish('ready',{actions:task.actionNames.length,features:task.featureNames.length,steps,round,physics:physics.label,update:backend});
    const start=performance.now(),baselineRollout=await rollout(initial,'validation');
    if(!baselineRollout)return;
    const baseline=baselineRollout.score;
    const checkpoint=(weights,score,bestRound)=>validateTrainingCheckpoint(task,{version:1,task:task.id,weights,score,bestRound});
    let best=checkpoint(initial,baseline,0);
    publish('progress',{round,steps,baseline,score:baseline,candidateScore:baseline,bestRound:0,improved:false,checkpoint:best,phase:'baseline'});
    while(active()){
      round++;
      const roundStart=performance.now(),episodes=await rollout(state.weights,'exploration');
      if(!episodes||!active())return;
      stage('Updating policy weights…');
      const updateStart=performance.now();
      state=await learner.update(episodes.histories,state,{sigma});
      const updateMs=performance.now()-updateStart,validation=await rollout(state.weights,'validation');
      if(!validation||!active())return;
      const score=validation.score,improved=score>best.score;
      if(improved)best=checkpoint(state.weights,score,round);
      publish('progress',{phase:'round',round,steps,candidateScore:score,score:best.score,baseline,improved,
        checkpoint:best,bestRound:best.bestRound,physicsDispatches:physics.dispatches,
        stepsPerSecond:1000*steps/(performance.now()-start),roundMs:performance.now()-roundStart,updateMs});
      if(round===request.rounds){publish('done',{round,steps,checkpoint:best});return;}
    }
  }finally{physics?.close();learner?.close();}
}

if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope){
  let generation=0,stopAfter;
  self.onmessage=({data})=>{
    if(data.type==='stop'){stopAfter=generation;generation++;return;}
    if(data.type!=='start')return;
    const id=++generation;
    trainLivePolicy(data,message=>self.postMessage(message),()=>generation===id)
      .catch(error=>{if(generation===id)self.postMessage({type:'error',task:data.task,message:error.message});})
      .finally(()=>{if(stopAfter===id&&generation===id+1)self.postMessage({type:'done',task:data.task});});
  };
}
