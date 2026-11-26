// Compare the browser FMU's built-in strokes at rest, at a reference cadence,
// and at the two keyboard efforts. Run with node scripts/measure-scuba-gait.mjs.
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const period=1.65; // Nakashima et al. 2018, figure 9. Individual diver and fin.
const quietEffort=(1/period-.45)/.82;
const trials=[['Reference cadence',quietEffort],['Cruise',.75],['Sprint',1]];
for(const [name,effort] of trials){
  const model=await loadInstance('ScubaDiver',{
    initialState:[0,0,-10,0,0,0,0,0,0,0,0,0,0,effort,0,0],
    bedHeight:-100,pilot:[1,0,0,effort,0],sprint:1,
  },read);
  const dt=.01,thirdCycle=[],lastSix=[];
  for(let i=0;i<1200;i++){
    model.advance(dt);
    const state=model.get('state'),cycle=state[12]/(2*Math.PI);
    if(cycle>=2&&cycle<3)thirdCycle.push(state[3]);
    if(i>=600)lastSix.push(state[3]);
  }
  if(!thirdCycle.length)throw Error('No third stroke in '+name);
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const ripple=Math.max(...thirdCycle)-Math.min(...thirdCycle);
  console.log(name,{
    thirdCycleSeconds:thirdCycle.length*dt,
    thirdCycleMeanEastMps:mean(thirdCycle),
    thirdCyclePeakToPeakMps:ripple,
    lastSixSecondsMeanEastMps:mean(lastSix),
  });
}
