// Exercise a stationary model through a complete commanded wave train.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const vessel=await loadInstance('OnrTumblehome',{generatorStart:1,generatorStroke:.10},read);
const [k,omega,duration]=vessel.getMany(['waveNumber','waveOmega','trainDuration']);
const period=2*Math.PI/omega,groupSpeed=40/(duration-8*period);
const peaks=[0,0,0],positions=[632,480,88],arrival=[];
let strokePeak=0,beforeArrival=0,afterArrival=0;
for(let i=0;i<Math.ceil((duration+3)*100);i++){
  vessel.advance(.01);
  if(i%4!==0)continue;
  const [stroke,profile,level,heave,pitch]=vessel.getMany(['plungerTravel','generatorProfile','waveElevation','heave','pitch']);
  const time=vessel.time;
  assert(profile.every(Number.isFinite));
  if(time<1||time>1+8*period)assert.equal(stroke,0);
  strokePeak=Math.max(strokePeak,Math.abs(stroke));
  positions.forEach((index,j)=>{
    const distance=(640-index)*.0625;
    if(time<=1+distance/groupSpeed||time>=1+distance/groupSpeed+8*period)assert.equal(Math.abs(profile[index]),0);
    peaks[j]=Math.max(peaks[j],Math.abs(profile[index]));
    if(Math.abs(profile[index])>.001)arrival[j]??=time;
  });
  if(time<1+32/groupSpeed)beforeArrival=Math.max(beforeArrival,Math.abs(level),Math.abs(heave),Math.abs(pitch));
  else afterArrival=Math.max(afterArrival,Math.abs(heave));
}
assert(strokePeak>.049&&strokePeak<=.05001);
assert(beforeArrival<1e-7&&afterArrival>.001);
for(const peak of peaks)assert(Math.abs(peak-.05*.36*k)<.0003);
assert(arrival[0]<arrival[1]&&arrival[1]<arrival[2]);
console.log({period,groupSpeed,arrival,strokePeak,incidentPeaks:peaks,beforeArrival,peakHeave:afterArrival});

// A stop ramps down the source. Water emitted before the stop continues downstream.
for(const frequency of [.25,1.2,2]){
  const drive=await loadInstance('OnrTumblehome',{generatorStart:0,generatorCycles:64,
    generatorFrequency:frequency,generatorStroke:.25,generatorRampCycles:.25},read);
  let peak=0,tail=0;
  for(let i=0;i<660;i++){
    if(i===120)drive.set('generatorStop',drive.time);
    drive.advance(.01);
    const displacement=drive.get('plungerTravel');
    peak=Math.max(peak,Math.abs(displacement));
    if(drive.time>1.21+.25/frequency){
      assert.equal(displacement,0);
      if(i%10===0)tail=Math.max(tail,...drive.get('generatorProfile'));
    }
  }
  assert(peak>0&&peak<=.5*Math.min(.25,.155/frequency)+1e-8);
  assert(tail>.001);
}
