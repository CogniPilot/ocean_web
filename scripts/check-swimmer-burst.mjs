// Measure sustained through-water speed after averaging over several tail beats.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const step=.01;

async function measure(kind,current,effort=1){
  const whale=kind==='whale';
  const initialSpeed=effort>0?3:1.3;
  const plant=await loadInstance('HarborTraffic',{
    currentVelocity:[current,0],
    initialState:[0,-28,6,0,2,-25,2,6,0,-200,-160,-5,0,-.06,0,0,0],
    initialFish:[initialSpeed+current,0,0,0,0,0,0,0,0,0],
    initialSwimmer:[-200,-160,-5,initialSpeed+current,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [whale?'whalePilot':'sharkPilot']:[1,0,effort,-1]
  },read);
  const fields=whale?['swimmerState','state','tailForce','tailPower']:
    ['fish','state','sharkTailForce','sharkTailPower'];
  const reserveIndex=whale?0:1;
  let burst=0,sustained=0,groundBurst=0,force=0,power=0,peakHeading=0;
  for(let tick=0;tick<3000;tick++){
    plant.advance(step);
    const [state,harbor,thrust,musclePower]=plant.getMany(fields);
    const forward=state[whale?3:0];
    const heading=whale?state[9]:harbor[12];
    const depth=-(whale?state[2]:harbor[11]);
    const water=forward-current*Math.cos(heading);
    assert(Number.isFinite(water)&&depth>2&&depth<12);
    if(tick<1000)peakHeading=Math.max(peakHeading,Math.abs(heading));
    if(tick>=500&&tick<1000){
      burst+=water/500;
      groundBurst+=forward/500;
      force+=thrust/500;
      power+=musclePower/500;
    }
    if(tick>=2500)sustained+=water/500;
  }
  const reserve=plant.get('swimReserve')[reserveIndex];
  if(effort===1){
    assert(reserve<.001,'Full effort should deplete the reserve');
    assert(burst>sustained&&force>0&&power>0,'Burst should come from positive caudal thrust and muscle work');
    assert(peakHeading<.20,'A straight burst should hold its course');
    plant.set(whale?'whalePilot':'sharkPilot',[1,0,.2,-1]);
    for(let tick=0;tick<500;tick++)plant.advance(step);
    assert(plant.get('swimReserve')[reserveIndex]>.15,'Easing off should give the muscles time to recover');
  }else{
    assert(reserve>.999,'Cruising should preserve the reserve');
  }
  return {burst,sustained,groundBurst,force,power};
}

for(const [kind,burstBounds,sprintBounds] of [
  ['whale',[7.5,8.4],[4.6,5.1]],
  ['shark',[12.3,13.7],[6.3,7.1]]
]){
  const still=await measure(kind,0);
  const flow=await measure(kind,1.2);
  assert(still.burst>burstBounds[0]&&still.burst<burstBounds[1],kind+' burst');
  assert(still.sustained>sprintBounds[0]&&still.sustained<sprintBounds[1],kind+' sustained swim');
  assert(Math.abs(still.burst-flow.burst)<.12,kind+' through-water speed changed with current');
  assert(Math.abs(flow.groundBurst-still.groundBurst-1.2)<.12,kind+' ground speed did not include current');
  console.log(kind,still);
}
const cruise=await measure('shark',0,0);
assert(cruise.sustained>.8&&cruise.sustained<1.5,'Shark cruise should stay below sprint speed');
console.log('shark cruise',cruise.sustained);
