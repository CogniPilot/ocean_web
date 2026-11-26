// Exercise the host contact rig, shared drawn volumes and distributed diver FMU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import T from '../viewer/vendor/three.min.js';
import {diverContactRig} from '../viewer/scuba-diver.mjs';
import {diverObstacles} from '../viewer/diver-contact.mjs';
import {fishObstacles} from '../viewer/fish-obstacles.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import {drawAnimalCollision} from '../viewer/collision-view.mjs';

const rig=diverContactRig(T),row=new Float64Array(78),none=()=>null,bed=()=>-20;
row[3]=-5;row[43]=150;row[48]=5;row[17]=1;
rig.rig.applyFrame(row,0,bed);
const rest=rig.rig.probes.points(),parts=rig.rig.probes.kinds;
const wires=[];
drawAnimalCollision({ellipsoid(frame,xyz,radii){assert.equal(frame,null);wires.push(...xyz,radii[0]);}},
  rig.rig.group,'diver');
assert.deepEqual(wires,[...rest]);
for(const part of ['head','tank','body','leg','boot','fin','arm','hand'])assert(parts.includes(part));

function wallX(limit){
  return(x,y,z,ex,ey,ez,r)=>{
    if(x+r>=limit)return {fraction:0,nx:-1,ny:0,nz:0,penetration:x+r-limit};
    if(ex+r<=limit)return null;
    return {fraction:(limit-r-x)/(ex-x),nx:-1,ny:0,nz:0,penetration:0};
  };
}
const headLimit=Math.max(...parts.map((kind,i)=>kind==='head'?rest[4*i]+rest[4*i+3]:-Infinity));
row[4]=.55;
const head=rig.sample(row,0,bed,wallX(headLimit+.025),.12);
assert.equal(head.part,'head');assert(head.contact[3]>.002&&head.contact[0]<-.9);
assert.equal(rig.sample(row,0,bed,wallX(headLimit+.21),.12).part,undefined);
row[4]=0;row[66]=1.7;row[67]=.9;
const posed=Float64Array.from(row);posed[56]+=.60;posed[57]+=.40;
rig.rig.applyFrame(posed,0,bed);const bent=rig.rig.probes.points();
const finMotion=Math.max(...parts.map((k,i)=>k==='fin'?Math.hypot(...[0,1,2].map(c=>rest[4*i+c]-bent[4*i+c])):0));
assert(finMotion>.35);
// A helicopter kick must move the same blade edges that the collision sampler sees.
const lateralRow=new Float64Array(86);
lateralRow.set(row);
rig.rig.applyFrame(lateralRow,0,bed);
const straight=rig.rig.probes.points();
lateralRow[78]=.48;
rig.rig.applyFrame(lateralRow,0,bed);
const swept=rig.rig.probes.points();
lateralRow[79]=.5;
rig.rig.applyFrame(lateralRow,0,bed);
const feathered=rig.rig.probes.points();
const blades=parts.map((kind,i)=>kind==='fin'?4*i:null).filter(i=>i!==null);
const [portEdge,starboardEdge]=[blades[blades.length/2-1],blades.at(-1)];
assert(swept[portEdge+1]-straight[portEdge+1]>.3);
assert(Math.abs(feathered[portEdge+2]-swept[portEdge+2])>.01);
assert.deepEqual(feathered.slice(starboardEdge,starboardEdge+4),straight.slice(starboardEdge,starboardEdge+4));
const actor={id:'sub',kind:'sub',x:1.25,y:0,z:-5,ve:-4,vn:0,vu:0,yaw:0};
const craftSweep=diverObstacles([actor],'diver',row,.20,none);
const moving=rig.sample(row,0,bed,craftSweep,.20);
assert.equal(moving.part,'head');assert(moving.contactRelativeVelocity[0]>3.9);
assert.equal(rig.sample(row,0,bed,diverObstacles([{...actor,y:1.5}],'diver',row,.20,none),.2).part,undefined);
const blocked={...actor,kind:'diver',id:'peer',ve:0,x:0};
const neighbor=Float64Array.of(headLimit+.02,0,-4.97,.10);
assert.equal(rig.sample(row,0,bed,diverObstacles([blocked],'diver',row,.1,none,()=>neighbor),.1).part,'head');
row[21]=1;row[47]=1;row[76]=80;
let skippedFeet=0,checkedUpper=0;
rig.sample(row,0,bed,(x,y,z,ex,ey,ez,r,ground)=>{if(ground)checkedUpper++;else skippedFeet++;return null;},.12);
assert(skippedFeet>0&&checkedUpper>0);
const {loadInstance}=await import(new URL('instance.mjs',pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/')));
const body=await loadInstance('ScubaDiver',{pilot:[1,0,0,0,0],bedHeight:-30},async url=>new Response(await readFile(url)));
const base=body.get('bodyWrench');
body.set('contact',[0,1,0,.03]);body.set('contactMomentArm',[.60,0,0]);body.set('contactRelativeVelocity',[0,-.30,0]);
body.advance(.00001);
const wrench=body.get('bodyWrench'),force=wrench[1]-base[1],torque=wrench[5]-base[5];
assert(Math.abs(force-303)<.1&&Math.abs(torque-181.8)<.1);
console.log({spheres:parts.length,finMotion,headIntrusion:head.contact[3],movingHullIntrusion:moving.contact[3],force,torque,skippedFeet,checkedUpper});

// Drive the compiled diver into each registered scan with identical controls.
globalThis.fetch=async url=>new Response(await readFile(url));const siteBed=()=>-13.7;
const sweep=fishObstacles(siteBed,{height:siteBed},new AbortController().signal);
for(let i=0;i<100;i++){
  const z=siteBed()+1.8;
  if(wreckSites.every(site=>sweep(site.east,site.north-10,z,site.east,site.north,z,.12)))break;
  await new Promise(resolve=>setTimeout(resolve,10));
}
for(const site of wreckSites){
 const z=siteBed()+1.8,hit=sweep(site.east,site.north-10,z,site.east,site.north,z,.12);assert(hit&&hit.ny<-.15);
 const start=site.north-10+10*hit.fraction-.80;
 const results=[];
 for(const enabled of [false,true]){
 const f=await loadInstance('ScubaDiver',{initialState:[site.east,start,z,0,1.30,0,Math.PI/2,0,0,0,0,0,0,.4,0,0],pilot:[1,0,0,.7,0],bedHeight:siteBed()},globalThis.fetch);
 const rig=diverContactRig(T),r=new Float64Array(88);let maxDepth=0,accepted=0,part;
 for(let i=0;i<14;i++){
   const [st,act,u,angles,rates,loads]=f.getMany(['state','activity','upright','jointAngles','jointRates','footContact']);
   r[0]=st[14];r.set(st,1);r.set(act,17);r[43]=150;r[47]=u;r[48]=5;r.set(angles,56);r.set(rates,66);r.set(loads,76);
   if(f.has('lateralAngles')){r.set(f.get('lateralAngles'),78);r.set(f.get('lateralRates'),82);}
   const load=rig.sample(r,0,siteBed,sweep,.1);
   if(load.contact[3]>.0001){accepted++;maxDepth=Math.max(maxDepth,load.contact[3]);part=load.part;}
   if(enabled)for(const name of ['contact','contactMomentArm','contactRelativeVelocity','contactLink','meshSelfContact','meshCollision']){
     if(f.has(name))f.set(name,load[name]);
   }
   if(!enabled&&f.has('meshCollision'))f.set('meshCollision',1);
   for(let j=0;j<10;j++)f.advance(.01);
 }
 const st=f.get('state');results.push({enabled,north:st[1]-start,vn:st[4],maxDepth,accepted,part});
 }
 console.log(site.id,results);
 assert(results[1].accepted>0&&results[1].north<results[0].north-.15,'actual scan must retard the approaching simulated diver');
}
