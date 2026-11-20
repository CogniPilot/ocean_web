import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

// Independent exhaustive ray/mesh oracle for the native range model. This runs
// only during verification; the simulation worker has no graphics dependency.
const require=createRequire(import.meta.url);
const T=require('../viewer/vendor/three.min.js');
const nav=await loadInstance('Wreck_Navigation',{},async url=>new Response(await readFile(url)));
const boxes=require('../viewer/wreck.js')(T,{}).children.map(mesh=>({
  center:mesh.position, inverse:mesh.quaternion.clone().invert(),
  bounds:new T.Box3(mesh.scale.clone().multiplyScalar(-.5),mesh.scale.clone().multiplyScalar(.5))
}));
const array=nav.get('beam');
const beams=Array.from({length:array.length/3},(_,i)=>new T.Vector3().fromArray(array,3*i));
function noise(t,channel){
  const x=43758.5453*Math.sin(12.9898*channel+78.233*(t+1));
  return 2*(x-Math.floor(x)-.5);
}
const ray=new T.Ray(),hit=new T.Vector3();
function trace(origin,direction,limit){
  let nearest=Infinity;
  for(const {center,inverse,bounds} of boxes){
    ray.direction.copy(direction).applyQuaternion(inverse);
    ray.origin.copy(origin).sub(center).applyQuaternion(inverse).addScaledVector(ray.direction,.08);
    if(ray.intersectBox(bounds,hit))nearest=Math.min(nearest,.08+hit.distanceTo(ray.origin));
  }
  return nearest<=limit?nearest:0;
}
const poses=[
  [-5,0,-10,0,0,0], [6.5,-.8,-9.8,.15,.3,-.42], [16,-1.65,-9.3,0,0,1.53],
  [19.4,1.5,-11,.13,-.22,2.98], [2,.8,-9.1,-.08,.34,-1.52], [400,300,0,0,0,0]
];
let maxSlantError=0,maxPixelError=0,acousticHits=0,opticalHits=0;
for(const [frame,pose] of poses.entries()){
  const [x,y,z,roll,pitch,yaw]=pose,t=frame*.2;
  const p=new T.Vector3(x,y,z),q=new T.Quaternion().setFromEuler(new T.Euler(roll,pitch,yaw,'ZYX'));
  const eye=new T.Vector3(.62,0,.09).applyQuaternion(q).add(p);
  nav.set('stamp',t);
  nav.set('truth',[x,y,z,q.w,q.x,q.y,q.z,0,0,0,0,101325-10055*z,0,0,9.81,0,0,0]);
  const [sensor,elev,image]=nav.getMany(['sensor','elev','image']);
  const slants=[...sensor.slice(4,57),...elev];
  for(const [i,beam] of beams.entries()){
    const direction=beam.clone().applyQuaternion(q),origin=i<153?p:eye;
    const d=trace(origin,direction,i<4?35:i<153?18:8);
    if(i<153){
      const keep=d>.08&&noise(t,1001+i)>(i<4?-.976:-.93);
      const expected=keep?Math.max(.08,d+noise(t,i+1)*(.012+.0015*d)):0;
      assert.equal(slants[i]>0,expected>0,'acoustic visibility at pose '+frame+', beam '+i);
      if(keep)acousticHits++;
      maxSlantError=Math.max(maxSlantError,Math.abs(expected-slants[i]));
    }else{
      const pixel=i-153;
      let level=14;
      if(d>0){
        const point=eye.clone().addScaledVector(direction,d);
        const texture=.5+.24*Math.sin(point.x*6+point.y*3)*Math.cos(point.z*5)+.23*Math.sin(point.z*11+point.y*4);
        level+=320*texture*Math.exp(-.19*d)/(1+.025*d*d);
        opticalHits++;
      }
      const expected=Math.round(Math.max(0,Math.min(255,level+1.5*noise(t,1501+pixel))));
      maxPixelError=Math.max(maxPixelError,Math.abs(image[pixel]-expected));
    }
  }
}
assert(acousticHits>100 && opticalHits>500);
assert(maxSlantError<2e-5,'range error exceeded mesh serialization tolerance: '+maxSlantError);
assert(maxPixelError<=1,'camera error exceeded one quantization level: '+maxPixelError);
console.log({poses:poses.length,rays:poses.length*beams.length,acousticHits,opticalHits,maxSlantError,maxPixelError});
