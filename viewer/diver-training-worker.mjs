import {calibrateCount} from './training-count.mjs';
import {trainingPhysics} from './training-physics.mjs';
import {loadSwimPolicy,decisionSteps} from './diver-swim-policy.mjs';
import {appendDiverRig} from './diver-frame.mjs';
import {openTrainingUpdate} from './diver-training-update.mjs';

const policyDirectory=new URL('./assets/diver-policy/',import.meta.url);
const profiles=[
  {label:'Forward kick',drive:1},{label:'Helicopter turn',turn:1},
  {label:'Back kick',drive:-1},{label:'Roll right',roll:.8},
  {label:'Port strafe',strafe:1},{label:'Pitch up',pitch:.75},
  {label:'Forward with torch',drive:.75,torch:true},{label:'Ascend under trim',vertical:.7},
  {label:'Back and turn',drive:-.6,turn:-.7},{label:'Starboard strafe',strafe:-1},
  {label:'Pitch down',pitch:-.75},{label:'Roll left',roll:-.8},
  {label:'Descend with torch',vertical:-.7,torch:true},{label:'Fast forward',drive:1,fast:true},
  {label:'Mixed turn and trim',drive:.55,turn:.5,roll:-.2,strafe:.4,vertical:-.3},{label:'Neutral hover'}
];
const blockCount=6,sigma=.22;
let generation=0;
const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));

