// Heading-frame loads must stay attached to the interpolated hull throughout attitude changes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {forceDisplay} from '../viewer/instrumentation.mjs';
const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const scene=new T.Scene(),boat=new T.Group();scene.add(boat);
const bodyForce=new T.Vector3(8,2,-1),bodyArm=new T.Vector3(-.8,.55,-.17),direction=new T.Vector3();
let sample;
const draw=forceDisplay(T,scene,null,boat,false,{getMany:()=>sample});
const arrows=boat.getObjectByName('Sailboat body-frame forces');
let time=0;
for(const [heel,trim,yaw] of [[0,0,0],[.65,-.2,1.3],[-.4,.22,-2.7],[1.4,.3,3.05]]){
  const level=new T.Quaternion().setFromEuler(new T.Euler(heel,trim,0,'ZYX'));
  const f=bodyForce.clone().applyQuaternion(level).toArray(),a=bodyArm.clone().applyQuaternion(level).toArray();
  sample=[[...f,...f],[...f,...f],[...a,...a]];
  const state=Array(30).fill(0);state[4]=heel;state[5]=trim;state[29]=81;
  boat.rotation.set(heel*.75,trim*.75,yaw,'ZYX');boat.position.set(13+time,-1,2);boat.updateMatrixWorld();
  const t=++time;
  for(const blend of [0,.4,1]){
    draw(true,state,null,false,t,blend,1);
    const foil=arrows.children[2];assert(foil.visible&&foil.position.distanceTo(bodyArm)<1e-7);
    assert(direction.set(0,1,0).applyQuaternion(foil.quaternion).angleTo(bodyForce)<1e-7);
    assert(direction.set(0,1,0).applyQuaternion(arrows.children.at(-1).quaternion).applyQuaternion(boat.quaternion).z>.99999);
    assert(foil.getWorldPosition(direction).distanceTo(boat.localToWorld(bodyArm.clone()))<1e-7);
  }
}
console.log('Sail and foil loads stayed in body axes under combined roll, pitch and yaw; buoyancy stayed vertical.');
