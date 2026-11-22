// Compare the incoming channel against a receiver without a local hull.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const [sailing='build/pages/sailing',habitat='build/pages/habitat']=process.argv.slice(2);
const east=-140,north=-80;
async function open(directory,parameters={}){
  const base=pathToFileURL(resolve(directory)+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  const session=await openFmuSession({base,index,fetch:fileFetch,parameters});
  session.set_inputs(JSON.stringify([['seaState',0],['windSpeed',0]]));
  return session;
}
function bind(world,name,shape){
  const field=world.bind_outputs(JSON.stringify(scalarNames(name,shape)));
  return ()=>world.read_bound(field);
}

const local=await open(sailing,{'boat.launchEast':east,'boat.launchNorth':north,'boat.launchSpeed':3,'boat.launchHeading':0});
const remote=await open(habitat);
try{
  const focus=remote.bind_inputs(JSON.stringify(scalarNames('animalPosition',[3])));
  remote.write_bound(focus,new Float64Array([east,north,0]));
  const writers=[local,remote].map(world=>world.bind_inputs(JSON.stringify(scalarNames('peerWake',[4,38]))));
  const geometry=bind(local,'waves.sourceStrips',[12,3]);
  const incoming=bind(local,'waves.peerHeight',[64,64]),combined=bind(local,'waves.height',[64,64]);
  const external=bind(remote,'waves.height',[64,64]),sampled=bind(local,'waves.sectionHeight',[2,6]);
  const packet=new Float64Array(152);
  let peakIncoming=0,peakAfterDisconnect=0,peakSample=0,peakLocal=0,maxError=0;
  for(let frame=0;frame<14;frame++){
    const rows=geometry();
    if(frame>=2&&frame<10){
      packet[0]=1;packet[1]=frame*.1;
      for(let strip=0;strip<12;strip++){
        packet[2+3*strip]=rows[3*strip]+2;
        packet[3+3*strip]=rows[3*strip+1]+.5;
        packet[4+3*strip]=rows[3*strip+2];
      }
    }else packet.fill(0);
    local.write_bound(writers[0],packet);
    remote.write_bound(writers[1],packet);
    for(let i=0;i<10;i++){local.step(.01);remote.step(.01);}
    const peer=incoming(),reference=external(),all=combined();
    for(let i=0;i<peer.length;i++){
      peakIncoming=Math.max(peakIncoming,Math.abs(peer[i]));
      peakLocal=Math.max(peakLocal,Math.abs(all[i]-peer[i]));
      maxError=Math.max(maxError,Math.abs(peer[i]-reference[i]));
      if(frame>=10)peakAfterDisconnect=Math.max(peakAfterDisconnect,Math.abs(peer[i]));
    }
    peakSample=Math.max(peakSample,...sampled().map(Math.abs));
    if(frame<3)assert(peer.every(value=>value===0),'A local hull and a new peer do not seed an incoming impulse');
  }
  console.log({peakIncoming,peakAfterDisconnect,peakSample,peakLocal,maxError});
  assert(maxError<1e-9,'Incoming elevation agrees with the independent peer-only solver');
  assert(peakIncoming>.001&&peakSample>.0001,'Displacement from another boat reaches the hull');
  assert(peakAfterDisconnect>.0001,'Previously radiated peer wake survives a disconnect');
  assert(peakLocal>.001,'The total surface retains the local hull wake');
}finally{
  remote.free();local.free();
}
