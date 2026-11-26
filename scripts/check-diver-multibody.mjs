// Exercise the production floating tree with gravity and known contact loads.
import assert from 'node:assert/strict';
import T from '../viewer/vendor/three.min.js';
import {diverContactRig} from '../viewer/scuba-diver.mjs';
import {divePacket} from '../viewer/npc-room.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',root));
async function sample(inputs={}){
  const fmu=await loadInstance('ScubaDiver',{
    initialState:[0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0],
    initialPosture:1,initialJoints:Array(20).fill(0),waterLevel:0,bedHeight:-100,policyMode:1,meshCollision:1,...inputs
  },async url=>new Response(await readFile(url)));
  fmu.advance(.001);
  const [state,joints,wrench]=fmu.getMany(['state','jointRates','bodyWrench']);
  return {velocity:state.slice(3,6),angular:state.slice(9,12),joints,wrench};
}

const falling=await sample();
assert(Math.abs(falling.velocity[2]+.00980665)<1e-7);
assert(Math.hypot(...falling.angular,...falling.joints)<1e-7);

const flex=await sample({jointAction:[0,.2,0,0,0,0,0,0,0,0]});
assert(Math.hypot(...flex.angular)>.0002,'internal knee effort must counter-rotate the free torso');
assert(flex.joints[1]>.01 && flex.joints[0]<-.001,'knee actuation must also accelerate the linked hip');
assert(Math.hypot(...flex.wrench.map((v,i)=>v-falling.wrench[i]))<1e-7,
  'internal effort created external force or torque');

const strike={contact:[1,0,0,.02],contactMomentArm:[.02,.17,-.75]};
const torso=await sample({...strike,contactLink:1}),shin=await sample({...strike,contactLink:4});
assert(Math.hypot(...torso.joints.map((x,i)=>x-shin.joints[i]))>.002,
  'the narrow-phase link identity must change the joint response to the same external wrench');

const self=await sample({meshSelfContact:[6,13,0,0,1,.02,-.9,0,0]});
assert(Math.hypot(...self.joints)>.005);
assert(Math.hypot(...self.wrench.map((v,i)=>v-falling.wrench[i]))<1e-7);
console.log('Free fall, joint/torso momentum coupling, per-link external contact and balanced internal contact passed.');

// A neutrally trimmed human moving with the current feels only buoyancy at
// the physical links. Virtual joint frames carry zero water load.
const deepState=[0,0,-10,.7,-.15,.1,0,0,0,0,0,0,0,0,0,0];
const wet=await loadInstance('ScubaDiver',{
  initialState:deepState,currentVelocity:deepState.slice(3,6),bedHeight:-100,policyMode:1
},async url=>new Response(await readFile(url)));
const pumps=wet.get('linkFluidWrench'),physical=[1,3,4,6,7,8,10,11,13,14,15];
assert(wet.get('fluidDragPower').every(watts=>Math.abs(watts)<1e-9));
let lift=0;
for(let i=0;i<15;i++){
  const [fx,fy,fz]=pumps.slice(6*i,6*i+3);
  assert(Math.hypot(fx,fy)<1e-9);
  if(physical.includes(i+1)){assert(fz>1);lift+=fz;}
  else assert(fz===0);
}
assert(Math.abs(lift-88*9.80665)<1e-7);
wet.set('currentVelocity',[0,0,0]);
wet.advance(.006);
const drag=wet.get('fluidDragPower');
assert(drag.every(value=>value<=1e-9));
for(const link of physical)assert(drag[link-1]<-.001);
console.log('Immersed body weight, co-moving water and dissipative slip on every massive link passed.');

