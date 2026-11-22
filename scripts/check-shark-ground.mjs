// The west shore and the adjacent flat bottom use the same skin contact as the humpback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
for(const [name,e,n,z,u,w,manual,pitch] of [
  ['flat bottom',2,-18,-12.9,2,-.9,true,-.9],
  ['powered shore approach',7,40,-1,4.6,0,true,.1],
  ['NPC shore approach',7,40,-1,4.6,0,false,0],
  ['drop on island',36,40,6.2,1,-1,true,1],
  ['beached',36,40,4.5,0,0,true,1],
  ['surfacing in open water',2,-18,-.48,1.8,0,false,0]
]){
  const shore=n===40&&e===7,dry=e===36,open=z===-.48;
  const craft=Array(256).fill(0);
  if(shore&&!manual)craft.splice(0,8,1,1,55,40,0,4,0,1);
  const m=await loadInstance('HarborTraffic',{
    initialState:[0,-28,6,0,2,-25,2,6,0,e,n,z,0,-.06,0,0,0],craft,
    initialFish:[u,w,0,0,0,0,0,0,0,0],sharkPilot:[Number(manual),pitch,1,-1]
  },read);
  let largestGapLoss=0,normalPeak=0,first,furthest=e,maxHeight=-Infinity,finCrossed=false;
  for(let i=0;i<850;i++){
    m.advance(.01);
    const [state,fish,[load,gap],thrust]=m.getMany(['state','fish','sharkContact','sharkTailForce']);
    assert(state.every(Number.isFinite)&&fish.every(Number.isFinite)&&Number.isFinite(load)&&Number.isFinite(gap));
    assert(load>=0&&(gap<0||load===0),'force while clear');
    if(load>0&&first===undefined)first=m.time;
    if(dry)assert(thrust===0,'dry tail generated water thrust');
    maxHeight=Math.max(maxHeight,state[11]);furthest=Math.max(furthest,state[9]);
    largestGapLoss=Math.max(largestGapLoss,-gap);normalPeak=Math.max(normalPeak,load);
    if(state[11]+.92*Math.cos(fish[2])>0&&state[11]+.47<0)finCrossed=true;
  }
  if(open)assert(first===undefined&&finCrossed);
  else assert(first!==undefined&&normalPeak>1000&&largestGapLoss<.30);
  if(shore)assert(furthest<18&&maxHeight<0);
  if(dry)assert(furthest<37&&maxHeight<z);
  console.log({name,first,largestGapLoss,normalPeak,furthest,maxHeight});
}
