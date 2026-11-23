import assert from 'node:assert/strict';
import {hullWashMix,waveAmbience} from '../viewer/regatta.mjs';

const silent={swell:0,crest:0,wake:0};
const probes=waveAmbience();
let firstLocations;
for(let i=0;i<180;i++){
  const time=i*.08,tide=.5*Math.cos(time);
  const locations=[];
  const surface=(east,north,optical)=>{
    if(!optical)locations.push([east,north]);
    return tide+.4*Math.sin(east-.13*north)+(optical?.2*Math.sin(east+north):0);
  };
  // Moving the listener across a stationary surface must stay silent,
  // including when the probes move to a new patch or the tide changes.
  const mix=probes.sample(surface,time,22*Math.sin(time*.4),8*Math.sin(time*.8),tide,true);
  assert.deepEqual(mix,silent);
  if(i===0)firstLocations=locations;
  if(i===1)assert.deepEqual(locations,firstLocations);
}

function meanWash(waveHeight,wakeHeight,includeWake){
  probes.reset();
  const mean={...silent},frames=135;
  for(let i=0;i<frames;i++){
    const time=i*.08,tide=.4*Math.sin(time);
    const surface=(east,north,optical)=>tide+waveHeight*Math.sin(.36*east-.15*north-1.9*time)
      +(optical?wakeHeight*Math.sin(.9*east+.3*north-3.5*time):0);
    const mix=probes.sample(surface,time,0,0,tide,includeWake);
    for(const band of Object.keys(mean))mean[band]+=mix[band]/frames;
  }
  return mean;
}

const calm=meanWash(.035,0,true),rough=meanWash(.36,0,true);
assert(calm.swell>0&&rough.swell>2*calm.swell);
assert(rough.crest>4*calm.crest);
assert.equal(rough.wake,0);
const wake=meanWash(0,.12,true);
assert(wake.wake>.05&&wake.swell===0&&wake.crest===0);
assert.deepEqual(meanWash(0,.12,false),silent);
// The independent 100-foot mode should swell smoothly through each crest.
probes.reset();
const k=2*Math.PI/30.48,omega=Math.sqrt(9.80665*k*Math.tanh(k*13.7)),step=.08;
const period=2*Math.PI/omega;
let crestPeak=0;
for(let i=0;i<=3.5*period/step;i++){
  const time=i*step,surface=east=>.48*Math.sin(k*east-omega*time);
  const mix={...probes.sample(surface,time,0,0,0,false)};
  assert.deepEqual(Object.keys(mix),Object.keys(silent));
  assert.deepEqual(probes.sample(surface,time,0,0,0,false),mix,'A duplicate frame changed the wash level');
  crestPeak=Math.max(crestPeak,mix.crest);
}
assert(crestPeak>.08);

assert.deepEqual(hullWashMix(undefined,.3,.2),{gurgle:0,rush:0});
assert.deepEqual(hullWashMix(0,0,0),{gurgle:0,rush:0});
assert(hullWashMix(0,.3,0).gurgle>0);
const slow=hullWashMix(1,0,0),crossfade=hullWashMix(6*1852/3600,0,0),fast=hullWashMix(13*1852/3600,0,0);
assert(slow.gurgle>.2&&slow.rush===0);
assert(crossfade.gurgle>.2&&crossfade.rush>.3);
assert(fast.gurgle===0&&fast.rush>.60);
assert.deepEqual(hullWashMix(-4,0,0),hullWashMix(4,0,0));
for(let speed=1.35;speed<=4.5;speed+=.01){
  const {gurgle,rush}=hullWashMix(speed,0,0);
  assert(Math.hypot(gurgle,rush)>.35,'Hull wash stays audible throughout the blend');
}
console.log({calm,rough,wake,crestPeak});
