import assert from 'node:assert/strict';
import {waveAmbience} from '../viewer/regatta.mjs';

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
console.log({calm,rough,wake});
