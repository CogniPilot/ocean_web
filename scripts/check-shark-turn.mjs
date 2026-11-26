// Measure a change in travel direction, including lateral slip during the turn.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareInstance} from '../viewer/fmi3/instance.mjs';

const create=await prepareInstance('HarborTraffic',async url=>new Response(await readFile(url)),true);
const {weights}=JSON.parse(await readFile(new URL('../viewer/assets/shark-policy.json',import.meta.url)));
const quarterTurn=Math.PI/2;
for(const turn of [-1,1]){
  const shark=await create({initialState:[0,-28,6,0,2,-25,2,6,0,-900,-200,-7,0,0,0,0,0],
    initialFish:[2.4,0,0,0,0,0,0,0,0,0],sharkPolicyWeights:weights,sharkDirect:2,
    sharkPilot:[1,0,.55,-1],sharkTurn:turn,currentVelocity:[0,0]});
  let east=-900,north=-200,distance=0,peakTrunk=0,peakPeduncle=0,course=0;
  while(shark.time<15 && turn*course<quarterTurn){
    shark.advance(.01);
    const [state,fish,trunk]=shark.getMany(['state','fish','sharkTrunkFlex']);
    distance+=Math.hypot(state[9]-east,state[10]-north);
    east=state[9];north=state[10];
    course=state[12]+Math.atan2(fish[9],fish[0]);
    peakTrunk=Math.max(peakTrunk,Math.abs(trunk));
    peakPeduncle=Math.max(peakPeduncle,Math.abs(fish[5]));
  }
  assert(turn*course>=quarterTurn && distance/quarterTurn<21,'Lost directed quarter turn');
  assert(peakTrunk>.08 && peakTrunk<.7 && peakPeduncle<1.15,'Unexpected body bend');
  console.log({turn,seconds:shark.time,effectiveRadiusM:distance/quarterTurn,peakTrunkDeg:peakTrunk*180/Math.PI});
  shark.close();
}
