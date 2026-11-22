import {loadInstance} from './fmi3/instance.mjs';

const models=new Map();
const outputs=['state','whale','breathAge','swimmerState','wetSections','impact','fish','guidanceMemory','whaleSources','sharkSources','sharkFin','sharkTrunkFlex','sharkBankState','swimReserve'];

async function advance({actors,environment,steps}){
  const frames=[];
  const active=new Set(actors.map(actor=>actor.id));
  for(const id of models.keys())if(!active.has(id))models.delete(id);
  for(const actor of actors){
    let model=models.get(actor.id);
    if(!model){
      model=await loadInstance('HarborTraffic',actor.seed??{});
      models.set(actor.id,model);
    }
    for(const [name,value] of Object.entries(environment))model.set(name,value);
    for(const [name,value] of Object.entries(actor.inputs))model.set(name,value);
    for(let step=0;step<steps;step++)model.advance(.01);
    const [state,animal,age,...rest]=model.getMany(outputs);
    // The host samples the live sea at the resulting whale position.
    frames.push({id:actor.id,frame:[...state,...animal,age,0,...rest.flat()]});
  }
  return frames;
}

self.onmessage=async({data})=>{
  try{self.postMessage({frames:await advance(data)});}
  catch(error){self.postMessage({error:error.message});}
};
