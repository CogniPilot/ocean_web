// Walk off the island beach, switch to learned swimming and settle onto the slope.
// Run the same worker, posed mesh, bathymetry and control packets as a room host.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';

globalThis.fetch=async url=>new Response(await readFile(url));
if(!isMainThread){
  globalThis.self={postMessage:message=>parentPort.postMessage(message)};
  await import('../viewer/harbor-worker.mjs');
  parentPort.on('message',data=>self.onmessage({data}));
}else{
  const {default:T}=await import('../viewer/vendor/three.min.js');
  const {default:bed}=await import('../viewer/bathymetry.js');
  const {diverContactRig}=await import('../viewer/scuba-diver.mjs');
  const {diverObstacles}=await import('../viewer/diver-contact.mjs');
  const {fishObstacles}=await import('../viewer/fish-obstacles.mjs');
  const {fixedSpawnPoints}=await import('../viewer/spawn-sites.mjs');
  const {divePacket}=await import('../viewer/npc-room.mjs');
  globalThis.harborBed=bed;
  const beach=fixedSpawnPoints('diver').find(point=>point.id==='beach');
  const height=bed.surfaceHeight.bind(bed),rig=diverContactRig(T);
  const world=fishObstacles(height,bed,new AbortController().signal);
  const start=[beach.x,beach.y,height(beach.x,beach.y)+1.15],heading=Math.PI;
  const worker=new Worker(new URL(import.meta.url));
  let frame,submergedContacts=0,walked=false,swam=false;
  try{
    for(let batch=0;batch<150;batch++){
      const [east,north]=frame?.slice(1,3)??start;
      const bedHeight=height(east,north),waterLevel=0,learned=waterLevel-bedHeight>1.55;
      const sweep=frame&&diverObstacles([],'diver',frame,.1,world);
      const incident=sweep&&rig.sample(frame,waterLevel,height,sweep,.1);
      if(learned&&incident?.contact[3]>0)submergedContacts++;
      const slope=learned?[0,0]:[(height(east+.12,north)-height(east-.12,north))/.24,
        (height(east,north+.12)-height(east,north-.12))/.24];
      const actor={id:'diver',kind:'diver',learned,inputs:{
        patrolOrigin:[...start,heading,0],pilot:[1,0,0,1,0],sprint:0,
        vestValve:0,verticalPilot:0,lateralPilot:0,torchEquipped:0,
        waterLevel,bedHeight,bedSlope:slope,currentVelocity:[0,0,0],avoidance:[0,0,0],
        contact:incident?.contact??[0,0,0,0],contactLink:incident?.contactLink??1,
        contactWitness:incident?.contactWitness??Array(9).fill(0),
        meshCollision:incident?.meshCollision??0,meshSelfContact:incident?.meshSelfContact??Array(9).fill(0),
        contactMomentArm:incident?.contactMomentArm??[0,0,0],
        contactRelativeVelocity:incident?.contactRelativeVelocity??[0,0,0]
      }};
      if(!frame)actor.seed={initialWaterLevel:0,initialPosture:1,initialJoints:Array(20).fill(0),
        initialState:[...start,0,0,0,heading,0,0,0,0,0,.6,0,0,.3]};
      // A relay in the automatic inflator used to trap fmi3DoStep at 11.835 s.
      // A separate thread makes a stalled synchronous WASM call observable.
      const response=once(worker,'message',{signal:AbortSignal.timeout(15_000)});
      worker.postMessage({actors:[actor],steps:10,environment:{}});
      const [packet]=await response.catch(error=>{throw Error('Diver worker stalled or failed at '+(batch/10)+' s',{cause:error});});
      assert.ifError(packet.error);
      frame=packet.frames[0].frame;
      assert.equal(frame.length,divePacket.length);
      assert(frame.every(Number.isFinite),'non-finite diver packet at '+batch/10+' s');
      assert(Math.abs(frame[0]-(batch+1)/10)<1e-8,'simulation clock at '+batch/10+' s');
      walked||=frame[21]>.9;
      swam||=learned&&frame[21]<.1;
    }
    assert(walked&&swam&&submergedContacts>0,'exercise shore walking, learned swimming and underwater mesh contact');
    assert(frame[1]<beach.x-5&&frame[3]<-1,'diver walked from the beach down the submerged slope');
    console.log('Island beach to submerged shelf: 15 simulated seconds, '+submergedContacts+' underwater contact batches.');
  }finally{await worker.terminate();}
}
