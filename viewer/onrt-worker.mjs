import {createWakeDisplayGrid} from './onrt-wake-display.mjs';
import {loadBasin,period} from './onrt-basin.mjs';
import {readHeadSeaTrial,sampleTrial} from './onrt-trial.mjs';

let basin,trial,helmAt;
const displayGrid=createWakeDisplayGrid(64,period);
function frame(state){
  const tile=basin.wake.get('wakeHeight',new Float32Array(64*64));
  return {state,tile,display:displayGrid(tile,state.east,state.north)};
}
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init') {
      if(data.trial){
        const response=await fetch(new URL('./assets/onrt/Case3.12-000_EFD.dat',import.meta.url));
        if(!response.ok)throw Error('Could not load the published IIHR trial');
        trial=readHeadSeaTrial(await response.text());
        helmAt=t=>sampleTrial(trial.rows,t)('helm');
      }
      basin=await loadBasin({...data.inputs,...trial?.initial});
      postMessage({ready:true,trial,first:frame(basin.snapshot())});
    } else if(data.type==='step' && basin) {
      if(!trial)for(const [key,value] of Object.entries(data.inputs)) basin.vessel.set(key,value);
      const frames=[];
      for(let i=0;i<data.steps;i++){
        frames.push(frame(basin.advance(helmAt)));
        if(trial&&basin.vessel.time>=trial.end)break;
      }
      postMessage({frames},frames.flatMap(f=>[f.tile.buffer,f.display.buffer]));
    }
  } catch(error) { postMessage({error:String(error)}); }
};
