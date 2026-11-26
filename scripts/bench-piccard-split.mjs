// Run the shipping split worker against a chosen pair of browser WASM FMUs.
// Usage: node scripts/bench-piccard-split.mjs [fmi3-dir] [cave|wreck] [steps]
import {createHash} from 'node:crypto';
import {copyFile,mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const viewer=fileURLToPath(new URL('../viewer/',import.meta.url));
const directory=resolve(process.argv[2]??join(viewer,'fmi3'));
const scene=process.argv[3]??'cave',steps=Number(process.argv[4]??1200);
if(!['cave','wreck'].includes(scene)||!Number.isInteger(steps)||steps<4||steps%4)throw Error('Choose cave or wreck and a positive multiple of four steps');
const work=await mkdtemp(join(tmpdir(),'piccard-split-bench-'));
try{
  await symlink(directory,join(work,'fmi3'));
  await symlink(join(viewer,'wreck-contact.mjs'),join(work,'wreck-contact.mjs'));
  await copyFile(join(viewer,'sub-worker.mjs'),join(work,'worker.mjs'));
  globalThis.fetch=async url=>new Response(await readFile(url));
  const results=[];
  globalThis.self={postMessage(result){
    if(result.error)throw Error(result.error);
    results.push(result);
  }};
  await import(pathToFileURL(join(work,'worker.mjs')));
  const data={steps:4,breached:false,manual:true,pilot:[.06,.09,.12,.05],attitude:[.01,-.1],mode:1,wind:11,bearing:.45,
    acquireSurvey:true,showSonar:true,spawn:{position:scene==='cave'?[-32,-30,-45.7]:[-14.7,11.7,-9.8],velocity:[0,0,0],heading:.1},
    animalTraffic:new Float64Array(90),animalJoints:new Float64Array(40),peerLiftStates:new Float64Array(18),peerCruisers:new Float64Array(126)};
  for(let i=0;i<80;i+=4)await self.onmessage({data});
  results.length=0;
  const start=process.threadCpuUsage(),wall=performance.now();
  for(let i=0;i<steps;i+=4)await self.onmessage({data});
  const elapsed=performance.now()-wall,cpu=process.threadCpuUsage(start),cpuMs=(cpu.user+cpu.system)/1000;
  const digest=createHash('sha256');
  for(const result of results){
    if(!result.position.every(Number.isFinite))throw Error('Invalid vehicle position');
    digest.update(JSON.stringify(result,(_key,value)=>{
      // JSON preserves finite doubles except the sign of zero.
      if(typeof value==='number'){
        if(!Number.isFinite(value))throw Error('Non-finite worker output');
        if(Object.is(value,-0))return '-0';
      }
      return value;
    }));
  }
  console.log(JSON.stringify({directory,scene,steps,cpuMsPerStep:cpuMs/steps,cpuRealtime:10*steps/cpuMs,
    wallMsPerStep:elapsed/steps,sha256:digest.digest('hex')}));
}finally{await rm(work,{recursive:true,force:true});}
