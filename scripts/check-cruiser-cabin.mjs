import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {cabinCruiser,cruiserUnderwaterViews} from '../viewer/motorboat.mjs';
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

// Check the actual batched geometry. Every feed should emerge from a visible
// glass port and its centre ray should clear the hull and fixtures.
const fixedMeshes=group.children.filter(mesh=>mesh.visible&&mesh.material?.isMeshStandardMaterial);
for(const [name,[position,look]] of Object.entries(cruiserUnderwaterViews)){
  const lens=new T.Vector3(...position),direction=new T.Vector3(...look).sub(lens).normalize();
  ray.set(lens.clone().addScaledVector(direction,.5),direction.clone().negate());
  const face=ray.intersectObjects(fixedMeshes,false)[0];
  assert(face&&Math.abs(face.distance-.503)<.001,name+' optical port is missing or misplaced');
  if(name==='motorBow'){
    ray.set(lens,new T.Vector3(0,0,1));
    const gap=ray.intersectObjects(plating,false)[0]?.distance;
    assert(gap>.015&&gap<.05,'Bow port should sit within 5 cm of the plating');
    ray.set(lens.clone().addScaledVector(direction,-.12),new T.Vector3(0,0,-1));
    assert(ray.intersectObjects(plating,false)[0],'Rear of the bow housing must be embedded in the hull');
  }
  ray.set(lens,direction);
  assert.equal(ray.intersectObjects(fixedMeshes,false).length,0,name+' optical axis is obstructed');
}

// Check the swept wheel against the keel at its tightest point. For this
// symmetric V hull each circular blade orbit is closest on the centreline.
const propeller=group.getObjectByName('Bronze propeller');
const blade=propeller.children.find(part=>part.geometry?.type==='BufferGeometry');
const rudder=group.getObjectByName('Steering rudder');
const foil=rudder.children.find(part=>part.geometry?.type==='BufferGeometry');
const keelRay=new T.Raycaster(new T.Vector3(),new T.Vector3(0,0,1));
function keelClearance(point){
  keelRay.ray.origin.set(point.x,point.y,-3);
  const hit=keelRay.intersectObjects(plating,false)[0];
  // The rudder trailing edge can extend abaft the transom.
  if(!hit && point.x < -3.70)return Infinity;
  assert(hit,'Expected stern plating over running gear');
  return hit.point.z-point.z;
}
const position=blade.geometry.attributes.position;
let bladeGap=Infinity,rudderGap=Infinity;
for(let i=0;i<position.count;i++){
  const tip=new T.Vector3(position.getX(i),0,Math.hypot(position.getY(i),position.getZ(i)));
  bladeGap=Math.min(bladeGap,keelClearance(propeller.localToWorld(tip)));
}
for(const angle of [-.52,0,.52]){
  rudder.rotation.z=angle;rudder.updateMatrixWorld(true);
  for(let i=0;i<foil.geometry.attributes.position.count;i++){
    const point=new T.Vector3().fromBufferAttribute(foil.geometry.attributes.position,i);
    rudderGap=Math.min(rudderGap,keelClearance(foil.localToWorld(point)));
  }
}
console.log({bladeGap_m:bladeGap,rudderGap_m:rudderGap});
assert(Number.isFinite(bladeGap) && Number.isFinite(rudderGap) && bladeGap>.025 && rudderGap>.015,'The running gear must clear the hull through its travel');

// Sample the five feed frusta with the rudder at both stops. The bounding
// sphere encloses the entire rotating wheel at every shaft angle.
const wheel=new T.Sphere(propeller.getWorldPosition(new T.Vector3()),.24);
const eye=new T.PerspectiveCamera(64,16/9,.045,20);
for(const angle of [-.52,0,.52]){
  rudder.rotation.z=angle;rudder.updateMatrixWorld(true);
  for(const [name,[origin,target,up=[0,0,1]]] of Object.entries(cruiserUnderwaterViews)){
    eye.position.set(...origin);eye.up.set(...up);eye.lookAt(...target);eye.updateMatrixWorld();
    for(const u of [-1,-.5,0,.5,1])for(const v of [-1,-.5,0,.5,1]){
      ray.setFromCamera({x:u,y:v},eye);
      assert(!ray.ray.intersectsSphere(wheel),name+' looks into the swept wheel');
      assert.equal(ray.intersectObject(rudder,true).length,0,name+' looks into the rudder');
    }
  }
}
