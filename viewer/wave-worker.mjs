import {loadInstance} from './fmi3/instance.mjs';
let model;
self.onmessage=async ({data})=>{
  try{
    if(data.init){
      model=await loadInstance('WakeSpectrum',data.init);
    }else{
      for(const [name,value] of Object.entries(data))model.set(name,value);
      model.advance(.1);
    }
    const height=Float32Array.from(model.get('height'));
    const wake=data.omitWake || data.init?.omitWake ? undefined : Float32Array.from(model.get('wakeHeight'));
    self.postMessage({height,wake,origin:[model.get('driftE'),model.get('driftN')],period:model.get('period'),
      sections:model.get('sectionHeight'),incident:model.get('incident'),load:model.get('waveLoad')},wake?[height.buffer,wake.buffer]:[height.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
