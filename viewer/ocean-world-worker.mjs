// Each worker owns one world and its FMI clock. Controls and observations use
// modelDescription variable names (including one-based Modelica array indices).
import {openFmuSession} from './fmu-session.js';

import {scalarNames} from './fmu-page-contract.js';

let session,observations,inputs,surveyMap;
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
    session=await openFmuSession({index,base,instanceName:'ocean_web'});
    session.set_inputs(JSON.stringify(Object.entries({
      sailingManual:1,subManual:1,flightManual:1,...request.initial
    })));
    const variables=new Map(index.variables.map(v=>[v.name,v]));
    const reads=expand(request.outputs,variables),writes=expand(request.inputs,variables);
    observations=session.bind_outputs(JSON.stringify(reads.elements));
    if(request.surveyMap){
      const estimate=reads.layout.find(v=>v.name==='estimate');
      if(!estimate)throw Error('Survey map snapshots require the estimate output');
      const keys=expand(['keyframes'],variables);
      surveyMap={estimateOffset:estimate.offset, stride:keys.layout[0].shape[1],
        binding:session.bind_outputs(JSON.stringify(keys.elements)), count:-1, closures:-1};
    }
    inputs=session.bind_inputs(JSON.stringify(writes.elements));
    layout={outputs:reads.layout,inputs:writes.layout};
  }else if(request.type==='advance'){
    if(!Number.isSafeInteger(request.steps)||request.steps<0)throw Error('Expected nonnegative step count');
    if(request.values)session.write_bound(inputs,request.values);
    for(let i=0;i<request.steps;i++)session.step(.01);
  }else if(request.type==='close'){
    session?.free();self.close();return;
  }else throw Error('Unknown world request');
  const values=session.read_bound(observations);
  const transfer=[values.buffer];
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
  self.postMessage({id:request.id,time:session.time(),values,layout,mapRows},transfer);
}
// Opening the guest is asynchronous. Process later control packets in order.
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(()=>handle(data)).catch(error=>{
    self.postMessage({id:data.id,error:error.message});
    session?.free();self.close();
  });
};
