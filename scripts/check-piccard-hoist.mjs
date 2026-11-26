// Replay the skipper's measured rider pose against a separately interpolated
// cruiser. This is also the pose given to the mounted Piccard's FMU.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {measuredPoseInCarrier,hookAbovePiccard} from '../viewer/piccard-hoist.mjs';
import {liftMechanism,seatRider} from '../viewer/stern-lift.mjs';

const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const V=(...xyz)=>new T.Vector3(...xyz);
const boat=new T.Object3D(),rider=new T.Object3D();
const sample=new T.Object3D();
sample.position.set(-11,6,.53);sample.rotation.set(.11,-.17,1.1,'ZYX');
const carrier=[...sample.position.toArray(),sample.rotation.z,sample.rotation.x,sample.rotation.y,1.2,-.2,.4,.05,.04,.08];
const namedCarrier=Object.fromEntries(['x','y','z','yaw','heel','pitch','ve','vn','vu','we','wn','wu'].map((k,i)=>[k,carrier[i]]));
sample.updateMatrixWorld();
boat.position.set(-10.92,5.98,.57);boat.rotation.set(.14,-.15,1.18,'ZYX');
boat.updateMatrixWorld();
const swing=new T.Quaternion().setFromEuler(new T.Euler(.04,-.12,.02,'ZYX'));
const fwd=V(1,0,0).applyQuaternion(swing),up=V(0,0,1).applyQuaternion(swing);
const enu=v=>v.clone().applyQuaternion(sample.quaternion).toArray();
const origin=V(-3.46,1.74,1.19),tip=origin.clone().addScaledVector(up,hookAbovePiccard);
const pose=[...sample.localToWorld(origin.clone()).toArray(),...enu(V(1.8,-.65,.45)),
  ...enu(fwd),...enu(up),...enu(V(.23,-.12,.16))];
assert.equal(hookAbovePiccard,.15);
const matingPoint=new T.Object3D();matingPoint.position.set(0,0,hookAbovePiccard);rider.add(matingPoint);
for(const poseCarrier of [carrier,namedCarrier]){
  const measured=measuredPoseInCarrier(T,boat,{pose,poseCarrier});
  seatRider(T,rider,boat,.52,measured);
  rider.updateMatrixWorld();
  assert(rider.position.distanceTo(boat.localToWorld(origin.clone()))<1e-12);
  const hook=boat.localToWorld(tip.clone());
  assert(matingPoint.getWorldPosition(V()).distanceTo(hook)<1e-12);
  assert(V().fromArray(measured,3).distanceTo(V(1.8,-.65,.45).applyQuaternion(boat.quaternion))<1e-12);
  assert(V().fromArray(measured,12).distanceTo(V(.23,-.12,.16).applyQuaternion(boat.quaternion))<1e-12);
}
// Measured rotation and swing ride on a carrier already moving east. Its
// translational ENU velocity must stay east if its independent heading changes.
const current={ve:2.1,vn:-.4,vu:.15,we:-.04,wn:.09,wu:.11};
const delta=boat.quaternion.clone().multiply(sample.quaternion.clone().invert());
const arm=origin.clone().applyQuaternion(sample.quaternion);
const slip=V().fromArray(pose,3).sub(V(...carrier.slice(6,9))).sub(V().crossVectors(V(...carrier.slice(9,12)),arm));
const expect=V(current.ve,current.vn,current.vu).add(V().crossVectors(V(current.we,current.wn,current.wu),arm.applyQuaternion(delta))).add(slip.applyQuaternion(delta));
const physics=measuredPoseInCarrier(T,boat,{pose,poseCarrier:namedCarrier},current);
assert(V().fromArray(physics,3).distanceTo(expect)<1e-12);
for(const level of [0,.38,.56,.74,1]){
  const {padX,padY,padZ}=liftMechanism(level);
  seatRider(T,rider,boat,level);
  assert(rider.position.distanceTo(boat.localToWorld(V(padX,padY,padZ)))<1e-12);
  assert(rider.quaternion.equals(boat.quaternion));
}
console.log('The steel pickup plate met the owner magnet within 1e-12 m on both carriers; release twist and five actuator poses passed.');
