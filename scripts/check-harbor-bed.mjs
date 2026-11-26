import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import bed from '../viewer/bathymetry.js';
import {caveSurface} from '../viewer/abyss-cave.mjs';
import {bedEcho} from './bed-oracle.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const v=(x,y,z)=>new T.Vector3(x,y,z),read=async url=>new Response(await readFile(url));
const nav=await loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0},read);
const beams=nav.get('beam').slice(0,12);
function noise(t,i){const a=43758.5453*Math.sin(12.9898*i+78.233*(t+1));return 2*(a-Math.floor(a)-.5);}
const {positions,indices}=caveSurface(bed),shellGeometry=new T.BufferGeometry();
shellGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));shellGeometry.setIndex(indices);
const shell=new T.Mesh(shellGeometry,new T.MeshBasicMaterial({side:T.DoubleSide})),ray=new T.Raycaster();
let maxError=0,maxCaveError=0,count=0,caveCount=0;
for(const [i,position] of [[-30,-30,-16],[-30,-30,-35],[-36,-30,-20],[-28,-36,-25],
  [-18,-40,-8],[-50,-50,-9],[-73,-45,-10],[-5,7,-10]].entries()){
  const origin=v(...position).add(v(0,0,-.075)),t=.2*i;
  nav.set('stamp',t);
  nav.set('truth',[...position,1,0,0,0,0,0,0,0,-position[2]*10055,0,0,9.81,0,0,0]);
  const observed=nav.get('sensor').slice(4,8);
  for(let j=0;j<4;j++){
    const direction=v(...beams.slice(3*j,3*j+3)),floor=bedEcho(origin,direction);
    ray.set(origin,direction);
    const cave=ray.intersectObject(shell)[0]?.distance??Infinity,d=Math.min(floor,cave);
    const expected=d>0&&d<=50/Math.cos(Math.PI/8)&&noise(t,1001+j)>-.976 ? Math.max(.08,d+noise(t,j+1)*(.012+.0015*d)) : 0;
    const error=Math.abs(observed[j]-expected);
    if(cave<floor){maxCaveError=Math.max(maxCaveError,error);caveCount++;}
    else {maxError=Math.max(maxError,error);count++;}
  }
}
assert(maxError<2e-5,'DVL range differs from rendered triangles by '+maxError+' m');
assert(caveCount>0 && maxCaveError<.65,'DVL cave occupancy differs from the visual rock by '+maxCaveError+' m');
const depth=bed.height(-30,-30);
assert(depth<-47 && depth>-49);
const reaction=async position=>{
  const plant=await loadInstance('Wreck_Plant',{spawnPosition:position},read);
  return plant.get('contactTarget');
};
for(const z of [-14,-20,-32,depth+2])assert(Math.hypot(...await reaction([-30,-30,z]))<1e-7,'phantom seabed at z='+z);
const bottom=await reaction([-30,-30,depth-.08]);
assert(bottom[2]>100,'vehicle crosses abyss floor');
const bench=await reaction([40,0,bed.datum-.08]);
assert(bench[2]>100,'vehicle crosses outer flat bed');
// Fly the real manual depth command through the former plane with its feedback loop.
const pilot=await loadInstance('Wreck_Plant',{spawnPosition:[-30,-30,-12.5],manual:1,manualMode:3,pilot:[0,0,0,-.9]},read);
const instruments=await loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0},read);
let peak=0;
for(let i=0;i<650;i++){
  if(i%20===0){
    const [p,q,v,w,pressure,accel]=pilot.getMany(['position','orientation','velocity','yawRate','pressure','specificForce']);
    instruments.set('truth',[...p,...q,...v,w,pressure,...accel,0,0,w]);
    instruments.set('stamp',i*.01);
    pilot.set('sensor',instruments.get('sensor'));
    instruments.set('prior',instruments.get('estimate'));
  }
  pilot.advance(.01);
  if(i%10===0)peak=Math.max(peak,Math.hypot(...pilot.get('contactTarget')));
}
const diveEnd=pilot.get('position')[2];
assert(diveEnd<-15 && peak<1e-7,'manual descent must cross the old floor without contact');
console.log({depth,beams:count,maxRangeError:maxError,caveBeams:caveCount,maxCaveError,abyssFloorForce:bottom[2],benchFloorForce:bench[2],diveEnd});
