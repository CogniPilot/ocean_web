import {createWakeDisplayGrid} from './onrt-wake-display.mjs';
import {loadBasin,period} from './onrt-basin.mjs';

let basin;
const displayGrid=createWakeDisplayGrid(64,period);
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
        frames.push({state,tile,display:displayGrid(tile,state.east,state.north)});
      }
      postMessage({frames},frames.flatMap(frame=>[frame.tile.buffer,frame.display.buffer]));
    }
  } catch(error) { postMessage({error:String(error)}); }
};
