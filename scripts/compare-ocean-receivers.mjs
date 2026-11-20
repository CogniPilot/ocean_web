// Compare a replacement world archive against the previously shipped ocean model.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const fields=['boatWater.tile','sub.ocean.tile','droneWater.tile'];
for(const ocean of ['boatWater','sub.ocean','droneWater']){
  for(const field of ['probe','surface','velocity','gaugePressure'])fields.push(ocean+'.'+field);
}
fields.push('boat.east','boat.north','boat.heave','sub.position','drone.position');
async function open(path){
  const base=pathToFileURL(resolve(path)+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  const session=await openFmuSession({base,index,fetch:fileFetch});
  const names=fields.flatMap(name=>{
    const variable=index.variables.find(v=>v.name===name);
    assert(variable,name);
    return scalarNames(name,variable.dimensions??[]);
  });
  return {session,names,binding:session.bind_outputs(JSON.stringify(names))};
}
const worlds=[];
try{
  for(const path of process.argv.slice(2))worlds.push(await open(path));
  assert.equal(worlds.length,2);
  let compared=0,peak=0;
  for(let tick=0;tick<=200;tick++){
    if([0,60,120].includes(tick)){
      const scenario=tick/60;
      const inputs={windSpeed:[11,16,4][scenario],windBearing:[.45,2.1,-1][scenario],
        seaState:.45,seaClockOffset:13,subManual:1,flightManual:1,sailingManual:1};
      for(const {session} of worlds)session.set_inputs(JSON.stringify(Object.entries(inputs)));
    }
    if(tick%10===0){
      const [a,b]=worlds.map(({session,binding})=>session.read_bound(binding));
      assert.equal(a.length,b.length);
      for(let k=0;k<a.length;k++){
        const diff=Math.abs(a[k]-b[k]);peak=Math.max(peak,diff);
        assert(diff<=1e-7*Math.max(1,Math.abs(a[k])),worlds[0].names[k]+' at tick '+tick+' differs by '+diff);
      }
      compared+=a.length;
    }
    if(tick<200)for(const {session} of worlds)session.step(.01);
  }
  console.log({compared,maximumAbsoluteDifference:peak});
}finally{for(const {session} of worlds)session.free();}
