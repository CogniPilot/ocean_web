// Tow the simulated sensor head through the stern entrance and back along the
// same track. Navigation only receives ray, DVL, pressure and IMU measurements.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const nav=await loadInstance('Wreck_Navigation',{},async u=>new Response(await readFile(u)));
let closures=0,largestPositionError=0,final;
for(let tick=0;tick<=120;tick++){
  const east=-5+.14*(tick<=60?tick:120-tick);
  const speed=tick===0?0:tick<=60?.7:-.7;
  nav.set('stamp',tick*.2);
  nav.set('truth',[east,0,-10,1,0,0,0,speed,0,0,0,1025*9.80665*10.29,0,0,9.80665,0,0,0]);
  const [image,pose,history]=nav.getMany(['image','estimate','keyframes']);
  nav.set('prior',pose);nav.set('priorImage',image);nav.set('keyHistory',history);
  largestPositionError=Math.max(largestPositionError,Math.hypot(east-pose[0],pose[1],-10-pose[2]));
  if(tick<=60)assert.equal(pose[13],0,'Loop closure on a one-way track');
  closures=pose[13];final=pose;
}
console.log({closures,keyframes:final[12],largestPositionError,final:final.slice(0,4)});
assert(closures>=1,'The estimator missed the return through the same space');
assert(largestPositionError<1,'Map correction displaced the estimate from the tow track');