async function train(request,id){
  const automatic=request.lanes==='auto',seed=request.seed??58429;
  const maximizeThroughput=request.physics==='cuda';
  let lanes=automatic?4:Number(request.lanes??4);
  if(!Number.isInteger(lanes)||lanes<1)throw Error('Count must be a positive whole number.');
  const stage=message=>{if(id===generation)postMessage({type:'stage',message});};
  const learner=await openTrainingUpdate(request.backend,stage);
  const publish=(type,data)=>{if(id===generation)postMessage({type,backend:request.backend,adapter:learner.adapter,lanes,dispatches:learner.dispatches,...data});};
  let physics,experiment;
  try{
    stage(request.physics==='cuda'?'Initializing CUDA physics device…':'Loading WebAssembly physics model…');
    physics=await trainingPhysics(request.physics??'cpu','ScubaDiverOpenWater',id=>publish('deviceSession',{id}));
    if(!automatic&&lanes>physics.maxLanes)throw Error('Count exceeds the physics backend capacity of '+physics.maxLanes+'.');
    const response=await fetch(new URL(request.initialization==='pretrained'?'swim-pretrained.json':'swim-weights.json',policyDirectory));
    if(!response.ok)throw Error('Cannot load the initial diver policy.');
    const shipped=await response.json();
    const zeros=shipped.weights.map(row=>row.map(()=>0));
    const initial=request.initialization==='scratch'?zeros:(request.weights??shipped.weights);
    let state={weights:initial,m:zeros,v:zeros,step:0};
    stage('Loading and compiling swim controller…');
    experiment=await loadSwimPolicy(fetch,initial);
    let schedule=seed,round=0,steps=0,best=-Infinity,bestWeights=initial,bestRound=0;
    async function run(weights,validation,probe=false){
      // Keep exactly the selected number of physical instances active.
      // Groups of four exploration histories may span successive batches.
      let waves=1;
      while(!probe&&(lanes*waves)%4!==0)waves++;
      const population=waves*lanes,specs=[];
      for(let pair=0;pair<Math.ceil(population/2);pair++){
        const profileIndex=validation?pair%profiles.length:(Math.max(0,round-1)*(population/2)+pair)%profiles.length;
        const command=profiles[profileIndex];
        let trialSeed=10100+53*pair;
        if(!validation){const batch=experiment.batchSeed(schedule);trialSeed=batch.trial;schedule=batch.seed;}
        const trial=experiment.trial(trialSeed);
        for(let side=0;side<2&&specs.length<population;side++)specs.push({pair,side,trial,command});
      }
      const histories=[],measurements=[],commands=[];
      for(let wave=0;wave<waves;wave++){
        const part=await batch(weights,validation,probe,specs.slice(wave*lanes,(wave+1)*lanes),wave,waves);
        if(probe||!part)return part;
        histories.push(...part.histories);measurements.push(...part.measurements);commands.push(...part.commands);
      }
      return {histories,commands,metrics:experiment.average(measurements)};
    }
    async function batch(weights,validation,probe,specs,wave,waves){
      const actors=[],initialInputs=[];
      try{
        for(const {command,trial,side,pair} of specs){
          const flow=trial.flow;
          const {drive=0,turn=0,pitch=0,roll=0,strafe=0,vertical=0,fast=false,torch=false}=command;
          if(id!==generation)return null;
          const index=pair*2+side,pose=[...trial.start];
          pose[0]=0;pose[1]=0;pose[2]=-18;pose[6]=0;
          initialInputs.push({initialState:pose,bedHeight:-120,currentVelocity:flow,sprint:Number(fast),
            pilot:[1,turn,pitch,drive,roll],meshCollision:1,policyMode:1,neutralTrim:1,lateralPilot:strafe,
            verticalPilot:vertical,torchEquipped:Number(torch)});
          const policy=await loadSwimPolicy(fetch,weights);
          policy.command(flow,drive,turn,pitch,roll,fast,strafe,vertical,torch);policy.restoreTrim(pose);
          actors.push({policy,pose,history:[],noiseSeed:trial.seed,sign:validation?0:(side?1:-1),metrics:[],nextLogTime:1,
            command:{...command,profile:command.label,pair,flow:[...flow],depth:18,index,x:pose[0],y:pose[1]}});
        }
        const observations=['state','mechanicalPower'];
        const rigFields=['activity','dive','gauge','upright','computer','jointAngles','jointRates','footContact',
          'lateralAngles','lateralRates','vestGas','vestLitres','axialAngles','axialRates','torchDeployment'];
        if(!probe)stage('Initializing '+lanes+' physics instances…');
        const models=await physics.reset(initialInputs,[...observations,...rigFields,'priorLog']);
        actors.forEach((a,i)=>{a.model=models[i];a.model.logSample=a.model.get('priorLog');});
        const commands=actors.map(actor=>actor.command);
        const phase=probe?'sizing':validation?'validation':'exploration';
        const phaseStart=performance.now();
        function sendFrames(){
          const frames=actors.map(({pose,model})=>appendDiverRig([pose[14],...pose,...model.get('activity')],model));
          const perBatch=blockCount*decisionSteps,localTick=Math.round(models[0].time*100);
          const tick=wave*perBatch+localTick,total=waves*perBatch;
          const wallSeconds=(performance.now()-phaseStart)/1000;
          publish('frames',{frames,commands,phase,steps,round,kernelMs:physics.kernelMs,
            stepsPerSecond:localTick&&wallSeconds>0?localTick*lanes/wallSeconds:0,batchSeconds:models[0].time,tick,total,
            realTime:localTick?models[0].time/((performance.now()-phaseStart)/1000):0,
            remainingSeconds:localTick?(performance.now()-phaseStart)/1000*(total-tick)/localTick:null});
        }
        sendFrames();
        let probeStart,lastFrame=performance.now(),tickDuration=0;
        for(let block=0;block<blockCount;block++){
          for(const a of actors){
            const {eps,seed:nextSeed}=a.policy.explore(a.noiseSeed,a.sign,validation?0:sigma);
            a.noiseSeed=nextSeed;a.features=a.policy.decide(a.pose,eps);a.eps=eps;a.total=[0,0,0,0,0];
          }
          for(let tick=0;tick<decisionSteps;tick++){
            if(id!==generation)return null;
            if(probe&&tick===(maximizeThroughput?1:0))probeStart=performance.now();
            for(const a of actors)a.policy.stroke(a.model,a.pose);
            const tickStart=performance.now();
            const emit=request.physics==='cuda'||probe||(tick+1)%8===0||tickStart+tickDuration-lastFrame>=150,log=(block*decisionSteps+tick+1)%100===0;
            const outputs=emit?[...observations,...rigFields]:observations;
            await physics.advance(models,.01,log?[...outputs,'diveLog']:outputs);
            for(const a of actors){
              const [pose,power]=a.model.getMany(['state','mechanicalPower']);
              a.pose=pose;
              const measure=a.policy.measure(pose,a.model.time,18,power,a.total,tick+1);
              a.total=measure.total;a.mean=measure.mean;
              if(a.model.time+1e-7>=a.nextLogTime){
                a.model.logSample=a.model.get('diveLog');a.model.set('priorLog',a.model.logSample);a.nextLogTime++;
              }
            }
            if(probe&&probeStart!==undefined){
              const milliseconds=performance.now()-probeStart;
              const measuredSteps=tick+(maximizeThroughput?0:1);
              if(measuredSteps===5||(!maximizeThroughput&&milliseconds>=250)){
                sendFrames();return {steps:measuredSteps,milliseconds};
              }
            }
            if(!probe)steps+=lanes;
            tickDuration=performance.now()-tickStart;
            if(emit){sendFrames();lastFrame=performance.now();await yieldTurn();}
          }
          for(const a of actors){
            if(!a.mean.every(Number.isFinite))throw Error('Nonfinite diver rollout.');
            a.history.push({features:a.features,eps:a.eps,reward:a.mean[0]});
            if(block>=blockCount/2)a.metrics.push(a.mean);
          }
        }
        return {histories:actors.map(a=>a.history),measurements:actors.flatMap(a=>a.metrics),commands};
      }finally{for(const actor of actors)actor.policy.dispose?.();}
    }
    if(automatic){
      const memory=self.navigator?.deviceMemory;
      const ceiling=physics.label==='CPU WASM'&&memory&&memory<=4?Math.max(4,memory*4):physics.maxLanes;
      lanes=await calibrateCount({groupSize:maximizeThroughput&&ceiling>=4?4:1,stepSeconds:.01,maximum:ceiling,
        stepsToUpdate:3*blockCount*decisionSteps,maximizeThroughput,
        onProbe:(count,best)=>publish('sizing',{count,best}),
        probe:async count=>{lanes=count;const sample=await run(initial,true,true);if(!sample)throw Error('Stopped');return sample;}
      });
    }
    if(id!==generation)return;
    const start=performance.now();
    publish('ready',{lanes,actions:initial.length,features:initial[0].length,steps,round,physics:physics.label,update:request.backend});
    const baseline=await run(initial,true);if(!baseline)return;best=baseline.metrics[0];
    publish('progress',{round,steps,score:best,baseline:best,bestRound,phase:'baseline',metrics:baseline.metrics,weights:initial});
    while(id===generation){
      round++;const t=performance.now();
      const batch=await run(state.weights,false);if(!batch)return;
      stage('Updating policy weights…');
      const updateStart=performance.now(),next=await learner.update(batch.histories,state,{sigma});
      const updateMs=performance.now()-updateStart;state=next;
      const validation=await run(next.weights,true);if(!validation)return;
      const score=validation.metrics[0],improved=score>best;
      if(improved){best=score;bestWeights=state.weights;bestRound=round;}
      publish('progress',{round,steps,score:best,candidateScore:score,baseline:baseline.metrics[0],improved,bestRound,
        weights:bestWeights,metrics:validation.metrics,commands:batch.commands,stepsPerSecond:1000*steps/(performance.now()-start),
        physicsDispatches:physics.dispatches,roundMs:performance.now()-t,updateMs,phase:'round'});
      if(request.rounds&&round>=request.rounds)break;
    }
  }finally{experiment?.dispose?.();await physics?.close();learner.close();}
}

let running;
self.onmessage=({data})=>{
  if(data.type==='stop'){
    generation++;
    void running?.then(()=>postMessage({type:'done'}));return;
  }
  if(data.type==='start'){
    const id=++generation;
    running=train(data,id)
      .then(()=>{if(id===generation)postMessage({type:'done'});})
      .catch(error=>{if(id===generation)postMessage({type:'error',message:error.message,backend:data.backend});});
  }
};
