import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
for(const name of ['Sailboat','Hobie16']){
  async function sample(speed,height,peer=false){
    const traffic=new Float64Array(36);if(peer)traffic.set([1,-8.2,-6.8,-2.1,0,0,0,height,Number(name==='Hobie16')]);
    const b=await loadInstance(name,{launchSpeed:speed,launchHeight:height,traffic},read);
    return {wet:b.get('wetFoil'),skin:b.get('skinArea'),drag:b.get('skinDrag'),foil:b.get('foilAxial'),contact:b.get('peerForce')};
  }
  const forward=await sample(2,0),astern=await sample(-2,0),flying=await sample(2,2),bump=await sample(0,0,true);
  console.log(name,JSON.stringify({forward,astern,flying,bump:bump.contact}));
  assert(forward.drag<0&&astern.drag>0&&forward.skin>0);
  assert(forward.foil[1]<0&&astern.foil[1]>0);
  assert(flying.foil.every(v=>v===0)&&flying.skin===0&&flying.drag===0);
  assert(Math.hypot(...bump.contact)>1);
}
