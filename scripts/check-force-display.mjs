// Heading-frame loads must stay attached to the interpolated hull throughout attitude changes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {forceDisplay} from '../viewer/instrumentation.mjs';
const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const scene=new T.Scene(),boat=new T.Group();scene.add(boat);
const bodyForce=new T.Vector3(8,2,-1),bodyArm=new T.Vector3(-.8,.55,-.17),direction=new T.Vector3();
let sample;
const draw=forceDisplay(T,scene,null,boat,false,{has:k=>['rigForce','foilLoad','foilArm'].includes(k),getMany:()=>sample});
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

// Each snapshot's force and moment are in Modelica's level heading frame.
// The displayed arm and residual couple must recover that wrench in hull axes.
const sailScene=new T.Scene(),hull=new T.Group();sailScene.add(hull);
let fieldValues,sampleReads=0;
const observed=new Map();
const wrenchModel={has:key=>Object.hasOwn(fieldValues,key),getMany:keys=>{sampleReads++;return keys.map(key=>fieldValues[key]);}};
const vec=(x,y,z)=>new T.Vector3(x,y,z);
const close=(a,b,label)=>assert.ok(a.distanceTo(b)<1e-7*Math.max(1,a.length(),b.length()),label+' '+a.toArray()+' / '+b.toArray());
const cloth=[];
for(let r=0;r<6;r++)for(let col=0;col<4;col++)cloth.push(-2*col/3,0,4*r/5);
function wrenchSample(heel,pitch,trim,force,couple,pressure){
  const level=new T.Quaternion().setFromEuler(new T.Euler(heel,pitch,0,'ZYX'));
  const sail=new T.Quaternion().setFromAxisAngle(vec(0,0,1),trim),origin=vec(.4,.05,.5);
  const c=Math.cos(trim),s=Math.sin(trim),sheet=[c,-s,0,s,c,0,0,0,1];
  const arm=pressure.clone().applyQuaternion(sail).add(origin),f=force.clone().applyQuaternion(sail);
  const m=couple.clone().applyQuaternion(sail).add(vec().crossVectors(arm,f));
  const pair=v=>{const xyz=v.clone().applyQuaternion(level).toArray();return [...xyz,...xyz];};
  fieldValues={sailVertex:[...cloth,...cloth],sheetRotation:[...sheet,...sheet],origin:pair(origin),rigForce:pair(f),rigMoment:pair(m),
    foilLoad:Array(6).fill(0),foilArm:Array(6).fill(0)};
  const state=Array(30).fill(0);state[4]=heel;state[5]=pitch;
  return {f,m,arm,state,center:vec(-1,0,2).applyQuaternion(sail).add(origin)};
}
const one=wrenchSample(.7,-.24,.51,vec(0,12,0),vec(0,1.5,0),vec(-.8,0,2.4));
const overlay=forceDisplay(T,sailScene,null,hull,false,wrenchModel,(_frame,name,isMoment,p,v)=>{
  observed.set(name,{p:vec(...p),v:vec(...v),isMoment});
});
function verify(sample,t,blend,previous,force,moment){
  observed.clear();overlay(true,sample.state,null,false,t,blend,previous);
  for(const name of ['Mainsail','Jib']){
    const result=observed.get(name+' · fluid force'),couple=observed.get(name+' · residual couple');
    assert.equal(hull.getObjectByName(name+' · fluid force').visible,false,'the load inspector draws the only sail force arrow');
    close(result.v,force,name+' force');
    close(vec().crossVectors(result.p,result.v).add(couple?.v??vec(0,0,0)),moment,name+' moment about hull origin');
    if(couple)close(couple.p,result.p,name+' couple and force share the arm');
  }
  return observed.get('Mainsail · fluid force').p;
}
close(verify(one,1,1,1,one.f,one.m),one.arm,'Resultant runs through the loaded cloth patch');
const two=wrenchSample(-.5,.31,-.77,vec(0,8,0),vec(0,-.9,0),vec(-1.4,0,1.6));
for(const blend of [0,.28,1]){
  const arm=verify(two,2,blend,1,one.f.clone().lerp(two.f,blend),one.m.clone().lerp(two.m,blend));
  if(blend===1)close(arm,two.arm,'Shifted trim and heel preserve the pressure line');
}
assert.equal(sampleReads,2,'one synchronized FMI batch per committed timestamp');
for(const [i,force] of [vec(0,1e-8,0),vec(0,0,0)].entries()){
  const cancel=wrenchSample(.6,-.33,1.1,force,vec(12,-6,1),vec(-1,0,2));
  const arm=verify(cancel,3+i,1,1,cancel.f,cancel.m);
  assert(arm.distanceTo(cancel.center)<=Math.sqrt(5)+1e-8,'a near-zero force keeps its glyph at the sail');
  assert(observed.get('Mainsail · residual couple').v.length()>10,'opposing panel loads retain a free couple');
}
console.log('Both sail wrenches preserved force and moment under heel, trim, interpolation, and cancellation.');

const {loadInstance}=await import('../viewer/fmi3/instance.mjs');
const {readFile}=await import('node:fs/promises');
for(const plant of ['Hobie16','Sailboat']){
  const model=await loadInstance(plant,{windEast:-3,windNorth:8,launchEast:-900,launchNorth:-200,launchSpeed:2,
    launchHeight:.2,launchHeading:.4,launchHeel:.22,launchPitch:.12,manualHelm:1,trimInput:.5},async url=>new Response(await readFile(url)));
  try{
    const display=forceDisplay(T,sailScene,null,hull,plant==='Hobie16',model,(_frame,label,isMoment,p,v)=>observed.set(label,{p:vec(...p),v:vec(...v)}));
    for(const trim of [.5,-.8]){
      model.set('trimInput',trim);
      for(let step=0;step<15;step++)model.advance(.01);
      const [heel,pitch,force,moment,feet]=model.getMany(['heel','pitch','rigForce','rigMoment','origin']);
      const level=new T.Quaternion().setFromEuler(new T.Euler(heel,pitch,0,'ZYX'));
      const pose=Array(30).fill(0);pose[4]=heel;pose[5]=pitch;
      observed.clear();display(true,pose,null,false,model.time,1,1);
      for(const [i,name] of ['Mainsail','Jib'].entries()){
        const arrow=observed.get(name+' · fluid force'),couple=observed.get(name+' · residual couple')?.v??vec();
        close(arrow.v.clone().applyQuaternion(level),vec().fromArray(force,3*i),plant+' force');
        close(vec().crossVectors(arrow.p,arrow.v).add(couple).applyQuaternion(level),vec().fromArray(moment,3*i),plant+' moment');
        assert(arrow.p.clone().applyQuaternion(level).distanceTo(vec().fromArray(feet,3*i))>.35,plant+' loaded sail resultant is above the rig foot');
      }
    }
  }finally{model.close();}
}
console.log('Hobie and sloop FMI sail forces and residual couples reconstruct both measured wrenches.');
