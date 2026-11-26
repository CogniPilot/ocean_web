// Replay one boat's actual displacement onto a second world's water grid.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const senderDirectory=resolve(process.argv[2]??'build/world-runtime');
const receiverDirectory=resolve(process.argv[3]??senderDirectory);

async function open(directory){
  const base=pathToFileURL(directory+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  const world=await openFmuSession({index,base,fetch:fileFetch});
  const values={windSpeed:11,windBearing:.45,sailingManual:1,subManual:1,flightManual:1};
  const available=new Set(index.variables.map(v=>v.name));
  world.set_inputs(JSON.stringify(Object.entries(values).filter(([name])=>available.has(name))));
  return {world,name:index.modelName};
}

const worlds=[];
const bind=(world,name,shape)=>world.bind_outputs(JSON.stringify(scalarNames(name,shape)));
const maxDiff=(a,b)=>a.reduce((peak,x,i)=>Math.max(peak,Math.abs(x-b[i])),0);
let peakElevation=0,peakReceiverHeight=0,peakForce=0;
try{
  const components=[];
  for (const directory of [senderDirectory,receiverDirectory,receiverDirectory]){
    const component=await open(directory);
    components.push(component);worlds.push(component.world);
  }
  const [sender,receiver,quiet]=worlds;
  const role=components[1].name;
  const hasHull=role==='OceanWorld'||role==='OceanSailing'||role==='OceanSloop';
  const strips=bind(sender,'waves.sourceStrips',[12,3]);
  const load=[receiver,quiet].map(w=>bind(w,'waves.waveLoad',[3]));
  const heights=[receiver,quiet].map(w=>bind(w,'waves.height',[64,64]));
  const sampledWater={OceanSubmarine:['receiverWater',[7]],OceanFlight:['waterOffset',[]]};
  const receiverWater=sampledWater[role]??['waves.sectionHeight',[2,6]];
  const sections=[receiver,quiet].map(w=>bind(w,...receiverWater));
  const writer=receiver.bind_inputs(JSON.stringify(scalarNames('peerWake',[4,38])));
  // A dedicated vehicle can spawn at a different harbor site from the sender.
  const origin=world=>world.read_bound(world.bind_outputs(JSON.stringify(['waves.east','waves.north'])));
  const from=origin(sender),to=origin(receiver);
  const courseFields=[
    ['race.wakeTile','waves.height',[64,64]],
    ['race.hullWaveTile','waves.wakeHeight',[64,64]],
    ['race.backgroundTile','boatWater.tile',[32,32]],
  ].map(([course,source,shape])=>({course,field:bind(receiver,course,shape),source:bind(receiver,source,shape)}));
  const packet=new Float64Array(152);
  let surfaceVolume=0;
  for(let frame=0;frame<12;frame++){
    for(let i=0;i<10;i++)sender.step(.01);
    const source=sender.read_bound(strips);
    for(let i=0;i<12;i++){
      packet[2+3*i]=source[3*i]+to[0]-from[0]+3;
      packet[3+3*i]=source[3*i+1]+to[1]-from[1]+1;
      packet[4+3*i]=source[3*i+2];
      surfaceVolume=Math.max(surfaceVolume,source[3*i+2]);
    }
    packet[0]=1;packet[1]=sender.time();
    if(frame>=8)packet.fill(0);
    receiver.write_bound(writer,packet);
    for(let i=0;i<10;i++){receiver.step(.01);quiet.step(.01);}
    const delta=(bindings)=>maxDiff(receiver.read_bound(bindings[0]),quiet.read_bound(bindings[1]));
    for(const grid of courseFields){
      assert.equal(maxDiff(receiver.read_bound(grid.field),receiver.read_bound(grid.source)),0,grid.course+' lags its source');
    }
    const h=delta(heights);
    if(frame===0)assert(h<1e-10,'Joining stationary displacement injected an impulse');
    if(frame>=8)assert(h>1e-7,'Existing wake vanished on disconnect');
    peakElevation=Math.max(peakElevation,h);
    peakReceiverHeight=Math.max(peakReceiverHeight,delta(sections));
    peakForce=Math.max(peakForce,delta(load));
  }
  console.log({surfaceVolume,peakElevation,peakReceiverHeight,peakForce});
  assert(surfaceVolume>0 && peakElevation>.00001 && peakReceiverHeight>1e-7);
  if(hasHull)assert(peakForce>1e-6);
  else assert.equal(peakForce,0);
}finally{for(const world of worlds)world.free();}
