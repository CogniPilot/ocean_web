// Profile the 10 Hz surface wave FMU with changing wind, local hull and remote displacement.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultDir=fileURLToPath(new URL('../viewer/fmi3/',import.meta.url));
const directory=resolve(process.argv[2]??defaultDir);
const {loadInstance}=await import(pathToFileURL(resolve(directory,'instance.mjs')));
const section=[.009,.02,.027,.028,.015,.003];
const model=await loadInstance('WakeSpectrum',{
  currentEast:.2,currentNorth:.04,windEast:10,windNorth:2,seaAmplitude:.4,
  beamHalf:[.09,.156,.185,.184,.155,.093,.009],volume:[...section,...section],
  stations:[-2.55,-1.9,-.9,.15,1.12,1.95,2.55],separation:1.02,
},async url=>new Response(await readFile(url)));

const hash=createHash('sha256'),peers=new Float64Array(4*38);
const outputs=['height','wakeHeight','modesR','modesI','incident','waveLoad','sectionHeight','peerForcingR','driftE','driftN'];
let cpuMs=0,wallMs=0,peerPeak=0;
for(let tick=0;tick<180;tick++){
  const t=tick*.1;
  model.set('east',.14*t);
  model.set('north',.05*t);
  model.set('heading',.01*t);
  model.set('heel',.03*Math.sin(t));
  model.set('windEast',9+2*Math.cos(.4*t));
  peers.fill(0);
  if(tick>=36&&tick<120){
    peers[0]=1;peers[1]=t;
    for(let strip=0;strip<12;strip++){
      const offset=2+3*strip;
      peers[offset]=t*.7+(strip%6)-2;
      peers[offset+1]=4+(strip<6?1:-1);
      peers[offset+2]=section[strip%6];
    }
  }
  model.set('peers',peers);
  const start=performance.now(),cpu=process.threadCpuUsage();
  model.advance(.1);
  const elapsed=performance.now()-start,usage=process.threadCpuUsage(cpu);
  if(tick>=30){wallMs+=elapsed;cpuMs+=(usage.user+usage.system)/1000;}
  for(const name of outputs){
    const result=model.get(name);
    const values=Float64Array.from(typeof result==='number'?[result]:result);
    if(name==='peerForcingR')for(const value of values)peerPeak=Math.max(peerPeak,Math.abs(value));
    hash.update(Buffer.from(values.buffer));
  }
}
if(!(peerPeak>0))throw Error('Replay produced no peer wave');
console.log({msPerUpdate:wallMs/150,cpuMsPerUpdate:cpuMs/150,peerPeak,sha256:hash.digest('hex')});
