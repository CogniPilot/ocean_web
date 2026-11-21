// The incoming field at one ENU point should agree across vehicle types and local ages.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const root=process.argv[2]??'build/pages';
const bearing=.45;
const roomTime=4.62;
const roles=['sailing','sloop','flight','submarine','world'];
const gridNames=scalarNames('waves.height',[64,64]);

async function sample(role,ticks,offset){
  const base=pathToFileURL(resolve(root,role)+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters:{prevailingBearing:bearing}});
  try{
    fmu.set_inputs(JSON.stringify(Object.entries({windSpeed:11,windBearing:bearing,seaState:1.1,seaClockOffset:offset,omitWake:1})));
    for(let i=0;i<ticks;i++)fmu.step(.01);
    return fmu.read_values(JSON.stringify(['waves.driftE','waves.driftN',...gridNames]));
  }finally{fmu.free();}
}
const wrap=n=>(n%64+64)%64;
function heightAt([driftE,driftN,...grid],east,north){
  const x=east-driftE,y=north-driftN;
  const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j;
  const at=(e,n)=>grid[64*wrap(n)+wrap(e)];
  return (1-v)*((1-u)*at(i,j)+u*at(i+1,j))+v*((1-u)*at(i,j+1)+u*at(i+1,j+1));
}
const baseline=await sample('sailing',Math.round(100*roomTime),0);
const points=[[-45.3,-18.2],[32,2],[-5.3,5.5],[1,14],[-19,140]];
const results=[];
for(let role=0;role<roles.length;role++){
  const ticks=62+role*40;
  const candidate=await sample(roles[role],ticks,roomTime-ticks*.01);
  const difference=Math.max(...points.map(([east,north])=>Math.abs(heightAt(baseline,east,north)-heightAt(candidate,east,north))));
  results.push({role:roles[role],difference,drift:[candidate[0],candidate[1]]});
}
console.log({baselineDrift:[baseline[0],baseline[1]],results});
assert(results.every(({difference})=>difference<1e-8),'Incident height mismatch at shared ENU points');
const noSync=await sample('submarine',62,0);
assert(points.some(([east,north])=>Math.abs(heightAt(baseline,east,north)-heightAt(noSync,east,north))>.01),
  'Different sea phases should produce different elevation');
