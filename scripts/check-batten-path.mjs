// Check the material seams against the actual batten rows in the released cloth solver.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {sailPanelTexture,sailTopology} from '../viewer/board/sail-battens.mjs';

function verifyPaths(boat,sail){
  const [count,luff,leech,telltales,rest,vertices,battenLuff,battenLeech]=boat.getMany(
    ['battenCount','rowLuff','rowLeech','telltalePanelRows','mesh','vertex','battenLuff','battenLeech']
      .map(name=>`cloth[${sail}].${name}`));
  const rows=count+2,topology=sailTopology(rows);
  assert.equal(vertices.length,12*rows);
  assert.equal(rest.length,vertices.length);
  assert.equal(topology.length,18*(rows-1));
  assert.deepEqual(luff,[0,...battenLuff.slice(0,count),1]);
  assert.deepEqual(leech,[0,...battenLeech.slice(0,count),1]);
  const {uv,pockets,windows}=sailPanelTexture(luff,leech,telltales.slice(0,sail===1?3:2).map(row=>row-1));
  assert(windows.every(v=>v>0&&v<1));

  for(const [index,path] of pockets.entries()){
    const row=index+1,first=12*row,last=first+9;
    const dx=rest[last]-rest[first],dz=rest[last+2]-rest[first+2];
    assert(dz>0,'The leech end should sit higher than the luff');
    for(const [col,[u,v]] of path.entries()){
      const i=first+3*col,texel=8*row+2*col;
      assert(Math.abs((rest[i]-rest[first])*dz-(rest[i+2]-rest[first+2])*dx)<1e-8,
        'Batten nodes must follow a straight seam in the flat cloth pattern');
      assert.equal(u,uv[texel]);
      assert.equal(v,1-uv[texel+1]);
      if(col<3){
        const node=4*row+col;
        assert(topology.some((vertex,i)=>vertex===node&&
          topology[Math.floor(i/3)*3+(i+1)%3]===node+1),'The seam must use an edge of the cloth mesh');
        assert(Math.hypot(vertices[i+3]-vertices[i],vertices[i+4]-vertices[i+1],vertices[i+5]-vertices[i+2])>.01);
      }
    }
  }
}

for(const windNorth of [-11,11]){
  const boat=await loadInstance('Hobie16',{windEast:5.5,windNorth,launchSpeed:2.4,launchHeading:0,
    launchHeight:.2,deckManual:1,manualHelm:1},async url=>new Response(await readFile(url)));
  for(let i=0;i<250;i++)boat.advance(.01);
  verifyPaths(boat,1);
  verifyPaths(boat,2);
}
console.log('The stitched pockets align with the native batten rows on both tacks.');
