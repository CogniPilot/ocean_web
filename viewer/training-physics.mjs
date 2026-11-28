// Simulation transport is shared by training environments. CPU and device
// lanes expose the same FMI value names to the policy and observation code.
import {prepareInstance} from './fmi3/instance.mjs';

async function request(path,body){
  const reply=await fetch('/api/training/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!reply.ok)throw Error((await reply.json().catch(()=>({}))).error??'Local GPU physics service unavailable');
  return reply.json();
}
function availableOutputs({variables},required,optional){
  return [...required,...optional.filter(name=>Object.hasOwn(variables,name))];
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
export async function trainingDevices(plant){
  const devices={plants:[],byPlant:{},errors:{},activePlants:[],local:false};
  try{
    const suffix=plant?'?plant='+encodeURIComponent(plant):'';
    const response=await fetch('/api/training/capabilities'+suffix,{cache:'no-store'});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return devices;
    const info=await response.json();
    if(!Array.isArray(info.plants))return devices;
    devices.local=true;
    Object.assign(devices.errors,info.errors);
    devices.activePlants=info.activePlants??[];
    for(const result of await Promise.all(info.plants.filter(name=>!plant||name===plant).map(async name=>{
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
export async function releaseTrainingDevice(id){
  if(id)await fetch('/api/training/sessions/'+encodeURIComponent(id),{method:'DELETE',keepalive:true}).catch(()=>{});
}
function cpuWorkerLimit(){
  const cpu=globalThis.navigator;
  if(typeof Worker==='undefined')return 1;
  const mobile=cpu?.userAgentData?.mobile||/Android|iPhone|iPad|Mobile/i.test(cpu?.userAgent??'');
  const constrained=mobile||(cpu?.deviceMemory&&cpu.deviceMemory<=4);
  return Math.min(constrained?2:16,Math.max(1,(cpu?.hardwareConcurrency??2)-1));
}

function openPhysicsWorker(metadata){
  const worker=new Worker(new URL('./training-physics-worker.mjs',import.meta.url),{type:'module'});
  let pending,failure;
  function close(error=Error('Physics worker closed')){
    failure=error;
    worker.terminate();
    pending?.reject(error);
    pending=undefined;
  }
  worker.onerror=event=>close(Error(event.message||'Physics worker failed'));
  worker.onmessageerror=()=>close(Error('Could not read the physics worker response'));
  worker.onmessage=({data})=>{
    const current=pending;
    pending=undefined;
    if(data.error)current?.reject(Error(data.error));
    else current?.resolve(data.rows);
  };
  return {close,request(data){
    if(failure)return Promise.reject(failure);
    if(pending)return Promise.reject(Error('Physics worker is busy'));
    return new Promise((resolve,reject)=>{
      pending={resolve,reject};
      try{
        // Give every reactor the same manifest, even across a viewer deployment.
        if(metadata){worker.postMessage({...data,metadata});metadata=undefined;}
        else worker.postMessage(data);
      }catch(error){close(error);}
    });
  }};
}

function workerLane(variables){
  let inputs={};
  const values={};
  return {time:0,has:key=>Object.hasOwn(variables,key),
    set(key,value){inputs[key]=value;},
    takeInputs(){const next=inputs;inputs={};return next;},
    get(key,destination){
      if(!Object.hasOwn(values,key))throw Error('Missing worker physics observation '+key);
      const value=values[key];
      if(destination===undefined)return value;
      const source=typeof value==='number'?[value]:value;
      if(source.length!==destination.length)throw Error('Wrong output dimensions for '+key);
      destination.set(source);return destination;
    },
    getMany(keys){return keys.map(key=>this.get(key));},
    observe(keys,row){keys.forEach((key,i)=>{values[key]=row[i];});}
  };
}

function cpuPhysics(name){
  let limit=(name==='ScubaDiver'||name==='ScubaDiverOpenWater')?cpuWorkerLimit():1;
  let local=[],workers=[],shards=[],factory,metadata;
  function releaseLocal(){for(const instance of local)instance.close();local=[];}
  function close(){
    releaseLocal();
    for(const worker of workers)worker.close();
    workers=[];shards=[];
  }
  async function resetLocal(inputs){
    close();
    factory??=await prepareInstance(name,fetch,true);
    for(const values of inputs)local.push(await factory(values));
    return local;
  }
  async function dispatch(op,inputs,outputs,dt){
    try{
      await Promise.all(shards.map(async({worker,start,models})=>{
        const rows=await worker.request({op,name,outputs,dt,inputs:inputs.slice(start,start+models.length)});
        if(rows.length!==models.length)throw Error('Incomplete worker physics batch');
        models.forEach((model,i)=>{model.observe(outputs,rows[i]);model.time+=dt;});
      }));
    }catch(error){close();throw error;}
  }
  return {label:'CPU WASM',maxLanes:256,dispatches:0,
    async resolveOutputs(required,optional){
      metadata??=await plantMetadata(name);
      return availableOutputs(metadata,required,optional);
    },async reset(inputs,outputs){
    releaseLocal();
    try{
      const count=Math.min(limit,inputs.length);
      // Single-instance training and callers requesting unrestricted FMI access
      // can use the coordinator's reactor without a worker round trip.
      if(count<=1||!outputs)return await resetLocal(inputs);
      metadata??=await plantMetadata(name);
      while(workers.length>count)workers.pop().close();
      try{
        while(workers.length<count)workers.push(openPhysicsWorker(metadata));
      }catch(error){
        if(error.name!=='SecurityError'&&error.name!=='NotSupportedError')throw error;
        limit=1;return await resetLocal(inputs);
      }
      const lanes=inputs.map(()=>workerLane(metadata.variables));
      shards=workers.map((worker,i)=>{
        const start=Math.floor(i*lanes.length/count);
        return {worker,start,models:lanes.slice(start,Math.floor((i+1)*lanes.length/count))};
      });
      await dispatch('reset',inputs,outputs,0);
      return lanes;
    }catch(error){close();throw error;}
  },async advance(models,dt,outputs){
    if(!shards.length){for(const model of models)model.advance(dt);return;}
    await dispatch('advance',models.map(model=>model.takeInputs()),outputs,dt);
  },close};
}

export async function trainingPhysics(backend,name,onSession){
  if(backend!=='cuda')return cpuPhysics(name);
  let id,endpoint;
  function close(){
    const released=releaseTrainingDevice(id);
    id=null;endpoint=null;
    return released;
  }
  async function acquire(){
    const session=await request('sessions',{plant:name,token:metadata.token});
    id=session.id;endpoint='sessions/'+encodeURIComponent(id);onSession?.(id);
    return session;
  }
  const metadata=await plantMetadata(name);
  const service=await acquire();
  let dispatches=0,batchDispatches=0,kernelMs;
  function lane(values){
    let inputs={};
    return {values,time:0,has:key=>Object.hasOwn(metadata.variables,key),
      set(key,value){inputs[key]=value;},get(key){if(!Object.hasOwn(this.values,key))throw Error('GPU observation missing '+key);return this.values[key];},
      getMany(keys){return keys.map(key=>this.get(key));},
      takeInputs(){const data=inputs;inputs={};return data;}};
  }
  return {label:'CUDA',maxLanes:service.maxCount??64,get kernelMs(){return kernelMs;},get dispatches(){return dispatches;},
    resolveOutputs:(required,optional)=>availableOutputs(metadata,required,optional),
    async reset(inputs,outputs){
      if(!id)await acquire();
      let rows;
      try{rows=await request(endpoint,{op:'reset',lanes:inputs.map(inputs=>({inputs})),outputs});}
      catch(error){await close();throw error;}
      if(rows.lanes.length!==inputs.length)throw Error('Incomplete GPU batch');
      if(rows.token!==metadata.token||rows.dispatches!==0)throw Error('GPU physics and viewer must use the same FMU version.');
      batchDispatches=0;kernelMs=undefined;return rows.lanes.map(lane);
    },
    async advance(models,dt,outputs){
      let result;
      try{result=await request(endpoint,{op:'advance',lanes:models.map(model=>({inputs:model.takeInputs()})),dt,outputs});}
      catch(error){await close();throw error;}
      if(result.lanes.length!==models.length)throw Error('Incomplete GPU step');
      if(result.dispatches!==batchDispatches+1)throw Error('The GPU runner did not acknowledge the physics step.');
      kernelMs=Number.isFinite(result.kernelSeconds)?1000*result.kernelSeconds:undefined;
      dispatches+=result.dispatches-batchDispatches;batchDispatches=result.dispatches;
      models.forEach((m,i)=>{m.values=result.lanes[i];m.time+=dt;});
    },close
  };
}
