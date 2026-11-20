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
