// Simulation transport is shared by training environments. CPU and device
// lanes expose the same FMI value names to the policy and observation code.
import {prepareInstance} from './fmi3/instance.mjs';

async function request(path,body){
  const reply=await fetch('/api/training/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!reply.ok)throw Error((await reply.json().catch(()=>({}))).error??'Local GPU physics service unavailable');
  return reply.json();
}
export async function trainingDevices(){
  try{
    const r=await fetch('/api/training/capabilities');
    if(r.headers.get('content-type')?.includes('application/json'))return await r.json();
  }catch{}
  return {plants:[]};
}
export function releaseTrainingDevice(id){
  if(id)void fetch('/api/training/sessions/'+encodeURIComponent(id),{method:'DELETE',keepalive:true}).catch(()=>{});
}
export async function trainingPhysics(backend,name,onSession){
  if(backend!=='cuda'){
    const create=await prepareInstance(name,fetch,true);
    let lanes=[];
    function close(){for(const lane of lanes)lane.close();lanes=[];}
    return {label:'CPU WASM',maxLanes:256,dispatches:0,async reset(inputs){
      close();
      try{for(const values of inputs)lanes.push(await create(values));return lanes;}
      catch(error){close();throw error;}
    },async advance(models,dt){for(const model of models)model.advance(dt);},close};
  }
  let id,endpoint;
  function close(){
    if(id)releaseTrainingDevice(id);
    id=null;endpoint=null;
  }
  async function acquire(){
    const session=await request('sessions',{plant:name});
    id=session.id;endpoint='sessions/'+encodeURIComponent(id);onSession?.(id);
    return session;
  }
  const metadata=await fetch(new URL('./fmi3/'+name+'.json',import.meta.url)).then(r=>r.json());
  const service=await acquire();
  let dispatches=0,batchDispatches=0;
  function lane(values){
    let inputs={};
    return {values,time:0,has:key=>Object.hasOwn(metadata.variables,key),
      set(key,value){inputs[key]=value;},get(key){if(!Object.hasOwn(this.values,key))throw Error('GPU observation missing '+key);return this.values[key];},
      getMany(keys){return keys.map(key=>this.get(key));},
      takeInputs(){const data=inputs;inputs={};return data;}};
  }
  return {label:'CUDA',maxLanes:service.maxCount??64,get dispatches(){return dispatches;},
    async reset(inputs,outputs){
      if(!id)await acquire();
      let rows;
      try{rows=await request(endpoint,{op:'reset',lanes:inputs.map(inputs=>({inputs})),outputs});}
      catch(error){close();throw error;}
      if(rows.lanes.length!==inputs.length)throw Error('Incomplete GPU batch');
      if(rows.token!==metadata.token||rows.dispatches!==0)throw Error('GPU physics and viewer must use the same FMU version.');
      batchDispatches=0;return rows.lanes.map(lane);
    },
    async advance(models,dt,outputs){
      let result;
      try{result=await request(endpoint,{op:'advance',lanes:models.map(model=>({inputs:model.takeInputs()})),dt,outputs});}
      catch(error){close();throw error;}
      if(result.lanes.length!==models.length)throw Error('Incomplete GPU step');
      if(result.dispatches!==batchDispatches+1)throw Error('The GPU runner did not acknowledge the physics step.');
      dispatches+=result.dispatches-batchDispatches;batchDispatches=result.dispatches;
      models.forEach((m,i)=>{m.values=result.lanes[i];m.time+=dt;});
    },close
  };
}
