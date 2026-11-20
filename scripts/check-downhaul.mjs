import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const boat=await loadInstance('Hobie16',{manualHelm:1,deckManual:1,windEast:5.5,windNorth:8,trimInput:1},async url=>new Response(await readFile(url)));
for(const command of [0,1,0]){
  boat.set('downhaulInput',command);
  for(let tick=0;tick<250;tick++)boat.advance(.01);
  const [mesh,drop,load,vang,span]=boat.getMany(['cloth[1].vertex','tackDrop','downhaulTension','vangTension','spans']);
  assert.equal(vang,0);
  assert(Math.abs(mesh[2]+drop)<.0001);
  assert(Math.abs(mesh[62]-span[0])<.0001);
  assert(command ? drop>.05 && load>200 : drop<.0001 && load<1);
  for(let j=1;j<3;j++)assert(Math.abs(mesh[3*j+2]-mesh[2]-(mesh[11]-mesh[2])*j/3)<1e-7);
  console.log({command,tackDropM:drop,luffLoadN:load,headHeightM:mesh[62]});
}
