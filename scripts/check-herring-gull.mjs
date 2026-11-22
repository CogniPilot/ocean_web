// Exercise the shipped WebAssembly with the same 10 ms communication step as the harbour.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const fromDisk=async url=>({json:async()=>JSON.parse(await readFile(url))});
const open=settings=>loadInstance('HerringGull',settings,fromDisk);
const dt=.01;

for(const speed of [8,10.6,13.4]){
  const bird=await open({straightFlight:1,glideOnly:1,trimSpeed:speed,startState:[0,0,150,0,speed,0,0,0]});
  for(let i=0;i<3000;i++)bird.advance(dt);
  const [x,power]=bird.getMany(['x','power']);
  const sink=-x[5],glideRatio=x[4]/sink;
  assert(x.every(Number.isFinite)&&power===0&&sink>.45&&sink<1.1);
  if(speed===10.6)assert(glideRatio>14&&glideRatio<17);
  console.log('Glide', {airspeed:x[4],sink,glideRatio});
}

for(const sign of [-1,1]){
  const bird=await open({straightFlight:1,glideOnly:1,startMemory:[0,0,.015,0,sign*.07,0,0]});
  const initial=bird.get('moments')[0];
  bird.advance(dt);
  const bank=bird.get('memory')[0];
  assert(sign*initial>0&&sign*bank>0);
  const tail=await open({straightFlight:1,glideOnly:1,startMemory:[0,0,.015,0,0,sign*.2,0]});
  assert(sign*tail.get('tailLift')>0&&sign*tail.get('moments')[1]<0);
  console.log('Opposite controls',{sign,initialRollMoment:initial,bankAfter10ms:bank,tailLift:tail.get('tailLift'),pitchMoment:tail.get('moments')[1]});
}

const switched=await open({glideOnly:1,straightFlight:1,startState:[4,-12,7,0,10,0,0,0]});
for(let i=0;i<20;i++)switched.advance(dt);
assert.equal(switched.get('x')[7],0);
switched.set('glideOnly',0);
switched.advance(dt);
assert(switched.get('x')[7]>0,'Releasing glide must resume the held flap command on the next step');

async function fly(pitch,bank,flap){
  const pilot=await open({startState:[0,0,80,0,13.4,0,0,0]});
  pilot.set('pilot',[1,pitch,bank,flap]);
  for(let i=0;i<100;i++)pilot.advance(dt);
  return pilot.getMany(['x','memory']);
}
for(const sign of [-1,1]){
  const [[,,altitude], [,,pitch]]=await fly(sign,0,1);
  assert(sign*(altitude-80)>1&&sign*pitch>.1,'Pitch should climb or descend as commanded');
  const [[,,,heading],[bank]]=await fly(0,sign,1);
  assert(sign*bank>.6&&sign*heading>.2,'Bank should turn the bird in the commanded direction');
}
const [[,,,,,,,flapping]]=await fly(0,0,1);
const [[,,,,,,,gliding]]=await fly(0,0,-1);
assert(flapping>.9&&gliding===0,'Flap and glide commands must control wing strokes');

const bird=await open({wind:[0,11]});
const cycles=[];
let previousStroke=0,lastCrossing=0,peakPower=0,power=0,airspeed=0,samples=0,gaps=0,lastMode=1;
const start=performance.now();
for(let i=0;i<9000;i++){
  bird.advance(dt);
  const [x,wings,memory,watts]=bird.getMany(['x','wings','memory','power']);
  if(i<2000)continue;
  assert(x[2]>2&&Math.abs(memory[0])<.85&&Math.abs(memory[4])<=.10&&Math.abs(memory[5])<=.305);
  assert(watts>=0&&watts<=35.000001);
  if(x[7]>.85&&previousStroke<=.095&&wings[0]>.095){
    if(lastCrossing&&(bird.time-lastCrossing)<.4)cycles.push(bird.time-lastCrossing);
    lastCrossing=bird.time;
  }
  if(memory[6]!==lastMode)gaps++;
  lastMode=memory[6];previousStroke=wings[0];
  power+=watts;peakPower=Math.max(peakPower,watts);airspeed+=x[4];samples++;
}
const stepUs=1000*(performance.now()-start)/9000;
const beatHz=cycles.length/cycles.reduce((a,b)=>a+b,0);
assert(Math.abs(beatHz-3.13)<.06&&gaps>=2&&airspeed/samples>11&&airspeed/samples<15);
console.log('Harbour circuit',{airspeed:airspeed/samples,beatHz,flapGlideChanges:gaps,meanPower:power/samples,peakPower,stepWithTelemetryUs:stepUs});

const [state,memory]=bird.getMany(['x','memory']);
assert.deepEqual(bird.getMany(Array(129).fill('x')),Array(129).fill(state));
const successor=await open({wind:[0,11],startState:state,startMemory:memory});
for(let i=0;i<100;i++){bird.advance(dt);successor.advance(dt);}
const [a,b]=[bird,successor].map(m=>m.getMany(['x','memory']).flat());
const difference=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
assert(difference<1e-6,'handoff error '+difference);
console.log('One second after handoff',{largestStateDifference:difference});
