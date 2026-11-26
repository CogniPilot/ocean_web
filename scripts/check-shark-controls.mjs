import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {animalSticks} from '../viewer/keyboard-sticks.mjs';

const base=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',base));
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

const direct=(actions,inputs={})=>loadInstance('HarborTraffic',{
  ...start,sharkDirect:1,sharkActuators:actions,...inputs},read);
const close=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} differs from ${b}`);
const balanced=await direct([0,0,.32,.32]);
const lift=balanced.get('whiteShark.pectoralLoad');
assert(lift[1]>0);close(lift[2],0);close(lift[3],0);close(lift[4],lift[5]);
const oneFin=await direct([0,0,.32,-.32]);
const roll=oneFin.get('whiteShark.pectoralLoad');
assert(roll[2]>0);close(roll[1],0);close(roll[2],.91*(roll[4]-roll[5]));
const mirror=await direct([0,0,-.32,.32]);
close(mirror.get('whiteShark.pectoralLoad')[2],-roll[2]);
const drifting=await direct([0,0,.32,-.32],{currentVelocity:[4,0]});
assert(drifting.get('whiteShark.pectoralLoad').every(x=>x===0));
const asymmetric=await direct([0,0,.32,0]);
assert(asymmetric.get('whiteShark.pectoralLoad')[3]>0);
const actions=[.8,-.26,.2,-.35],a=await direct(actions);
const b=await direct(actions,{sharkPilot:[1,-.8,1,-1],sharkBank:1.2,sharkTurn:-1.5,strokeGain:0});
for(let i=0;i<160;i++){
  if(i===60)b.set('sharkPilot',[1,.65,1,6]);
  a.advance(.01);b.advance(.01);
  const fields=['fish','sharkBankState','whiteShark.pectoralLoad','sharkTailForce'];
  assert.deepEqual(a.getMany(fields),b.getMany(fields));
  assert(Math.abs(a.get('whiteShark.peduncleTorque'))<=6200.000001 && a.get('sharkTailPower')<=24500.000001);
}
const state=a.get('fish');close(state[4],0);assert(state[5]>.05 && state[7]<-.15);
close(b.get('swimReserve')[1],1);
const capped=await direct([1,-1,1,-1]),over=await direct([7,-4,2,-8]);
advance(capped,80);advance(over,80);
assert.deepEqual(capped.getMany(['fish','sharkBankState']),over.getMany(['fish','sharkBankState']));
const spinning=await direct([1,0,0,0],{initialFish:[4,0,0,0,0,0,8,0,0,0]});
close(spinning.get('sharkTailPower'),24500);
console.log('Direct shark pectoral lift (N), roll moment (N·m), and saturated shaft power (W)',
  lift[1],roll[2],spinning.get('sharkTailPower'));

// Drive a beat from rest through the policy socket. Estimate leading-edge
// inflow from the observed hinge state to feather the caudal fin.
const rest={initialFish:new Array(10).fill(0)};
const beating=await direct([0,0,0,0],rest),passive=await direct([0,0,0,0],rest);
let impulse=0;
for(let i=0;i<800;i++){
  const x=beating.get('fish'),phase=i*.01*2*Math.PI*1.25;
  const incidence=.5*Math.atan2(-.91*Math.cos(x[5])*x[6],Math.max(.35,x[0]+.91*Math.sin(x[5])*x[6]));
  beating.set('sharkActuators',[Math.cos(phase),incidence/1.22,0,0]);
  beating.advance(.01);passive.advance(.01);
  impulse+=beating.get('sharkTailForce')*.01;
}
const displacement=beating.get('state')[9]-passive.get('state')[9];
assert(displacement>4 && impulse>1000 && beating.get('fish')[0]>1);
console.log('Eight-second external tail stroke, east displacement vs passive (m) and thrust impulse (N·s)',displacement,impulse);

// Each fin samples its own immersion at the surface. Swapping the bank must
// swap the fin that carries the load.
for(const sign of [-1,1]){
  const initialState=[...start.initialState];initialState[11]=0;
  const fin=await direct([0,0,.32,.32],{initialState,initialSharkBank:[sign*.65,0]});
  const loads=fin.get('whiteShark.pectoralLoad');
  assert(sign*(loads[5]-loads[4])>1000);
}

const {weights}=JSON.parse(await readFile(new URL('../viewer/assets/shark-policy.json',import.meta.url)));
async function cruise(turn,pitch,roll,effort){
  const model=await loadInstance('HarborTraffic',{initialState:[0,-28,6,0,2,-25,2,6,0,-900,-200,-7,0,0,0,0,0],initialFish:[2.4,0,0,0,0,0,0,0,0,0],
    sharkDirect:2,sharkPolicyWeights:weights,sharkPilot:[1,pitch,effort,-1],sharkBank:roll,sharkTurn:turn},read);
  advance(model,500);
  const [fish,bank,state]=model.getMany(['fish','sharkBankState','state']);
  return {speed:fish[0],pitch:fish[2],bank:bank[0],heading:state[12]};
}
for(const sign of [-1,1]){
  assert(sign*(await cruise(sign,0,0,.55)).heading>.2);
  assert(sign*(await cruise(0,sign*.6,0,.55)).pitch>.15);
  assert(sign*(await cruise(0,0,sign*.85,.55)).bank>.4);
}
assert((await cruise(0,0,0,1)).speed>(await cruise(0,0,0,0)).speed+.5);
console.log('Learned shark yaw, pitch, bank, effort and partial fin immersion passed');
