// Verify vehicle-selected SLAM and imager duty cycling in the compiled, coupled world.
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
  const graph=bind('keyframes',[48,180]),state=bind('estimate',[21]);
  function check(inputs,active){
    const before=world.read_bound(graph);
    world.set_inputs(JSON.stringify(Object.entries(inputs)));
    for(let i=0;i<40;i++)world.step(.01);
    const image=world.read_bound(camera),observed=world.read_bound(sensors);
    assert.equal(image.some(pixel=>pixel>0),active);
    assert(observed[58]>0 && observed.slice(4,8).some(range=>range>0),'Pressure and DVL should continue sampling');
    if(active){
      assert(world.read_bound(state)[15]>0,'Camera should detect features');
    }else{
      assert(world.read_bound(features).every(x=>x===-1));
      assert.deepEqual(world.read_bound(graph),before,'Inactive SLAM should preserve the map');
      assert.equal(world.read_bound(state)[17],0,'Inactive SLAM should skip scan matching');
      if(inputs.subManual===1)assert(observed.slice(8,57).every(x=>x===0),'Manual idle sub should skip sonar');
    }
  }
  check({idleCamera:0,subManual:1,flightManual:1},true);
  check({idleCamera:1,subManual:1,flightManual:1},false);
  check({idleCamera:1,subManual:0},false);
  check({idleCamera:1,subManual:1,flightManual:0},false);
  check({idleCamera:0},true);
  console.log('Verified selected SLAM, frozen inactive map, pressure/DVL and reactivation.');
}finally{world.free();}
