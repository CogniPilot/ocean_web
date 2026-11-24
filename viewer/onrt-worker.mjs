import {loadBasin} from './onrt-basin.mjs';

let basin;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init') {
      basin=await loadBasin(data.inputs);
      postMessage({ready:true});
    } else if(data.type==='step' && basin) {
      for(const [key,value] of Object.entries(data.inputs)) basin.vessel.set(key,value);
      const frames=[];
      for(let i=0;i<data.steps;i++){
        const state=basin.advance();
        const tile=basin.wake.get('wakeHeight',new Float32Array(64*64));
        frames.push({state,tile});
      }
      postMessage({frames},frames.map(frame=>frame.tile.buffer));
    }
  } catch(error) { postMessage({error:String(error)}); }
};
