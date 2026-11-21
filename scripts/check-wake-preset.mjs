// Exercise live preset changes against the integrated world used by the browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/world-runtime')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const world=await openFmuSession({index,base,fetch:fileFetch});
const read=names=>world.read_values(JSON.stringify(names));
const wakeNames=Array.from({length:64},(_,i)=>'waves.wakeHeight[1,'+(i+1)+']');
const loadNames=[1,2,3].map(i=>'waves.waveLoad['+i+']');
const advance=n=>{for(let i=0;i<n;i++)world.step(.01);};
const maxAbs=values=>Math.max(...Array.from(values,Math.abs));
try{
  world.set_inputs(JSON.stringify([['windSpeed',11],['windBearing',.45],['sailingManual',1]]));
  advance(40);
  assert(maxAbs(read(loadNames))>1e-8,'A moving hull generates a wake load');
  assert(maxAbs(read(wakeNames))>1e-8,'A moving hull supplies crests to the renderer');
  world.set_inputs(JSON.stringify([['omitWake',1]]));
  advance(20);
  assert.equal(maxAbs(read(loadNames)),0);
  assert.equal(maxAbs(read(wakeNames)),0,'Low clears the hull-only elevation');
  const waves=read(['boatWater.tile[1,1]','boatWater.tile[2,2]','boatWater.tile[1,2]']);
  assert(maxAbs(waves)>1e-5,'Wind-driven water remains active on Low');
  world.set_inputs(JSON.stringify([['omitWake',0]]));
  advance(10);
  assert.equal(maxAbs(read(loadNames)),0,'Restart establishes the displacement reference');
  advance(30);
  assert(maxAbs(read(loadNames))>1e-8,'Wake response resumes');
  console.log('Wake load, incident waves and live preset switching passed');
}finally{world.free();}
