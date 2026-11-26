// Reproduce dressed, posed diver contacts against a locally planar seabed.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import T from '../../../viewer/vendor/three.min.js';
import {divePacket} from '../../../viewer/npc-room.mjs';
import {diverContactRig} from '../../../viewer/scuba-diver.mjs';
import {meshLoad} from '../../../viewer/diver-mesh-contact.mjs';
import {diverSkin} from '../../../viewer/scuba-triangles.mjs';

const [binaryDir,runtimeDir] = process.argv.slice(2);
if (!binaryDir) throw Error('usage: node replay.mjs NATIVE_BINARY_DIRECTORY [FMU_DIRECTORY]');
const runtime = runtimeDir ? pathToFileURL(resolve(runtimeDir)+'/') : new URL('../../../viewer/fmi3/',import.meta.url);
const {loadInstance} = await import(new URL('instance.mjs',runtime));
const read = async url => new Response(readFileSync(url));
const plant = await loadInstance('ScubaDiver',{
  initialState:[0,0,-6,0,0,0,0,0,0,0,0,0,0,0,0,0],waterLevel:0,bedHeight:-30,meshCollision:1
},read);
const {rig} = diverContactRig(T);
const meshes = [], queries = [];
const referenced=new Set(diverSkin.triangles.filter((_,i)=>i%4!==3));
const offsets = [-.06,-.022,-.006,.005,.024,.085];
const poses = [[0,0,0,0],[0,0,.8,0],[.8,0,.8,0],[0,-.75,.9,0],[0,0,1,.75],[-.8,.6,.7,-.8]];
for (const [turn,pitch,drive,roll] of poses) {
  plant.set('pilot',[1,turn,pitch,drive,roll]);
  for (let step=0;step<35;step++) plant.advance(.01);
  const [state,activity,joints,lateral,axial] = plant.getMany(['state','activity','jointAngles','lateralAngles','axialAngles']);
  const frame = new Float64Array(divePacket.length);
  frame.set(state,1);frame.set(activity,17);frame.set(joints,divePacket.joints);
  frame.set(lateral,divePacket.lateral);frame.set(axial,divePacket.axial);
  rig.applyFrame(frame,0,()=>-30);
  const points=rig.triangles.snapshot();
  for (const normal of [[0,0,1],[.45,-.25,1],[-.25,.8,1]]) {
    // Rotate both mesh and plane to the same local terrain frame, Z up.
    const rot=new T.Quaternion().setFromUnitVectors(new T.Vector3(...normal).normalize(),new T.Vector3(0,0,1));
    const origin=new T.Vector3(...state.slice(0,3)),v=new T.Vector3(),mesh=new Float64Array(points.length);
    let lowest=Infinity;
    for (let i=0;i<points.length;i+=3) {
      v.fromArray(points,i).sub(origin).applyQuaternion(rot).toArray(mesh,i);
      if(referenced.has(i/3))lowest=Math.min(lowest,v.z);
    }
    const index=meshes.push(mesh)-1;
    for(const gap of offsets)queries.push({index,height:gap-lowest,gap});
  }
}
// Interleave meshes to avoid timing a single hot plane/hull pair repeatedly.
let seed=71823;
for(let i=queries.length-1;i>0;i--) {
  seed=(Math.imul(1664525,seed)+1013904223)>>>0;
  const j=seed%(i+1);
  [queries[i],queries[j]]=[queries[j],queries[i]];
}
const fixture=[meshes.length+' '+queries.length,...meshes.map(m=>referenced.size+'\n'+[...referenced].flatMap(i=>[m[3*i],m[3*i+1],m[3*i+2]]).join(' ')),
  ...queries.map(q=>q.index+' '+q.height)].join('\n');
const summary={poses:poses.length,planeOrientations:3,referencedVertices:referenced.size,triangles:diverSkin.triangles.length/4,queries:queries.length,engines:{}};
const temp=mkdtempSync(join(tmpdir(),'diver-contacts-'));
try {
  const filename=join(temp,'replay.txt');
  writeFileSync(filename,fixture);
  for(const [name,executable] of Object.entries({Rumoca:'rumoca-plane',Parry:'parry/release/diver-plane',Coal:'coal-plane',MuJoCo:'mujoco-plane'})){
    const run=spawnSync(resolve(binaryDir,executable),[filename],{encoding:'utf8'});
    if(run.status!==0)throw Error(name+' failed: '+(run.error??run.stderr));
    const distances=run.stdout.trim().split(/\s+/).map(Number);
    const ns=Number(run.stderr.trim().split('\n').at(-1));
    assert.equal(distances.length,queries.length);
    assert(Number.isFinite(ns)&&ns>0);
    const maxError=Math.max(...distances.map((v,i)=>Math.abs(v-queries[i].gap)));
    assert(maxError<1e-6,name+' gap error '+maxError);
    assert(distances.every((v,i)=>(v<0)===(queries[i].gap<0)));
    summary.engines[name]={medianNsPerSignedQuery:ns,maxGapErrorMetres:maxError};
  }
}finally{rmSync(temp,{recursive:true,force:true});}

const floorTriangles=[[[-5,-5,0],[5,-5,0],[5,5,0]],[[-5,-5,0],[5,5,0],[-5,5,0]]];
const world={triangles(box,t,dt,visit){for(const triangle of floorTriangles)visit(triangle,[0,0,0],true);}};
const baked=queries.map(({index,height,gap})=>({
  points:meshes[index].map((v,i)=>i%3===2?v+height:v),row:[0,0,0,height,0,0,0],gap
}));
const times=[];
let maxError=0;
for(let pass=0;pass<9;pass++){
  const start=performance.now();
  for(const {points,row,gap} of baked){
    // Stationary external geometry isolates shape error, retaining runtime BVH
    // refit, terrain clipping, per-link witness selection and self-contact.
    const hit=meshLoad(rig.triangles,points,points,row,.025,world,0,0);
    assert.equal(hit.contact[3]>0,gap<0,'production missed signed plane crossing at '+gap+'m; result '+JSON.stringify(hit));
    maxError=Math.max(maxError,Math.abs(hit.contact[3]-Math.max(0,-gap)));
  }
  if(pass>=2)times.push((performance.now()-start)*1e6/queries.length);
}
assert(maxError<1e-6,'production clipped penetration depth error '+maxError);
times.sort((a,b)=>a-b);
function profile(work){
  const samples=[];
  for(let pass=0;pass<9;pass++){
    let check=0;
    const start=performance.now();
    for(const {points,row} of baked)check+=work(points,row);
    assert(Number.isFinite(check));
    if(pass>=2)samples.push((performance.now()-start)*1e6/queries.length);
  }
  samples.sort((a,b)=>a-b);
  return samples[3];
}
const noTerrain={triangles(){}};
summary.production={medianNsPerMeshLoad:times[3],maxPenetrationErrorMetres:maxError,
  medianNsPerRefit:profile(points=>rig.triangles.prepare(points,points).box[0]),
  medianNsPerRefitAndSelfContacts:profile((p,row)=>meshLoad(rig.triangles,p,p,row,.025,noTerrain,0,0).selfScore)};
console.log(JSON.stringify(summary,null,2));
