import {loadInstance} from './fmi3/instance.mjs';
const sonar=loadInstance('CruiserImagingSonar',{});
self.onmessage=async ({data})=>{
  try{
    const model=await sonar;
    model.set('pose',data.pose);model.set('fish',data.fish);model.set('animals',data.animals);model.set('waterLevel',data.level);
    model.set('rangeLimit',data.range);model.set('halfBearing',data.halfBearing);
    const rows=model.get('returns'),echoes=[];
    for(let i=0;i<rows.length;i+=4)if(rows[i+3])echoes.push(...rows.slice(i,i+4),i/4);
    const packet=Float32Array.from(echoes);
    self.postMessage({echoes:packet,range:data.range},[packet.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
