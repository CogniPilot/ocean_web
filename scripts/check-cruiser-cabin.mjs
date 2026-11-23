import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {cabinCruiser} from '../viewer/motorboat.mjs';
const env={console};
vm.runInNewContext(await readFile(new URL('../viewer/vendor/three.min.js',import.meta.url),'utf8'),env);
const T=env.THREE;
const {group}=cabinCruiser(T);
group.updateMatrixWorld(true);
const cabin=group.getObjectByName('Forward cabin');
const plating=group.children.filter(part=>part.material?.name.startsWith('Hull panel'));
let minClearance=Infinity, outside=0, numSamples=0;
const mounts=[];
const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0));
function inspect(sample,name){
  const sign=sample.y>=0?1:-1;
  ray.ray.origin.set(sample.x,2*sign,sample.z);
  ray.ray.direction.y=-sign;
  const hits=ray.intersectObjects(plating,false);
  const clearance=hits.length?Math.abs(hits[0].point.y)-Math.abs(sample.y):-1;
  numSamples++;
  if(clearance<minClearance)minClearance=clearance;
  if(clearance<-.001){
    if(outside===0)console.log({name,x:sample.x,y:sample.y,z:sample.z,clearance});
    outside++;
  }
}
cabin.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
  const outsideRim=mesh.name==='Cabin outer port rim';
  if(outsideRim){
    mounts.push(mesh);
    return;
  }
  for(let i=0;i<position.count;i++)inspect(new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld),mesh.name);
  if(!index)return;
  for(let i=0;i<index.count;i+=3){
    const center=new T.Vector3();
    for(let j=0;j<3;j++)center.add(new T.Vector3().fromBufferAttribute(position,index.getX(i+j)));
    inspect(center.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld),mesh.name);
  }
});
console.log({minClearance,numSamples,outside,outerPortRims:mounts.length});
assert.equal(outside,0);
assert.equal(mounts.length,4);
