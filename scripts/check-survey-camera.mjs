// Verify optional imager duty cycling in the compiled, coupled world.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2])+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const world=await openFmuSession({index,base,fetch:fileFetch});
try{
  const bind=(name,shape)=>world.bind_outputs(JSON.stringify(scalarNames(name,shape)));
  const camera=bind('image',[864]),sensors=bind('sensor',[91]),features=bind('features',[24,5]);
  function check(inputs,active){
    world.set_inputs(JSON.stringify(Object.entries(inputs)));
    for(let i=0;i<20;i++)world.step(.01);
    const image=world.read_bound(camera),observed=world.read_bound(sensors);
    assert.equal(image.some(pixel=>pixel>0),active);
    assert(observed[58]>0 && observed.slice(4,8).some(range=>range>0),'Pressure and DVL should continue sampling');
    if(!active)assert(world.read_bound(features).every(x=>x===-1));
  }
  check({subManual:1,flightManual:1,idleCamera:1},false);
  check({idleCamera:0},true);
  check({idleCamera:1,subManual:0},true);
  check({subManual:1,flightManual:0},true);
  check({flightManual:1},false);
  console.log('Verified manual selection, both autopilots, pressure and DVL across five camera transitions.');
}finally{world.free();}
