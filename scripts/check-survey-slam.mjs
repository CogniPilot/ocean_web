// Replay sensor packets through the embedded estimator as an independent FMI component.
// Only the simulated instrument head receives the commanded tow trajectory.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const head=await loadInstance('Wreck_Navigation',{},read);
let deployment;
let worst=0,closed=0,keys=0;
for(let tick=0;tick<=120;tick++){
  const east=-5+.14*(tick<=60?tick:120-tick);
  const speed=tick===0?0:tick<=60?.7:-.7;
  head.set('stamp',tick*.2);
  head.set('truth',[east,0,-10,1,0,0,0,speed,0,0,0,1025*9.80665*10.29,0,0,9.80665,0,0,0]);
  const [d,image]=head.getMany(['sensor','image']);
  const packet={dvlVelocity:d.slice(0,4),dvlRange:d.slice(4,8),
    sonarRange:d.slice(8,57),gaugePressure:d[58],bodyRate:d.slice(88,91),specificForce:d.slice(85,88),grayscale:image};
  if(!deployment)deployment=await loadInstance('Wreck_SurveySLAM',{...packet,initialPosition:[-5,0,-10],pressureDatum:.29},read);
  else for(const [name,value] of Object.entries(packet))deployment.set(name,value);
  deployment.advance(.2);
  const s=deployment.get('state');
  assert(s.every(Number.isFinite));
  if(tick<=60)assert.equal(s[13],0,'False closure on an outbound leg');
  worst=Math.max(worst,Math.hypot(s[0]-east,s[1],s[2]+10));
  closed=s[13];keys=s[12];
}
console.log({keys,closed,worst});
assert(keys>=5 && closed>=1 && worst<1,'Independent sensor replay failed');
