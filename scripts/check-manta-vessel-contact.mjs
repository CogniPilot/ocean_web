// Check an actual FMI-LS-Wasm vessel component, including the final roster slot.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const directory=pathToFileURL(resolve(process.argv[2]??'build/fleet-menu-preview/submarine')+'/');
const {index:name}=JSON.parse(await readFile(new URL('manifest.json',directory)));
const index=JSON.parse(await readFile(new URL(name,directory)));
const fmu=await openFmuSession({index,base:directory,parameters:{},fetch:fileFetch,downloadFirst:true});
try{
  const vector=(name,count)=>scalarNames(name,[count]);
  function observe(names){
    const binding=fmu.bind_outputs(JSON.stringify(names));
    return ()=>Array.from(fmu.read_bound(binding));
  }
  const pairs=(name,dimensions,values)=>scalarNames(name,dimensions).map((key,i)=>[key,values[i]]);
  const names=new Set(index.variables.map(v=>v.name));
  const probes=[];
  if(names.has('sub.mantaWrench'))probes.push({name:'Piccard',position:observe(vector('sub.position',3)),
    wrench:observe(vector('sub.mantaWrench',6)),offset:[-.10,.54,-.12]});
  if(names.has('animalWrench')){
    const motor=names.has('boatPose');
    const position=observe(motor?vector('boatPose',6):['boat.east','boat.north','boat.heave','boat.heel','boat.pitch','boat.heading']);
    probes.push({name:motor?'Cruiser':'Sailboat',position,wrench:observe(vector('animalWrench',6)),offset:[0,.88,-.12]});
  }
  assert(probes.length,'No vessel contacts in component');
  const joints=new Float64Array(40);joints.set([.28,.4,.18,0],36);
  fmu.set_inputs(JSON.stringify(pairs('animalJoints',[10,4],joints)));
  for(const p of probes){
    const at=p.position(),rows=new Float64Array(90);
    rows.set([3,at[0]+p.offset[0],at[1]+p.offset[1],at[2]+p.offset[2],0,0,0,0,0],81);
    fmu.set_inputs(JSON.stringify(pairs('animalTraffic',[10,9],rows)));
    let peak=0,verticalPeak=0;
    for(let k=0;k<12;k++){
      fmu.step(.01);const w=p.wrench();assert(w.every(Number.isFinite));peak=Math.max(peak,Math.hypot(...w.slice(0,3)));
      verticalPeak=Math.max(verticalPeak,Math.abs(w[2]));
    }
    assert(peak>10,p.name+' failed to register near manta');
    assert(verticalPeak>1,p.name+' failed to resolve vertical wing contact');
    rows[84]-=8;
    fmu.set_inputs(JSON.stringify(pairs('animalTraffic',[10,9],rows)));
    for(let i=0;i<5;i++)fmu.step(.01);
    assert.deepEqual(p.wrench(),Array(6).fill(0),p.name+' generated a force on a separated swimmer');
    console.log(index.modelName,p.name,'peak',peak.toFixed(1),'N, vertical',verticalPeak.toFixed(1),'N, separated load zero');
  }
}finally{fmu.free();}
