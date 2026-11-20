import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const w=await loadInstance('MarineWind',{east:-8,north:-7,meanEast:10,meanNorth:4},read);
for(let i=0;i<5;i++){w.set('east',-8+i*.5);w.advance(.25);}
const field=w.get('field'),local=[w.get('localEast'),w.get('localNorth')];
const speeds=field.filter((_,i)=>i%3===2);
assert(field.every(Number.isFinite));assert(Math.max(...speeds)-Math.min(...speeds)>3);
function bilinear(k){
  const x=45,y=44.5;
  return .5*(field[(Math.floor(y)*48+x)*3+k]+field[(Math.ceil(y)*48+x)*3+k]);
}
console.log({local,grid:[bilinear(0),bilinear(1)],range:[Math.min(...speeds),Math.max(...speeds)]});
assert(local.every((v,i)=>Math.abs(v-bilinear(i))<1e-8));
w.set('droneEast',42);w.set('droneNorth',6);w.advance(.25);
const sampled=w.get('droneWind'),grid=w.get('field');
assert.deepEqual(sampled,[grid[(3*48+21)*3],grid[(3*48+21)*3+1],0]);

// Anchor an off-diagonal cell to the analytic field. Reading the drone and
// grid alone cannot detect a transpose if both sample the same wrong grid.
const east=42,north=6,period=w.get('period'),seed=w.get('seed'),t=w.get('weatherTime');
const dx=w.get('gustEast'),dy=w.get('gustNorth'),bearing=Math.atan2(4,10);
const mod=(x,p)=>x-p*Math.floor(x/p);
let gain=1,turn=.12*Math.sin(t/37+seed)+.075*Math.sin(t/21+.3*seed);
for(let g=1;g<=8;g++){
  const cx=59.17*g+7.3*seed+dx+.6*g*Math.sin(.027*t+g);
  const cy=37.61*g+3.6*seed+dy+.4*g*Math.cos(.043*t+g);
  const x=mod(east-cx+period/2,period)-period/2,y=mod(north-cy+period/2,period)-period/2;
  const along=(x*Math.cos(bearing)+y*Math.sin(bearing))/(6+mod(g*4.3,10));
  const across=(y*Math.cos(bearing)-x*Math.sin(bearing))/(3.5+mod(g*1.45,4));
  const weight=Math.exp(-.5*(along**2+across**2));
  gain+=weight*(g%4===0?-.30:.48)*(.72+.28*Math.sin(t/(7+g)+g+seed));
  turn+=weight*.30*Math.sin(2.3*g+seed);
}
const speed=Math.hypot(10,4)*gain;
assert(Math.hypot(sampled[0]-speed*Math.cos(bearing+turn),sampled[1]-speed*Math.sin(bearing+turn))<1e-8);
