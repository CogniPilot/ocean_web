import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {animalSticks} from '../viewer/keyboard-sticks.mjs';

const read=async url=>new Response(await readFile(url));
const start={
  initialState:[0,-28,6,0,2,-25,2,6,0,-30,-30,-5,0,-.06,0,0,0],
  initialFish:[4,0,0,0,0,0,0,0,0,0]
};
const advance=(model,ticks)=>{for(let i=0;i<ticks;i++)model.advance(.01);};

for(const sign of [-1,1]){
  const model=await loadInstance('HarborTraffic',{...start,sharkPilot:[1,0,.65,-1],sharkBank:sign*1.4},read);
  advance(model,100);
  const [roll,rate]=model.get('sharkBankState');
  assert(sign*roll>.55,{roll,rate});
  const resumed=await loadInstance('HarborTraffic',{...start,initialSharkBank:[roll,rate]},read);
  assert.deepEqual(resumed.get('sharkBankState'),[roll,rate]);
  model.set('sharkBank',0);
  advance(model,400);
  assert(Math.abs(model.get('sharkBankState')[0])<.04,'Shark must return to level');
}

for(const [key,sign] of [['ArrowUp',-1],['ArrowDown',1]]){
  const axis=(positive,negative)=>Number(positive===key)-Number(negative===key);
  const pitch=animalSticks(axis,'shark').pitch;
  assert.equal(pitch,sign);
  const model=await loadInstance('HarborTraffic',{...start,sharkPilot:[1,pitch*.45,.65,-1]},read);
  advance(model,100);
  const [fish,bank]=model.getMany(['fish','sharkBankState']);
  assert(sign*fish[2]>.09,key+' must move the shark in the requested direction');
  assert(Math.abs(bank[0])<1e-10,'Pitch alone must preserve level roll');
}
console.log('Shark pitch, mirrored roll, neutral recovery and restored bank passed');
