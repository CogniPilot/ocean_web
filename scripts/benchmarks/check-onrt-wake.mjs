// Follow probes beside the prescribed tow through successive world grid cells.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadBasin,period} from '../../viewer/onrt-basin.mjs';
import {createWakeDisplayGrid} from '../../viewer/onrt-wake-display.mjs';

const basin=await loadBasin({tow:1,towSpeed:1.11},async url=>new Response(await readFile(url)));
const size=64, register=createWakeDisplayGrid(size,period);
function splineWeights(t){
  return [(1-t)**3/6,(4-6*t*t+3*t**3)/6,(1+3*t+3*t*t-3*t**3)/6,t**3/6];
}
// Equivalent to the GPU's grouped bilinear texture fetches, evaluated in doubles.
function probe(tile,x,y){
  const a=x*size/period,b=y*size/period;
  const i=Math.floor(a),j=Math.floor(b),wx=splineWeights(a-i),wy=splineWeights(b-j);
  let value=0;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    value+=wx[col]*wy[row]*tile[((j+row-1)&63)*size+((i+col-1)&63)];
  }
  return value;
}
let previousNative,previousProbes,sumSquared=0,count=0,peak=0;
for(let tick=0;tick<800;tick++){
  const state=basin.advance();
  if(tick<650)continue;
  const native=basin.wake.get('wakeHeight',new Float32Array(size*size));
  if(previousNative)assert(native.some((v,i)=>v!==previousNative[i]),'Duplicate solver snapshot during steady tow');
  const registered=register(native,state.east,state.north),probes=[];
  for(let y=-1.5;y<=1.5;y+=.075)for(let x=-3.3;x<=1.3;x+=.075){
    if(Math.abs(y)<.22 && x>-1.5)continue;
    const value=probe(registered,x,y);
    if(previousProbes){
      sumSquared+=(value-previousProbes[probes.length])**2;count++;
    }
    probes.push(value);peak=Math.max(peak,Math.abs(value));
  }
  previousNative=native;previousProbes=probes;
}
const rmsMm=1000*Math.sqrt(sumSquared/count);
assert(peak>.01,'Expected a finite-amplitude wake alongside the hull');
assert(rmsMm<.05,`Hull-following wake changed by ${rmsMm} mm RMS per snapshot`);
console.log({rmsMm,probesCompared:count,peak_m:peak});
