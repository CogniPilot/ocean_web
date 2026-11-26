import {createPlayablePolicy} from './live-policy-actor.mjs';
import {basinTask} from './vehicle-training-tasks.mjs';
import {createWakeDisplayGrid} from './onrt-wake-display.mjs';
import {loadBasin,period,bowGaugeElevation} from './onrt-basin.mjs';
import {readHeadSeaTrial,sampleTrial,attachShaftRecord} from './onrt-trial.mjs';

let basin,trial,helmAt,checkpoint,key;
const steer=createPlayablePolicy(basinTask);
const displayGrid=createWakeDisplayGrid(64,period);
function frame(state){
  const tile=basin.wake.get('wakeHeight',new Float32Array(64*64));
  if(trial)state.bowGauge=bowGaugeElevation(state,tile,trial.initial);
  return {state,tile,display:displayGrid(tile,state.east,state.north)};
}
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init') {
      if(data.trial){
        const [motion,shafts]=await Promise.all(['Case3.12-000_EFD.dat','ONRT_1.1-2_EFD.dat'].map(async name=>{
          const response=await fetch(new URL('./assets/onrt/'+name,import.meta.url));
          if(!response.ok)throw Error('Could not load '+name);
          return response.text();
        }));
        trial=readHeadSeaTrial(motion);
        attachShaftRecord(trial,shafts);
        helmAt=t=>sampleTrial(trial.rows,t)('helm');
      }
      basin=await loadBasin({...data.inputs,...trial?.initial});
      postMessage({ready:true,trial,first:frame(basin.snapshot())});
    } else if(data.type==='step' && basin) {
      if(!trial)for(const [key,value] of Object.entries(data.inputs)) basin.vessel.set(key,value);
      const policyKey=data.policy&&JSON.stringify(data.policy.weights);
      if(policyKey!==key){key=policyKey;checkpoint=data.policy;}
      const target={speed:2*data.inputs.shaftDemand/900,turn:.3*data.inputs.helm/35};
      const frames=[];
      for(let i=0;i<data.steps;i++){
        if(!trial)steer(basin.vessel,target,checkpoint);
        frames.push(frame(basin.advance(helmAt)));
        if(trial&&basin.vessel.time>=trial.end)break;
      }
      postMessage({frames},frames.flatMap(f=>[f.tile.buffer,f.display.buffer]));
    }
  } catch(error) { postMessage({error:String(error)}); }
};
