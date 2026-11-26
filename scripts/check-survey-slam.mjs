// Replay instrument packets through the independent estimator. Only the sensor head receives the tow trajectory.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));

async function tow(name,origin,direction,expectClosure){
  const head=await loadInstance('Wreck_Navigation',{},read);
  let deployment,worst=0,closed=0,keys=0;
  for(let tick=0;tick<=120;tick++){
    const distance=.14*(tick<=60?tick:120-tick);
    const east=origin[0]+direction[0]*distance,north=origin[1]+direction[1]*distance,z=origin[2];
    const speed=tick===0?0:tick<=60?.7:-.7;
    head.set('stamp',tick*.2);
    head.set('truth',[east,north,z,1,0,0,0,direction[0]*speed,direction[1]*speed,0,0,1025*9.80665*(.29-z),0,0,9.80665,0,0,0]);
    const [d,image]=head.getMany(['sensor','image']);
    const packet={dvlVelocity:d.slice(0,4),dvlRange:d.slice(4,8),
      sonarRange:d.slice(8,57),gaugePressure:d[58],bodyRate:d.slice(88,91),specificForce:d.slice(85,88),grayscale:image};
    if(!deployment)deployment=await loadInstance('Wreck_SurveySLAM',{...packet,initialPosition:origin,pressureDatum:.29},read);
    else for(const [channel,value] of Object.entries(packet))deployment.set(channel,value);
    deployment.advance(.2);
    const s=deployment.get('state');
    assert(s.every(Number.isFinite));
    if(tick<=60)assert.equal(s[13],0,'False closure on an outbound leg');
    worst=Math.max(worst,Math.hypot(s[0]-east,s[1]-north,s[2]-z));
    closed=s[13];keys=s[12];
  }
  console.log({name,keys,closed,worst});
  assert(keys>=5&&worst<1,'Independent sensor replay accuracy on '+name);
  if(expectClosure)assert(closed>=1,'Expected the estimator to recognize the revisited wreck');
  else assert.equal(closed,0,'Open water has no wreck landmarks for a loop closure');
}

await tow('Open water',[-5,0,-10],[1,0],false);
// Tow abeam of the western end. The east-facing optics and sonar see the same
// registered hull features again on the return leg.
await tow('Yatush',[-36,22,-9.5],[0,1],true);
