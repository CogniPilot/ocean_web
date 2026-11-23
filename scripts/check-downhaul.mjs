import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const boat=await loadInstance('Hobie16',{manualHelm:1,deckManual:1,windEast:5.5,windNorth:8,trimInput:1},async url=>new Response(await readFile(url)));
for(const command of [0,1,0]){
  boat.set('downhaulInput',command);
  for(let tick=0;tick<250;tick++)boat.advance(.01);
  const [mesh,drop,load,vang,rotation,footX,footZ,stations,gooseneck,trackOffset]=boat.getMany([
    'cloth[1].vertex','tackDrop','downhaulTension','vangTension','sheetRotation','footX',
    'footZ','mastStations','mainGooseneck','mastTrackOffset'
  ]);
  assert.equal(vang,0);
  const transform=(node)=>[0,1,2].map(axis=>[footX[0],0,footZ[0]][axis]+
    mesh[3*node]*rotation[3*axis]+mesh[3*node+1]*rotation[3*axis+1]+
    mesh[3*node+2]*rotation[3*axis+2]);
  const tack=transform(0),head=transform(mesh.length/3-4);
  for(let axis=0;axis<3;axis++){
    assert(Math.abs(tack[axis]-gooseneck[axis])<.002,'The tack stays at the raked mast gooseneck');
    assert(Math.abs(head[axis]-stations[18+axis]-trackOffset[axis])<.005,'The head follows the track on the bent mast');
  }
  assert(command ? drop>.05 && load>200 : drop<.0001 && load<1);
  for(let j=1;j<3;j++)assert(Math.abs(mesh[3*j+2]-mesh[2]-(mesh[11]-mesh[2])*j/3)<1e-7);
  console.log({command,tackDropM:drop,luffLoadN:load,headHeightM:head[2]});
}
