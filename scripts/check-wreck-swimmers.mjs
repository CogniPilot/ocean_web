import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async u=>new Response(await readFile(u));
for(const whale of [false,true])for(const scenario of ['drop','toward','clear']){
 const pos=scenario==='drop'?[5.4,.78,whale?-4.2:-5.4]:scenario==='toward'?[12,-16,-8]:[-18,-18,-3];
 const yaw=scenario==='toward'?Math.PI/2:0,w=scenario==='drop'?-3:0;
 const u=scenario==='drop'?0:2;
 const state=[...pos,u,w,0,0,0,0,yaw,0,0,0,0,0,0,0,0];
 const m=await loadInstance('HarborTraffic',whale?{initialSwimmer:state,whalePilot:[Number(scenario==='drop'),-.7,.5,-1]}:
 {initialState:[0,-28,6,0,2,-25,2,6,0,...pos,yaw,-.06,0,0,0],initialFish:[u,w,0,0,0,0,0,0,0,0],sharkPilot:[Number(scenario==='drop'),-.7,.5,-1]},read);
 let peak=0,first,lowest=0,closest=Infinity;
 for(let i=0;i<(scenario==='toward'?800:180);i++){
  m.advance(.01);
  const [f,g]=m.get(whale?'whaleContact':'sharkContact');
  if(f>0 && first===undefined)first=m.time;
  peak=Math.max(peak,f);lowest=Math.min(lowest,g);
  const xyz=whale?m.get('swimmerState').slice(0,3):m.get('state').slice(9,12);
  if(!xyz.every(Number.isFinite))throw Error('nonfinite');
  closest=Math.min(closest,Math.abs(xyz[1]));
 }
 if(scenario==='drop' ? !(peak>0 && first>0.01) : peak!==0)throw Error(JSON.stringify({whale,scenario,peak,first,lowest}));
 console.log({whale,scenario,peak,first,lowest,closest,pose:whale?m.get('swimmerState').slice(0,3):m.get('state').slice(9,12)});
}
