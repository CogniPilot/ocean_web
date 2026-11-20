// Prescribed tow in still water, section volumes in m³. Tests the deployed wave FMU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const stations=[-2.55,-1.9,-.9,.15,1.12,1.95,2.55],section=[.009,.02,.027,.028,.015,.003];
async function tow(speed,volumes){
  const w=await loadInstance('HullWake',{east:0,north:0,heading:0,stations,separation:1.02,sectionVolume:volumes},read);
  let crest=0,resistance=0,n=0;
  for(let i=0;i<140;i++){
    const x=i*.05*speed;w.set('east',x);w.advance(.05);
    if(i<60)continue;
    const eta=w.get('eta'),dx=w.get('dx'),ox=w.get('originE'),oy=w.get('originN');
    for(let j=0;j<48;j++)for(let k=0;k<48;k++){
      const e=ox+k*dx-x,y=oy+j*dx;
      if(e>.7&&e<3&&Math.abs(y-1.02)<.65)crest=Math.max(crest,eta[j*48+k]);
    }
    resistance-=w.get('waveForceEast');n++;
  }
  return {crest,resistance:resistance/n};
}
const empty=await tow(2,Array(12).fill(0)),still=await tow(0,[...section,...section]),moving=await tow(2,[...section,...section]);
console.log({empty,still,moving});
assert.equal(empty.crest,0);assert.equal(still.crest,0);assert(moving.crest>.001);assert(moving.resistance>0);
