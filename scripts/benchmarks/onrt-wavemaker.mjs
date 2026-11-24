// Exercise a stationary model through a complete commanded wave train.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const vessel=await loadInstance('OnrTumblehome',{generatorStart:1,generatorStroke:.10},read);
const [k,omega,duration]=vessel.getMany(['waveNumber','waveOmega','trainDuration']);
const period=2*Math.PI/omega,groupSpeed=40/(duration-8*period);
const peaks=[0,0,0],positions=[158,120,22],arrival=[];
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
    const distance=(160-index)*.25;
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
