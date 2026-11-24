// Exercise the same contact law in a manual drop, a guided approach and open water.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
for(const whale of [false,true]){
  for(const scenario of ['drop','approach','clear']){
    const drop=scenario==='drop',approach=scenario==='approach';
    const position=drop?[5.4,.78,whale?-4.2:-4.85]:approach?[12,-16,-8]:[-18,-18,-3];
    const speed=drop?0:2,heave=drop?-3:0,heading=approach?Math.PI/2:0;
    const pilot=[Number(drop),-.7,.5,-1];
    const settings=whale?{
      initialSwimmer:[...position,speed,heave,0,0,0,0,heading,0,0,0,0,0,0,0,0],whalePilot:pilot
    }:{
      initialState:[0,-28,6,0,2,-25,2,6,0,...position,heading,-.06,0,0,0],
      initialFish:[speed,heave,0,0,0,0,0,0,0,0],sharkPilot:pilot
    };
    const model=await loadInstance('HarborTraffic',settings,read);
    let peak=0,first,minimumGap=Infinity;
    for(let i=0;i<(approach?800:180);i++){
      model.advance(.01);
      const [force,gap]=model.get(whale?'whaleContact':'sharkContact');
      assert(Number.isFinite(force)&&Number.isFinite(gap));
      if(force>0&&first===undefined)first=model.time;
      peak=Math.max(peak,force);minimumGap=Math.min(minimumGap,gap);
    }
    if(drop)assert(first>.01&&peak>100&&minimumGap>-.3);
    else assert.equal(peak,0);
    console.log(whale?'whale':'shark',scenario,{peak,first,minimumGap});
  }
}
