// Simulation transport is shared by training environments. CPU and device
// lanes expose the same FMI value names to the policy and observation code.
import {prepareInstance} from './fmi3/instance.mjs';

async function request(path,body){
  const reply=await fetch('/api/training/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!reply.ok)throw Error((await reply.json().catch(()=>({}))).error??'Local GPU physics service unavailable');
  return reply.json();
}
function plantMetadata(name){
  return fetch(new URL('./fmi3/'+encodeURIComponent(name)+'.json',import.meta.url),{cache:'no-cache'}).then(response=>{
    if(!response.ok)throw Error('Cannot load '+name+' FMI metadata');
    return response.json();
  });
}
export function trainingDeviceFor(capabilities,name){
  if(!capabilities?.plants?.includes(name))return undefined;
  return capabilities.byPlant?.[name]??(capabilities.plants.length===1?capabilities:undefined);
}
export async function trainingDevices(){
  const devices={plants:[],byPlant:{},errors:{},activePlants:[]};
  try{
    const response=await fetch('/api/training/capabilities',{cache:'no-store'});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return devices;
    const info=await response.json();
    Object.assign(devices.errors,info.errors);
    devices.activePlants=info.activePlants??[];
    for(const result of await Promise.all((info.plants??[]).map(async name=>{
      const device=trainingDeviceFor(info,name);
      try{
        if(!device||!Number.isSafeInteger(device.maxCount)||device.maxCount<1)throw Error('CUDA capacity unavailable');
        if(device.token&&(await plantMetadata(name)).token!==device.token)throw Error('GPU physics and viewer must use the same FMU version.');
        return {name,device};
      }catch(error){return {name,error:error.message};}
    }))){
      if(result.error){devices.errors[result.name]=result.error;continue;}
      devices.plants.push(result.name);
      devices.byPlant[result.name]=result.device;
    }
    if(devices.plants.length===1)return {...devices.byPlant[devices.plants[0]],...devices};
  }catch{}
  return devices;
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
    const session=await request('sessions',{plant:name,token:metadata.token});
    id=session.id;endpoint='sessions/'+encodeURIComponent(id);onSession?.(id);
    return session;
  }
  const metadata=await plantMetadata(name);
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
