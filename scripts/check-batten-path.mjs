// Verify the sewn and highlighted batten paths on the released Hobie cloth.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {battenPath,battenTexturePaths,clothTopology} from '../viewer/board/sail-battens.mjs';

function point(cloth,[a,b,c,wa,wb,wc]){
  return [0,1,2].map(axis=>wa*cloth[3*a+axis]+wb*cloth[3*b+axis]+wc*cloth[3*c+axis]);
}

function verifyPaths(boat,sail){
  const [count,luff,leech,rest,cloth]=boat.getMany(['battenCount','battenLuff','battenLeech','mesh','vertex']
    .map(name=>`cloth[${sail}].${name}`));
  const texture=battenTexturePaths(sail-1);
  assert.equal(texture.length,count);
  for(let n=0;n<count;n++){
    const path=battenPath(rest,clothTopology,luff[n],leech[n]);
    assert(path.length>0);
    const start=point(rest,path[0].from),end=point(rest,path.at(-1).to);
    assert(end[2]>start[2],'The leech end should sit higher than the luff');
    const coordinates=[path[0].from,...path.map(section=>section.to)];
    assert.equal(texture[n].length,coordinates.length);
    coordinates.forEach(([i,j,k,wi,wj,wk],index)=>{
      const u=((i%4)*wi+(j%4)*wj+(k%4)*wk)/3;
      const v=(Math.floor(i/4)*wi+Math.floor(j/4)*wj+Math.floor(k/4)*wk)/5;
      assert(Math.hypot(texture[n][index][0]-u,texture[n][index][1]-(1-v))<1e-5,
        'Sewn pocket and physics overlay must follow the same cloth path');
    });
    let previous=point(cloth,path[0].from);
    for(const {from,to} of path){
      assert(Math.hypot(...point(cloth,from).map((coordinate,axis)=>coordinate-previous[axis]))<1e-8);
      previous=point(cloth,to);
      for(const side of [from,to]){
        assert(side.slice(3).every(weight=>weight>-1e-8&&weight<1+1e-8));
        const [x,,z]=point(rest,side);
        const cross=(x-start[0])*(end[2]-start[2])-(z-start[2])*(end[0]-start[0]);
        assert(Math.abs(cross)<1e-8,'The batten must lie along a straight seam in the cloth pattern');
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
console.log('All Hobie batten paths are continuous on the loaded cloth and share the sewn seam layout.');
