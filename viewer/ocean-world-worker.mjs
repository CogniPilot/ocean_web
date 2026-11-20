// Each worker owns one world and its FMI clock. Controls and observations use
// modelDescription variable names (including one-based Modelica array indices).
import {openFmuSession} from './fmu-session.js';

let session,observations,inputs;
async function handle(request){
  if(request.type==='open'){
    if(session)throw Error('World already initialized');
    const base=new URL('./',import.meta.url);
    const {index:file}=await (await fetch(new URL('manifest.json',base))).json();
    const index=await (await fetch(new URL(file,base))).json();
    session=await openFmuSession({index,base,instanceName:'ocean_web'});
    session.set_inputs(JSON.stringify(Object.entries({
      sailingManual:1,subManual:1,flightManual:1,...request.initial
    })));
    observations=session.bind_outputs(JSON.stringify(request.outputs));
    inputs=session.bind_inputs(JSON.stringify(request.inputs));
  }else if(request.type==='advance'){
    if(!Number.isSafeInteger(request.steps)||request.steps<0)throw Error('Expected nonnegative step count');
    if(request.values)session.write_bound(inputs,request.values);
    for(let i=0;i<request.steps;i++)session.step(.01);
  }else if(request.type==='close'){
    session?.free();self.close();return;
  }else throw Error('Unknown world request');
  const values=Float64Array.from(session.read_bound(observations));
  self.postMessage({id:request.id,time:session.time(),values},[values.buffer]);
}
// Opening the guest is asynchronous. Process later control packets in order.
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(()=>handle(data)).catch(error=>{
    self.postMessage({id:data.id,error:error.message});
    session?.free();self.close();
  });
};
