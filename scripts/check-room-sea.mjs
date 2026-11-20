// Two independent FMUs observe the same incoming sea at different local ages.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/world-runtime')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));

async function sample(age,offset){
  const world=await openFmuSession({index,base,fetch:fileFetch});
  try{
    world.set_inputs(JSON.stringify(Object.entries({windSpeed:11,windBearing:.45,seaState:1,seaClockOffset:offset})));
    for(let i=0;i<age;i++)world.step(.01);
    const [east,north,k,dir,phase,tide,subTide,droneTide]=world.read_values(JSON.stringify([
      'boat.east','boat.north','boat.swellK','boat.swellBearing','boat.swellPhase','boatWater.tide','sub.ocean.tide','droneWater.tide'
    ]));
    assert.equal(tide,subTide);assert.equal(tide,droneTide);
    const xyzPhase=phase-k*(east*Math.cos(dir)+north*Math.sin(dir));
    const cells=Array.from({length:1024},(_,i)=>'boatWater.tile['+(1+Math.floor(i/32))+','+(1+i%32)+']');
    return [xyzPhase,tide,...world.read_values(JSON.stringify(cells))];
  }finally{world.free();}
}
const first=await sample(42,0),late=await sample(22,.2),unshifted=await sample(22,0);
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const aligned=error(first,late), baseline=error(first,unshifted);
assert(aligned<1e-7,'Shared sea mismatch '+aligned);
assert(baseline>.01,'Negative control failed to distinguish local clocks');
console.log({aligned,baseline});
