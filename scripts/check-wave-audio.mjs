import assert from 'node:assert/strict';
import {hoistWaterEntry,hullLappingMix,hullWashMix,surfaceSlap,waveAmbience} from '../viewer/regatta.mjs';

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

assert.deepEqual(hullWashMix(undefined,.3,.2),{gurgle:0,rush:0,gurgleRate:1});
assert.deepEqual(hullWashMix(0,0,0),{gurgle:0,rush:0,gurgleRate:1});
const knot=1852/3600;
const glide=hullWashMix(knot,0,0,true),cruise=hullWashMix(6*knot,0,0,true);
assert(glide.gurgle>0&&glide.gurgle<.20*cruise.gurgle&&glide.rush===0);
assert(glide.gurgleRate<.8&&cruise.gurgleRate>1);
assert(hullWashMix(0,.3,0,true).gurgle>0,'Swell can still lap a stationary Hobie');
assert.equal(hullWashMix(knot,0,0).gurgleRate,1);
assert(hullWashMix(0,.3,0).gurgle>0);
const slow=hullWashMix(1,0,0);
assert(slow.gurgle>.2&&slow.rush===0);
assert.deepEqual(hullWashMix(-4,0,0),hullWashMix(4,0,0));
for(const catamaran of [false,true]){
  for(const speed of [6,9.9,10]){
    const {gurgle,rush}=hullWashMix(speed*knot,.3,.2,catamaran);
    assert(gurgle>.2&&rush===0,'The fast wash stays silent through ten knots');
  }
  const crossfade=hullWashMix(11.5*knot,0,0,catamaran),fast=hullWashMix(13*knot,0,0,catamaran);
  assert(crossfade.gurgle>.2&&crossfade.rush>.3);
  assert(fast.gurgle===0&&fast.rush>.60);
  for(let speed=10;speed<=13;speed+=.05){
    const {gurgle,rush}=hullWashMix(speed*knot,0,0,catamaran);
    assert(Math.hypot(gurgle,rush)>.35,'Hull wash stays audible throughout the blend');
  }
}
assert.equal(hullLappingMix(true,0,undefined),1);
for(const z of [-10,-.30,.26,.73])assert.equal(hullLappingMix(true,z,undefined),0);
for(const z of [-.15,.15])assert(hullLappingMix(true,z,undefined)>0&&hullLappingMix(true,z,undefined)<1);
assert.equal(hullLappingMix(false,0,0),1);
assert(hullLappingMix(false,0,1)<1&&hullLappingMix(false,0,1)>0);
assert.equal(hullLappingMix(false,0,2),0);
assert.equal(hullLappingMix(false,0,-1),hullLappingMix(false,0,1));
console.log({calm,rough,wake,crestPeak});

const entry=hoistWaterEntry(),lower={rider:'p',goal:0},recover={rider:'p',goal:1};
assert.equal(entry(lower,-.02),false,'Joining a wet launch must be silent');
assert.equal(entry(recover,.5),false);
assert.equal(entry(lower,.075),false);
assert.equal(entry(lower,-.002),true);
for(const z of [.13,-.06,.09,-.09])assert.equal(entry(lower,z),false,'Waves must not replay a launch');
assert.equal(entry(recover,.3),false);
assert.equal(entry(lower,-.02),true,'A recovered sub can make another entry');
assert.equal(entry({rider:null},-.4),false);

const slap=surfaceSlap(.10,.65,.4);
assert.equal(slap(0,-.02),0,'already submerged on join');
assert.equal(slap(.10,.20),0,'re-entry armed above water');
assert.equal(slap(.15,.08),0,'still airborne');
assert.equal(slap(.15,.08),0,'duplicate display frames preserve the previous sample');
assert(slap(.20,-.03)>2,'downward crossing plays once');
assert.equal(slap(.24,-.09),0,'no repeats while immersed');
assert.equal(slap(.30,.16),0);
assert.equal(slap(.36,-.01),0,'cooldown suppresses a second strike in the same splash');
assert.equal(slap(.56,.12),0);
assert.equal(slap(.75,.02),0);
assert.equal(slap(.83,-.015),0,'slow immersion is silent');
assert.equal(slap(.9,.25),0);
assert.equal(slap(1.4,-.02),0,'a pause drops the crossing');
