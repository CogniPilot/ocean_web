// Verify the actual indexed mesh against the height function used by vehicles and sonar.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url);
const T=require('../viewer/vendor/three.min.js');
const bed=require('../viewer/bathymetry.js');
const visuals=await readFile(new URL('../viewer/visuals.js',import.meta.url),'utf8');
const geo=runInNewContext(visuals+'\nharborTerrainGeometry(T)',{T,harborBed:bed});
const positions=geo.getAttribute('position'),indices=geo.index.array;
const verts=Array.from({length:positions.count},(_,i)=>new T.Vector3().fromBufferAttribute(positions,i));
const edges=new Map(),neighbors=verts.map(()=>[]);
let area=0,maxError=0;
for(let i=0;i<indices.length;i+=3){
  const tri=[indices[i],indices[i+1],indices[i+2]], [a,b,c]=tri.map(i=>verts[i]);
  const twiceArea=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  assert(twiceArea>0,'Every triangle must face upward');
  area+=twiceArea/2;
  const interior=a.clone().multiplyScalar(.21).addScaledVector(b,.46).addScaledVector(c,.33);
  maxError=Math.max(maxError,Math.abs(interior.z-bed.surfaceHeight(interior.x,interior.y)));
  for(let j=0;j<3;j++){
    const u=tri[j],v=tri[(j+1)%3],key=Math.min(u,v)*verts.length+Math.max(u,v);
    edges.set(key,(edges.get(key)??0)+1); neighbors[u].push(v);
  }
}
assert(Math.abs(area-500*500)<.01,'Tiles cover the complete 500 m square exactly once');
for(const [key,count] of edges){
  const [a,b]=[verts[Math.floor(key/verts.length)],verts[key%verts.length]];
  const rim=(a.x===b.x&&Math.abs(a.x)===250)||(a.y===b.y&&Math.abs(a.y)===250);
  assert.equal(count,rim?1:2,'Only the outer harbor perimeter can have unshared edges');
}
const visited=new Set([0]),queue=[0];
while(queue.length){
  for(const i of neighbors[queue.pop()])if(!visited.has(i)){visited.add(i);queue.push(i);}
}
assert.equal(visited.size,verts.length,'One connected mesh throughout');
const ground=new T.Mesh(geo,new T.MeshBasicMaterial());
const ray=new T.Raycaster(),down=new T.Vector3(0,0,-1);
const probes=[];
for(let j=0;j<16;j++)for(let i=0;i<24;i++)probes.push([-76.123+i*6.017,-75.871+j*9.635]);
for(const y of [11.9999,12.0001,16.9999,17.0001,62.9999,63.0001]){
  for(let i=0;i<14;i++)probes.push([-75.31+i*11.13,y]);
}
for(const [x,y] of probes){
  ray.set(new T.Vector3(x,y,25),down);
  const hits=ray.intersectObject(ground);
  assert.equal(hits.length,1,'The render ray crosses exactly one surface');
  maxError=Math.max(maxError,Math.abs(hits[0].point.z-bed.surfaceHeight(x,y)));
}
assert(maxError<2e-5,`maximum render/physics height error ${maxError} m`);
console.log(`${verts.length} vertices, ${indices.length/3} connected triangles, ${probes.length} downward rays, maximum height error ${maxError.toExponential(2)} m`);
