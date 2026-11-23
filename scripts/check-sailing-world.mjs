// Compare the single-vehicle race with a full world while there is no drone deck load.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {sailingStart,windBearing,windSpeed} from '../viewer/sailing-start.mjs';

const fields=['boat.east','boat.north','boat.heading','boat.surge','boat.heave','boat.heel',
  'boat.peerForce[1]','boat.peerForce[2]','boat.sailForward[1]','boat.sailForward[2]','boat.mainTension','boat.downhaulTension',
  'wind.localEast','wind.localNorth','race.stage','race.heave','race.pinEast','race.pinNorth',
  'race.launchPose[1]','boatWater.surface','waves.waveLoad[1]','waves.waveLoad[2]'];
for(let i=1;i<=12;i++)fields.push('waves.sourceStrips['+i+',3]');
for(let i=1;i<=64;i++)fields.push('waves.height['+i+','+(1+(i*7)%64)+']');
async function open(directory,sailing){
  const base=pathToFileURL(resolve(directory)+'/');
  const {index:name}=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(name,base)));
  assert.equal(index.modelName,sailing?'OceanSailing':'OceanWorld');
  assert.equal(index.variables.some(v=>v.name==='drone.position'),!sailing);
  assert.equal(index.variables.some(v=>v.name==='sub.position'),!sailing);
  const parameters={prevailingBearing:windBearing};
  for(const [key,value] of Object.entries(sailingStart(true)))parameters['boat.'+key]=value;
  const f=await openFmuSession({index,base,fetch:fileFetch,parameters});
  f.set_inputs(JSON.stringify(Object.entries({windSpeed,windBearing,sailingManual:1,downhaul:.5,
    seaState:.45,epoch:100,...(sailing?{}:{idleCamera:1,subManual:1,flightManual:1})})));
  return {f,binding:f.bind_outputs(JSON.stringify(fields)),ms:0};
}
const full=await open(process.argv[2]??'build/world-runtime',false);
const boat=await open(process.argv[3]??'build/sailing-runtime',true);
let worst=0,samples=0,contactPeak=0,wakePeak=0;
try{
  for(let tick=0;tick<600;tick++){
    for(const run of (Math.floor(tick/25)%2?[full,boat]:[boat,full])){
      if(tick%100===0)run.f.set_inputs(JSON.stringify([['rudder',.15*Math.sin(tick)],['trim',tick<100?-.1:0],['omitWake',tick<300?1:0]]));
      if(tick===350){
        const [east,north,yaw,z]=run.f.read_values(JSON.stringify(['boat.east','boat.north','boat.heading','boat.heave']));
        // Give the two opposing bows time to overlap in the sampled mesh solver.
        const peer=[1,east+4.55*Math.cos(yaw),north+4.55*Math.sin(yaw),yaw+Math.PI,
          -1.5*Math.cos(yaw),-1.5*Math.sin(yaw),0,z,1];
        run.f.set_inputs(JSON.stringify(peer.map((v,i)=>['traffic[1,'+(i+1)+']',v])));
      }
      if(tick===370)run.f.set_inputs(JSON.stringify([['traffic[1,1]',0]]));
      const begin=performance.now();run.f.step(.01);
      if(tick>=100)run.ms+=performance.now()-begin;
    }
    if(tick%5!==0)continue;
    const a=full.f.read_bound(full.binding),b=boat.f.read_bound(boat.binding);
    contactPeak=Math.max(contactPeak,Math.abs(b[fields.indexOf('boat.peerForce[1]')]),Math.abs(b[fields.indexOf('boat.peerForce[2]')]));
    if(tick>310)wakePeak=Math.max(wakePeak,Math.abs(b[fields.indexOf('waves.waveLoad[1]')]));
    for(let i=0;i<a.length;i++){
      const error=Math.abs(a[i]-b[i])/(1+Math.abs(a[i]));
      assert(error<1e-7,`tick ${tick}, ${fields[i]}: ${a[i]} / ${b[i]}`);
      worst=Math.max(worst,error);samples++;
    }
  }
  assert(contactPeak>1 && wakePeak>0,JSON.stringify({contactPeak,wakePeak}));
  console.log({samples,worst,contactPeak,wakePeak,fullMsPerStep:full.ms/500,sailingMsPerStep:boat.ms/500});
}finally{boat.f.free();full.f.free();}
