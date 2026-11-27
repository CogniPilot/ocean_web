// Each worker owns independent FMI instances and one copy of the compiled plant.
import {prepareInstance} from './fmi3/instance.mjs';

let factory,instances=[];
function release(){
  for(const instance of instances)instance.close();
  instances=[];
}

self.onmessage=async({data})=>{
  try{
    if(data.op==='reset'){
      release();
      if(!factory){
        const {metadata}=data;
        const read=(url,options)=>url.pathname.endsWith('.json')
          ?Promise.resolve({json:()=>metadata}):fetch(url,options);
        factory=await prepareInstance(data.name,read,true);
      }
      for(const inputs of data.inputs)instances.push(await factory(inputs));
    }else if(data.op==='advance'){
      if(data.inputs.length!==instances.length)throw Error('Incomplete worker physics step');
      for(const [index,instance] of instances.entries()){
        for(const [key,value] of Object.entries(data.inputs[index]))instance.set(key,value);
        instance.advance(data.dt);
      }
    }else throw Error('Unknown worker physics operation');
    postMessage({rows:instances.map(instance=>instance.getMany(data.outputs))});
  }catch(error){
    release();
    postMessage({error:error.message});
  }
};
