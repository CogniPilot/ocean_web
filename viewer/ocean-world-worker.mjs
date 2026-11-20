// Each worker owns one world and its FMI clock. Controls and observations use
// modelDescription variable names (including one-based Modelica array indices).
import {openFmuSession} from './fmu-session.js';

import {scalarNames} from './fmu-page-contract.js';

let session,observations,inputs;
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
    const {index:file}=await (await fetch(new URL('manifest.json',base))).json();
    const index=await (await fetch(new URL(file,base))).json();
    session=await openFmuSession({index,base,instanceName:'ocean_web'});
    session.set_inputs(JSON.stringify(Object.entries({
      sailingManual:1,subManual:1,flightManual:1,...request.initial
    })));
    const variables=new Map(index.variables.map(v=>[v.name,v]));
    const reads=expand(request.outputs,variables),writes=expand(request.inputs,variables);
    observations=session.bind_outputs(JSON.stringify(reads.elements));
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
  self.postMessage({id:request.id,time:session.time(),values,layout},[values.buffer]);
}
// Opening the guest is asynchronous. Process later control packets in order.
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(()=>handle(data)).catch(error=>{
    self.postMessage({id:data.id,error:error.message});
    session?.free();self.close();
  });
};
