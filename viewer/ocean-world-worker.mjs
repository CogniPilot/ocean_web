// Each worker owns one world and its FMI clock. Controls and observations use
// modelDescription variable names (including one-based Modelica array indices).
import {openFmuSession} from './fmu-session.js';

import {scalarNames} from './fmu-page-contract.js';

let session,observations,inputs,surveyMap;
let sampledGroups=[],stepCount=0;
// These discrete outputs share sample events in OceanWorld. The initial
// right limit can differ from the initialization snapshot on the first step.
function sampleEpoch(step,interval){
  return step===0 ? -1 : Math.floor(step/interval);
}
function expand(names,variables){
  const layout=[],elements=[];
  for(const name of names){
    const shape=variables.get(name)?.dimensions??[];
    const scalars=scalarNames(name,shape);
    layout.push({name,shape,offset:elements.length,count:scalars.length});
    elements.push(...scalars);
  }
  return {layout,elements};
}
async function handle(request){
  let layout;
  if(request.type==='open'){
    if(session)throw Error('World already initialized');
    const base=new URL('./',import.meta.url);
    const {index:file}=await (await fetch(new URL('manifest.json',base),{cache:'no-cache'})).json();
    const index=await (await fetch(new URL(file,base))).json();
    session=await openFmuSession({index,base,parameters:request.parameters,instanceName:'ocean_web'});
    session.set_inputs(JSON.stringify(Object.entries({
      sailingManual:1,subManual:1,flightManual:1,...request.initial
    })));
    const variables=new Map(index.variables.map(v=>[v.name,v]));
    let names=request.outputs;
    if(request.sampledFields){
      const [waveDt,windDt]=session.read_values(JSON.stringify(['waves.dt','wind.dt']));
      const schedules=[[waveDt*100,['waves.height']],[20,['boatWater.tile','image','features']],[windDt*100,['wind.field']]];
      for(const [interval,candidates] of schedules){
        if(!Number.isSafeInteger(interval)||interval<1)continue;
        const selected=names.filter(name=>candidates.includes(name));
        if(!selected.length)continue;
        const fields=expand(selected,variables);
        sampledGroups.push({interval,layout:fields.layout,binding:session.bind_outputs(JSON.stringify(fields.elements))});
        names=names.filter(name=>!selected.includes(name));
      }
    }
    const reads=expand(names,variables),writes=expand(request.inputs,variables);
    observations=session.bind_outputs(JSON.stringify(reads.elements));
    if(request.surveyMap){
      const estimate=reads.layout.find(v=>v.name==='estimate');
      if(!estimate)throw Error('Survey map snapshots require the estimate output');
      const keys=expand(['keyframes'],variables);
      surveyMap={estimateOffset:estimate.offset, stride:keys.layout[0].shape[1],
        binding:session.bind_outputs(JSON.stringify(keys.elements)), count:-1, closures:-1};
    }
    inputs=session.bind_inputs(JSON.stringify(writes.elements));
    layout={outputs:reads.layout,inputs:writes.layout,sampled:sampledGroups.map(group=>group.layout)};
  }else if(request.type==='advance'){
    if(!Number.isSafeInteger(request.steps)||request.steps<0)throw Error('Expected nonnegative step count');
    if(request.values)session.write_bound(inputs,request.values);
    for(let i=0;i<request.steps;i++)session.step(.01);
    stepCount+=request.steps;
  }else if(request.type==='close'){
    session?.free();self.close();return;
  }else throw Error('Unknown world request');
  const values=session.read_bound(observations);
  const transfer=[values.buffer];
  const sampled=sampledGroups.map(group=>{
    const epoch=sampleEpoch(stepCount,group.interval);
    if(epoch===group.epoch)return null;
    group.epoch=epoch;
    const data=session.read_bound(group.binding);
    transfer.push(data.buffer);
    return data;
  });
  let mapRows;
  if(surveyMap){
    // The estimator appends a keyframe or optimizes on loop closure. Send the
    // entire occupied prefix on either event so earlier optimized poses refresh.
    const count=values[surveyMap.estimateOffset+12],closures=values[surveyMap.estimateOffset+13];
    if(count!==surveyMap.count || closures!==surveyMap.closures){
      mapRows=count ? session.read_bound(surveyMap.binding).slice(0,count*surveyMap.stride) : new Float64Array();
      transfer.push(mapRows.buffer);
      surveyMap.count=count;
      surveyMap.closures=closures;
    }
  }
  self.postMessage({id:request.id,time:session.time(),values,layout,mapRows,sampled},transfer);
}
// Opening the guest is asynchronous. Process later control packets in order.
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(()=>handle(data)).catch(error=>{
    self.postMessage({id:data.id,error:error.message});
    session?.free();self.close();
  });
};
