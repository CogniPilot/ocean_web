// The default whale and shark share one FMU but retain independent room identities.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {wildlifeActorId,wildlifeObservations} from '../viewer/manta.mjs';

const read=async url=>new Response(await readFile(url));
const model=await loadInstance('HarborTraffic',{},read);
const whaleId=wildlifeActorId('whale'),sharkId=wildlifeActorId('shark');
model.set('observerIds',[whaleId,sharkId]);
const origin=model.get('whale'),shark=model.get('state').slice(9,13);
const animal=(id,kind,p)=>({id,kind,x:p[0],y:p[1],z:p[2]});
function observe(actors){
  const {craft,craftHull}=wildlifeObservations(actors,new Set(),shark.slice(0,3),false,origin.slice(0,3));
  model.set('craft',craft);model.set('craftHull',craftHull);
  for(let i=0;i<24;i++)model.advance(.01);
  const m=model.get('guidanceMemory');
  return [m[0],m[3]];
}
const whale=animal('whale','whale',origin),fish=animal('shark','shark',shark);
assert.deepEqual(observe([whale,fish]),[sharkId,whaleId]);
assert.deepEqual(observe([fish]),[sharkId,0],'shark must not select itself');
assert.deepEqual(observe([whale]),[0,whaleId],'whale must not select itself');
const farther={...fish,id:'remote-sub',kind:'sub',x:shark[0]+28};
const host={...fish,id:'local',kind:'motorboat',x:shark[0]+20,local:true};
const nearby={...fish,id:'other',kind:'boat',x:shark[0]+2};
const interested=observe([host,farther,nearby]);
assert.equal(interested[1],wildlifeActorId('other'),'closer peer wins despite a host and a Piccard within perception range');
const distant=Array.from({length:36},(_,i)=>({id:'craft'+i,kind:'boat',x:i<18?i*.2:160+i*.2,y:0,z:0}));
const crowded=wildlifeObservations(distant,new Set(),[0,0,0],false,[167.2,0,0]).craft;
const identifiers=new Set(Array.from({length:32},(_,i)=>crowded[8*i]));
assert(identifiers.has(wildlifeActorId('craft0'))&&identifiers.has(wildlifeActorId('craft35')));
console.log('Independent whale/shark perception, closest vessel selection and crowded-room coverage passed.');