// The host's posed triangle rig and the visible skin share these bone transforms.
// Compare them with the live plant over a mixed flutter/turn and a beach stride.
const {rig}=diverContactRig(T);
const bindHips=['l','r'].map(side=>rig.group.getObjectByName('thigh_'+side).position.clone());
let maxAnkleError=0,maxBladeError=0;
for(const walking of [false,true]){
  const gait=await loadInstance('ScubaDiver',{
    initialState:[0,0,walking?1:-6,0,0,0,.25,walking?0:.12,walking?0:-.15,0,0,0,0,0,0,0],
    bedHeight:walking?0:-15,initialPosture:walking?1:0,meshCollision:1,pilot:[1,.31,.22,1,0]
  },async url=>new Response(await readFile(url)));
  for(let step=0;step<34;step++){
    gait.advance(.05);
    const [state,activity,joints,lateral,posture,feet]=gait.getMany(['state','activity','jointAngles','lateralAngles','upright','footPosition']);
    const modern=gait.has('axialAngles');
    const row=new Float64Array(modern?divePacket.length:divePacket.axial);
    row.set(state,1);row.set(activity,17);row[divePacket.posture]=posture;row.set(joints,divePacket.joints);
    row.set(lateral,divePacket.lateral);
    if(modern)row.set(gait.get('axialAngles'),divePacket.axial);
    const plantChords=gait.get('chord');
    rig.applyFrame(row,0,()=>walking?0:-15);
    for(const [i,side] of ['l','r'].entries()){
      const [hip,knee,foot]=['thigh','calf','foot'].map(name=>rig.group.getObjectByName(name+'_'+side));
      const pos=b=>b.getWorldPosition(new T.Vector3());
      assert(hip.position.distanceTo(bindHips[i])<1e-9,'a thigh moved out of its bind socket');
      const ankle=pos(foot);
      maxAnkleError=Math.max(maxAnkleError,ankle.distanceTo(new T.Vector3(...feet.slice(3*i,3*i+3))));
      assert(Math.abs(pos(hip).distanceTo(pos(knee))-.428800)<1e-6);
      assert(Math.abs(pos(knee).distanceTo(ankle)-.458788)<4e-6);
      const [heel,tip0,tip1]=foot.userData.standing.sole.map(p=>foot.localToWorld(new T.Vector3(...p)));
      const sole=tip0.lerp(tip1,.5).sub(heel).normalize();
      // Plant chords are in its trim frame. They include both hip axial and fin cant axes.
      const chord=new T.Vector3(...plantChords.slice(i*3,i*3+3))
        .applyEuler(new T.Euler(0,-posture*Math.PI/2,0,'XYZ'))
        .applyQuaternion(rig.group.quaternion);
      maxBladeError=Math.max(maxBladeError,chord.angleTo(sole));
    }
  }
}
assert(maxAnkleError<4e-6,'rendered and simulated ankles diverged by '+maxAnkleError+' m');
assert(maxBladeError<1e-5,'rendered and simulated fin chords diverged by '+maxBladeError+' rad');
console.log('Mixed kick and beach gait match rendered leg lengths, Modelica ankles and fin chords.',{maxAnkleError,maxBladeError});

if(wet.has('axialAngles')){
  // Compare the dressed boot's heel plane, both glove poses and both force
  // normals at anatomical neutral and at opposite usable joint excursions.
  const zeros=n=>Array(n).fill(0),samples=[];
  for(const [ankle,hipAxial,pronation] of [[-.23,-.4,-1.20],[0,0,0],[1.02,.4,1.20]]){
    const joints=zeros(20);
    for(const j of [0,5]){joints[j+1]=.7;joints[j+2]=ankle;}
    const axial=[hipAxial,pronation,-hipAxial,pronation];
    const plant=await loadInstance('ScubaDiver',{
      initialState:deepState,initialJoints:joints,initialAxial:[...axial,...zeros(4)],
      currentVelocity:[0,0,0],bedHeight:-100,policyMode:1,meshCollision:1
    },async url=>new Response(await readFile(url)));
    const [s,activity,q,aq,normals,blades]=plant.getMany(['state','activity','jointAngles','axialAngles','handNormal','bladeNormal']);
    const row=new Float64Array(divePacket.length);
    row.set(s,1);row.set(activity,17);row.set(q,divePacket.joints);row.set(aq,divePacket.axial);
    rig.applyFrame(row,0,()=>-100);
    const wrists=[];
    for(const side of ['l','r']){
      const foot=rig.group.getObjectByName('foot_'+side),shin=rig.group.getObjectByName('calf_'+side);
      const tibia=foot.getWorldPosition(new T.Vector3()).sub(shin.getWorldPosition(new T.Vector3())).normalize();
      const [heel,a,b]=foot.userData.standing.sole.map(p=>foot.localToWorld(new T.Vector3(...p)));
      const span=b.clone().sub(a).normalize(),shoe=a.lerp(b,.5).sub(heel);
      shoe.addScaledVector(span,-shoe.dot(span)).normalize().applyAxisAngle(span,-Math.atan2(.09365,.591));
      assert(Math.abs(shoe.angleTo(tibia)-(Math.PI/2-ankle))<1e-5,'actual boot dorsiflexion or plantarflexion deviated from input');
      wrists.push(rig.group.getObjectByName('hand_'+side).getWorldQuaternion(new T.Quaternion()));
    }
    samples.push({wrists,normals,blades});
  }
  const vec=(values,k)=>new T.Vector3(...values.slice(3*k,3*k+3));
  for(const k of [0,1]){
    assert(samples[0].wrists[k].angleTo(samples[2].wrists[k])>2.3,'forearm must visibly turn the glove');
    assert(vec(samples[0].normals,k).angleTo(vec(samples[2].normals,k))>2.3,'force-bearing palm must turn');
    assert(vec(samples[0].blades,k).angleTo(vec(samples[2].blades,k))>.8,'ankle and hip must reorient the fin');
  }
  console.log('Adult ankle excursions, bilateral forearm-driven gloves and fluid force normals agree.');
}
