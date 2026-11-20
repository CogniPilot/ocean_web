// Compare identical starts with the vang eased and hauled in each sheet state.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
for(const trimInput of [1,-1]){
  const samples=[];
  for(const vangInput of [0,1]){
    const model=await loadInstance('Hobie16',{windEast:4,windNorth:7,launchSpeed:2.4,launchHeading:0,
      launchHeight:.2,manualHelm:1,deckManual:1,trimInput,vangInput},async url=>new Response(await readFile(url)));
    for(let i=0;i<350;i++)model.advance(.01);
    samples.push(model.getMany(['boomElevation','vangTension','leechLoad','mainBlockClearance','feet']));
  }
  const [eased,hauled]=samples;
  const drop=eased[4][0]*(Math.sin(eased[0])-Math.sin(hauled[0]));
  assert(eased[1]===0 && hauled[1]>100);
  if(trimInput>0)assert(drop>.03 && hauled[2]>eased[2]+200);
  else assert(eased[3]===0 && hauled[3]===0 && Math.abs(drop)<.005);
  console.log({trimInput,boomEndDropM:drop,vangLoadN:hauled[1]});
}
