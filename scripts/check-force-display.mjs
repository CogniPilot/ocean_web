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

// Resolve water loads in world axes and motor torque about the moving joint.
const {loadVectors}=await import('../viewer/load-vectors.mjs');
const root=new T.Group(),thigh=new T.Group();scene.add(root);root.add(thigh);
root.position.set(8,3,-7);root.rotation.z=Math.PI/2;
thigh.position.set(-.21,.11,.04);thigh.userData.physicsJoint={axis:[0,1,0],label:'Left hip flexion'};
root.userData.physicsBodies=[{frame:root,label:'Torso and equipment'}];
const abort=new AbortController(),display=loadVectors(T,scene,new EventTarget(),{},abort.signal);
const siteLoads=Array(182).fill(0),linkWeights=Array(60).fill(0);
siteLoads[6]=545;siteLoads[39+6]=30;siteLoads[39+5]=.13;
siteLoads[7]=-5;linkWeights[3]=-575;
const model={siteLoads,linkWeights,jointTorque:[-8,0,0,0,0,0,0,0,0,0]};
const glyphs=scene.getObjectByName('Forces and moments').children;
function inspect(mode,part){
  display.begin(new T.PerspectiveCamera());display.wildlife(root,'diver',model,mode,part);display.end();
  return glyphs.filter(g=>g.visible);
}
const summary=inspect('overview');
assert.equal(summary.length,4);
assert(summary.some(g=>g.name.includes('weight')&&g.name.includes('575 N')));
assert(summary.some(g=>g.name.includes('bladder')&&g.position.z===root.position.z+.13));
assert(summary.some(g=>g.name.includes('buoyancy')&&g.position.distanceTo(root.position)<1e-10));
assert(summary.some(g=>g.name.includes('drag')&&g.name.includes('5 N')));
const [torque]=inspect('overview',{kind:'joint',label:'Left hip flexion',frame:thigh});
assert(torque.name.includes('actuator')&&torque.position.distanceTo(thigh.getWorldPosition(new T.Vector3()))<1e-10);
assert(direction.set(0,0,1).applyQuaternion(torque.quaternion).distanceTo(new T.Vector3(1,0,0))<1e-10);
display.begin(new T.PerspectiveCamera());display.end();assert(glyphs.every(g=>!g.visible));abort.abort();
console.log('Overview separates weight, body buoyancy, bladder lift and drag. Pinning isolates joint torque.');
