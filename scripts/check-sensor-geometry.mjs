import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {bedEcho} from './bed-oracle.mjs';
import {scanRangeOracle} from './scan-range-oracle.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

// Independent exhaustive ray/mesh oracle for the native range model. This runs
// only during verification; the simulation worker has no graphics dependency.
const require=createRequire(import.meta.url);
const T=require('../viewer/vendor/three.min.js');
const nav=await loadInstance('Wreck_Navigation',{},async url=>new Response(await readFile(url)));
const scanEcho=await scanRangeOracle(T);
const array=nav.get('beam');
const beams=Array.from({length:array.length/3},(_,i)=>new T.Vector3().fromArray(array,3*i));
function noise(t,channel){
  const x=43758.5453*Math.sin(12.9898*channel+78.233*(t+1));
  return 2*(x-Math.floor(x)-.5);
}
function trace(origin,direction,limit){
  const nearest=scanEcho(origin,direction,bedEcho(origin,direction));
  return nearest<=limit?nearest:0;
}
const poses=[
  [-24,18,-9.8,0,0,Math.PI/2], [-33,24,-11.4,.15,.3,.4], [56,-58.3,-8,0,0,Math.PI/2],
  [68,-44,-6,.13,-.22,-Math.PI/2], [5.4,.78,-7,-.08,.34,-1.52], [400,300,0,0,0,0]
];
let maxSlantError=0,maxPixelError=0,dvlHits=0,sonarHits=0,opticalHits=0;
for(const [frame,pose] of poses.entries()){
  const [x,y,z,roll,pitch,yaw]=pose,t=frame*.2;
  const p=new T.Vector3(x,y,z),q=new T.Quaternion().setFromEuler(new T.Euler(roll,pitch,yaw,'ZYX'));
  const eye=new T.Vector3(.31,0,.045).applyQuaternion(q).add(p);
  nav.set('stamp',t);
  nav.set('truth',[x,y,z,q.w,q.x,q.y,q.z,0,0,0,0,101325-10055*z,0,0,9.81,0,0,0]);
  const [sensor,elev,image]=nav.getMany(['sensor','elev','image']);
  const dvlOrigin=new T.Vector3(0,0,-.075).applyQuaternion(q).add(p);
  const sonarOrigin=new T.Vector3(.30,0,.01).applyQuaternion(q).add(p);
  // The imaging sonar reports the strongest range bin after integrating fifteen
  // elevations. Its result must fall in an illuminated interval at that bearing.
  for(let bearing=0; bearing<49; bearing++){
    const az=(2*Math.round(bearing*64/48)/64-1)*65*Math.PI/180;
    const slant=sensor[8+bearing],ranges=[];
    for(let j=0;j<15;j++){
      const el=(-6+(2*j/14-1)*10)*Math.PI/180;
      const dir=new T.Vector3(Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)).applyQuaternion(q);
      ranges.push(trace(sonarOrigin,dir,18));
    }
    if(!ranges.some(r=>r>=.1))assert.equal(slant,0,'echo outside the illuminated scene');
    if(slant>0){
      const halfWidth=18/128;
      const inBeam=ranges.some((r,j)=>{
        if(r<.1)return false;
        if(Math.abs(slant-r)<=halfWidth)return true;
        const prev=ranges[j-1];
        return prev>=.1 && Math.abs(r-prev)<Math.min(1.8,.14*r) &&
          slant>=Math.min(r,prev)-halfWidth && slant<=Math.max(r,prev)+halfWidth;
      });
      assert(inBeam,'dominant echo outside the rendered surfaces at pose '+frame+', bearing '+bearing);
      sonarHits++;
    }
  }
  assert(elev.every(x=>x===0),'Imaging head does not measure an independent elevation fan');
  for(const [i,beam] of beams.entries()){
    if(i>=4 && i<153)continue;
    const direction=beam.clone().applyQuaternion(q),origin=i<4?dvlOrigin:eye;
    const d=trace(origin,direction,i<4?50/Math.cos(Math.PI/8):8);
    if(i<4){
      const keep=d>.08&&noise(t,1001+i)>(i<4?-.976:-.93);
      const expected=keep?Math.max(.08,d+noise(t,i+1)*(.012+.0015*d)):0;
      assert.equal(sensor[4+i]>0,expected>0,'acoustic visibility at pose '+frame+', beam '+i);
      if(keep)dvlHits++;
      maxSlantError=Math.max(maxSlantError,Math.abs(expected-sensor[4+i]));
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
assert(dvlHits>=16 && sonarHits>100 && opticalHits>500);
assert(maxSlantError<2e-5,'range error exceeded mesh serialization tolerance: '+maxSlantError);
assert(maxPixelError<=1,'camera error exceeded one quantization level: '+maxPixelError);
console.log({poses:poses.length,dvlHits,sonarHits,opticalHits,maxSlantError,maxPixelError});
