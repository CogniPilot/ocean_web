// Check component isolation and measure fixed 10 ms steps without a renderer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const [root='build/pages', ...requested]=process.argv.slice(2);
const vehicles=['boat','drone','sub'];
const expected={world:vehicles,sailing:['boat'],sloop:['boat'],flight:['drone'],submarine:['sub']};
for(const role of requested.length?requested:Object.keys(expected)){
  assert(Object.hasOwn(expected,role),'Unknown component '+role);
  const base=pathToFileURL(resolve(root,role)+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  const present=vehicles.filter(vehicle=>index.variables.some(v=>v.name.startsWith(vehicle+'.')));
  assert.deepEqual(present,expected[role],role+' vehicle plants');
  const parameters=present.includes('sub')?{surveyAtStartup:0}:{};
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters});
  try{
    const inputs={windSpeed:11,windBearing:Math.PI/2,epoch:1700000000,omitWake:0};
    if(present.includes('boat'))inputs.sailingManual=1;
    if(present.includes('sub'))Object.assign(inputs,{subManual:1,idleCamera:role==='submarine'?-1:1});
    if(present.includes('drone'))inputs.flightManual=1;
    fmu.set_inputs(JSON.stringify(Object.entries(inputs)));
    const outputs=['race.countdown','wind.localEast',...present.map(vehicle=>vehicle==='boat'?'boat.east':vehicle+'.position[1]')];
    const binding=fmu.bind_outputs(JSON.stringify(outputs));
    for(let i=0;i<100;i++)fmu.step(.01);
    const samples=[];
    for(let i=0;i<600;i++){
      const start=performance.now();
      fmu.step(.01);
      const values=fmu.read_bound(binding);
      samples.push(performance.now()-start);
      assert(values.every(Number.isFinite),role+' state at '+fmu.time());
    }
    samples.sort((a,b)=>a-b);
    const meanMs=samples.reduce((sum,ms)=>sum+ms,0)/samples.length;
    console.log(role,{vehicles:present,meanMs,p95Ms:samples[Math.ceil(.95*samples.length)-1],realTimeFactor:10/meanMs});
  }finally{
    fmu.free();
  }
}
