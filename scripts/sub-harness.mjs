import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const require=createRequire(import.meta.url), T=require('../viewer/vendor/three.min.js');
const wreck=require('../viewer/wreck.js');
const read=async url=>new Response(await readFile(url));

export async function subHarness(){
  const [plant,nav]=await Promise.all([
    loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45},read),loadInstance('Wreck_Navigation',{},read)
  ]);
  const boxes=wreck(T,{}).children.map(mesh=>({
    p:mesh.position,world:new T.Box3().setFromObject(mesh),inverse:mesh.quaternion.clone().invert(),
    local:new T.Box3(mesh.scale.clone().multiplyScalar(-.5),mesh.scale.clone().multiplyScalar(.5))
  }));
  const beam=nav.get('beam');
  const rays=Array.from({length:beam.length/3},(_,i)=>new T.Vector3().fromArray(beam,3*i));
  const quaternion=new T.Quaternion(),posVec=new T.Vector3(),eye=new T.Vector3(),dir=new T.Vector3();
  const hit=new T.Vector3(),ray=new T.Ray();
  let tick=0;
  function sample(){
    const pos=plant.get('position'),q=plant.get('orientation');
    posVec.fromArray(pos);quaternion.set(q[1],q[2],q[3],q[0]);
    eye.set(.62,0,.09).applyQuaternion(quaternion).add(posVec);
    const nearby=boxes.filter(box=>box.world.distanceToPoint(posVec)<36);
    const ranges=rays.map((beam,i)=>{
      const origin=i>=153?eye:posVec,limit=i<4?35:i<153?18:8;
      dir.copy(beam).applyQuaternion(quaternion);let nearest=Infinity;
      for(const box of nearby){
        ray.origin.copy(origin).sub(box.p).applyQuaternion(box.inverse);
        ray.direction.copy(dir).applyQuaternion(box.inverse);
        ray.origin.addScaledVector(ray.direction,.08);
        if(ray.intersectBox(box.local,hit))nearest=Math.min(nearest,hit.distanceTo(ray.origin)+.08);
      }
      return nearest<=limit?nearest:0;
    });
    nav.set('stamp',tick/100);nav.set('raster',ranges);nav.set('useRaster',1);
    nav.set('truth',[...pos,...q,...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
      ...plant.get('specificForce'),...plant.get('rates')]);
    const sensor=nav.get('sensor'),elev=nav.get('elev'),image=nav.get('image'),estimate=nav.get('estimate');
    const features=nav.get('features'),history=nav.get('keyframes');
    plant.set('sensor',sensor);plant.set('elevationRanges',elev);
    nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
    return {pos,q,sensor,elev,image,estimate,features,history};
  }
  return {plant,nav,sample,step(count=20){for(let i=0;i<count;i++){plant.advance(.01);tick++;}}};
}
