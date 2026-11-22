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

function advance(model,steps){
  for(let i=0;i<steps;i++)model.advance(dt);
}
for(const wind of [[0,0],[-4,0],[4,0],[0,8]]){
  const swimmer=await open({wind,startState:[0,0,1,0,11,-.75,0,0]});
  swimmer.set('pilot',[1,-1,0,-1]);
  advance(swimmer,350);
  const landed=swimmer.get('x'),contact=swimmer.get('surfaceMotion');
  assert(Math.abs(landed[2]-.043)<.01&&contact[0]>.9&&Math.abs(contact[2])<.05);
  swimmer.set('pilot',[1,0,.3,1]);
  advance(swimmer,200);
  const paddled=swimmer.get('x'),motion=swimmer.get('surfaceMotion');
  assert(paddled[0]>landed[0]+.8&&paddled[3]>.3&&motion[2]>.55&&paddled[7]<.04);
  swimmer.set('pilot',[1,1,0,1]);
  advance(swimmer,700);
  const airborne=swimmer.get('x'),afterLaunch=swimmer.get('surfaceMotion');
  assert(airborne[2]>4&&afterLaunch[0]===0&&afterLaunch[1]>10);
  console.log('Water landing, turn and takeoff',{wind,draft:.093-landed[2],paddle:motion[2],altitude:airborne[2]});
}

// Landing with takeoff held must require a release, including in a headwind.
const parked=await open({wind:[-10,0],startState:[0,0,.062,0,10,-.4,0,.3],pilot:[1,1,0,1]});
advance(parked,150);
let surface=parked.get('surfaceMotion');
assert.equal(surface[3],1);
assert(parked.get('x')[7]<.005);
parked.set('pilot',[1,0,0,0]);
advance(parked,25);
assert.equal(parked.get('surfaceMotion')[3],2);
let drySamples=0;
for(let i=0;i<350;i++){
  const phase=14*i*dt;
  parked.set('seaLevel',.14*Math.sin(phase));
  parked.set('surfaceVerticalSpeed',1.96*Math.cos(phase));
  parked.advance(dt);
  surface=parked.get('surfaceMotion');
  if(surface[0]===0)drySamples++;
  assert.equal(surface[3],2,'A wave trough must not unlatch swimming');
  assert(parked.get('x')[7]<.005,'Water motion must not start a wing stroke');
}
assert(drySamples>0,'Exercise temporary loss of buoyancy contact');
parked.set('seaLevel',0);
parked.set('surfaceVerticalSpeed',0);
advance(parked,120);
parked.set('pilot',[1,0,.6,0]);
advance(parked,100);
surface=parked.get('surfaceMotion');
assert(surface[4]<0&&surface[5]>0,'Turn in place with opposite foot strokes');
assert(Math.abs(surface[2])<.01&&parked.get('x')[3]>.4);
parked.set('pilot',[1,1,0,1]);
advance(parked,650);
assert.equal(parked.get('surfaceMotion')[3],0,'A rearmed takeoff should return to flight');
assert(parked.get('x')[2]>4);
console.log('Latched swimming and rearmed takeoff',{drySamples,portPaddle:surface[4],starboardPaddle:surface[5]});

const rider=await open({startState:[0,0,.043,0,0,0,0,0]});
let heaveError=0;
for(let i=0;i<500;i++){
  const phase=(i+1)*dt*2;
  const surface=.12*Math.sin(phase);
  rider.set('seaLevel',surface);
  rider.set('surfaceVerticalSpeed',.24*Math.cos(phase));
  rider.advance(dt);
  if(i>100)heaveError=Math.max(heaveError,Math.abs(rider.get('x')[2]-surface-.043));
}
assert(heaveError<.025,'The gull should track the local surface under wave motion');
console.log('Wave following',{heaveError});

const gustCase={startState:[0,0,30,0,12.7,0,0,0],straightFlight:1,glideOnly:1};
const steady=await open(gustCase),gusty=await open(gustCase);
gusty.set('gust',[-3,2]);
advance(steady,40);advance(gusty,40);
const calm=steady.get('x'),gusted=gusty.get('x');
assert(gusted[5]>calm[5]+.4&&gusted[3]<calm[3]-.01,'A headwind should add lift and crosswind should turn the bill into the gust');
console.log('Gust response',{verticalSpeedChange:gusted[5]-calm[5],headingChange:gusted[3]-calm[3]});
