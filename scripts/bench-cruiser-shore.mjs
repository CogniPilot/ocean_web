// Compare the coupled browser FMU at fixed, matched initial conditions.
// Run separately against each packaged revision with node --no-liftoff.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/motorboat')+'/');
const read=async path=>JSON.parse(await readFile(new URL(path,base)));
const index=await read((await read('manifest.json')).index);
const cases=[['offshore',-182,105,false],['reef',17,22.4,false],['shoal',21,40,true],['beach',22.5,40,true]];
function summarize(data){
  const sorted=data.toSorted((a,b)=>a-b);
  return {median:sorted[Math.floor(data.length*.5)],p95:sorted[Math.floor(data.length*.95)],
    mean:data.reduce((a,b)=>a+b,0)/data.length};
}
for(const [site,east,north,grounded] of cases){
  const plant=await openFmuSession({base,index,fetch:fileFetch,downloadFirst:true,
    parameters:{initialEast:east,initialNorth:north,initialHeading:1.5}});
  try{
    plant.set_inputs(JSON.stringify([['windSpeed',0],['seaState',0],['omitWake',1],['throttleLever',0]]));
    const output=plant.bind_outputs(JSON.stringify(Array.from({length:6},(_,i)=>'shoreWrench['+(i+1)+']')));
    const step=[],read=[],warmup=6;
    let peakForce=0;
    for(let tick=0;tick<warmup+30;tick++){
      const start=performance.now();plant.step(.01);const advanced=performance.now();
      const wrench=plant.read_bound(output),end=performance.now();
      assert(wrench.every(Number.isFinite));
      peakForce=Math.max(peakForce,Math.hypot(...wrench.slice(0,3)));
      if(tick>=warmup){step.push(advanced-start);read.push(end-advanced);}
    }
    assert(grounded?peakForce>1000:peakForce===0,site+' shoreline force '+peakForce);
    console.log(JSON.stringify({site,stepMs:summarize(step),readWrenchMs:summarize(read),peakNewtons:peakForce}));
  }finally{plant.free();}
}
