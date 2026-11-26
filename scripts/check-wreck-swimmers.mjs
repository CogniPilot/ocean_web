// Exercise the same contact law in a manual drop, a guided approach and open water.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {loadInstance}=await import(process.env.SWIMMER_RUNTIME ?? '../viewer/fmi3/instance.mjs');

const read=async url=>new Response(await readFile(url));
for(const whale of [false,true]){
  for(const scenario of ['yatush','satil','approach','legacy','clear']){
    const drop=scenario==='yatush'||scenario==='satil',approach=scenario==='approach';
    const position=scenario==='yatush'?[-24,26,whale?-7.1:-7.35]:scenario==='satil'?[56,-50,whale?-.2:-.3]:
      approach?[-24,7,-8]:scenario==='legacy'?[5.4,.78,-6.8]:[-18,-18,-3];
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

// Piccard's contact surface also includes the thin fins in the last traffic slot.
for(const [x,y,z,kind] of [[0,.9,-.53,'pectoral'],[0,0,.70,'dorsal'],[-1.95,0,.35,'tail'],[0,1.35,.7,'outside']]){
  const p=[-45,-30,-6],model=await loadInstance('Wreck_Plant',{spawnPosition:p},read);
  const rows=new Float64Array(90);
  rows.set([2,p[0]-x,p[1]-y,p[2]-z,0,0,0,0,0],81);
  model.set('animalTraffic',rows);
  for(let i=0;i<4;i++)model.advance(.01);
  assert.equal(Math.hypot(...model.get('mantaWrench').slice(0,3))>0,kind!=='outside',kind);
}
