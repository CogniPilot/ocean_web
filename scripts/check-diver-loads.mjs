// Reconstruct the wire-format diagnostics using the same posed frames as the renderer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import T from '../viewer/vendor/three.min.js';
import {diverContactRig} from '../viewer/scuba-diver.mjs';
import {divePacket} from '../viewer/npc-room.mjs';

const runtime=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',runtime));
const siteLink=[0,0,0,0,2,3,5,6,7,9,10,12,13,14],g=9.80665,rho=1025;
const state=[1,-2,-7,.31,-.16,.12,.43,-.17,.24,0,0,0,0,0,0,0];
const zeros=n=>Array(n).fill(0);
const near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,`${a} differs from ${b} by ${a-b}`);
const {rig}=diverContactRig(T);
const joints=new Map();rig.group.traverse(node=>{if(node.userData.physicsJoint)joints.set(node.userData.physicsJoint.label,node);});
const frames=[joints.get('Left hip sweep').parent,
  ...['Left','Right'].flatMap(s=>['hip sweep','hip flexion','knee','ankle','fin cant','shoulder','elbow'].map(j=>joints.get(s+' '+j)))];
const vector=v=>new T.Vector3(...v);
async function sample(extra={}){
  const plant=await loadInstance('ScubaDiver',{initialState:state,policyMode:1,meshCollision:1,bedHeight:-100,currentVelocity:state.slice(3,6),...extra},
    async url=>new Response(await readFile(url)));
  const [s,activity,q,l,u,sites,weights,wrench,dragPower]=plant.getMany(['state','activity','jointAngles','lateralAngles','upright','siteLoads','linkWeights','linkFluidWrench','fluidDragPower']);
  const packet=new Float64Array(divePacket.length);packet.set(s,1);packet.set(activity,17);packet.set(q,divePacket.joints);packet.set(l,divePacket.lateral);packet[divePacket.posture]=u;
  rig.applyFrame(packet,0,()=>-100);rig.group.updateWorldMatrix(true,true);
  const components=siteLink.map((_,i)=>sites.slice(13*i,13*i+13));
  const forces=frames.map(()=>new T.Vector3()),moments=frames.map(()=>new T.Vector3());
  for(const [i,values] of components.entries()){
    const link=siteLink[i],rotation=frames[link].getWorldQuaternion(new T.Quaternion());
    const dragArm=vector(values.slice(0,3)).applyQuaternion(rotation);
    const liftArm=vector(values.slice(3,6)).applyQuaternion(rotation);
    const lift=new T.Vector3(0,0,values[6]),drag=vector(values.slice(7,10)),couple=vector(values.slice(10,13));
    forces[link].add(lift).add(drag);
    moments[link].add(couple).add(dragArm.cross(drag)).add(liftArm.cross(lift));
  }
  for(let i=0;i<frames.length;i++){
    [...forces[i].toArray(),...moments[i].toArray()].forEach((value,j)=>near(value,wrench[6*i+j]));
  }
  const weight=weights.filter((_,i)=>i%4===3);near(weight.reduce((a,b)=>a+b),-88*g);
  assert.equal(weight.filter(v=>v<0).length,11);
  return {components,weight,dragPower,litres:plant.get('vestLitres')};
}

const neutral=await sample(),sumLift=neutral.components.reduce((a,c)=>a+c[6],0);
near(sumLift,88*g);
assert(neutral.components.every(c=>c.slice(7).every(v=>Math.abs(v)<1e-9)));
const ambient=1.01325+rho*g*7/100000;
const inflated=await sample({initialVestGas:4*ambient});near(inflated.litres,4);near(neutral.litres,3);
for(let i=0;i<siteLink.length;i++)near(inflated.components[i][6]-neutral.components[i][6],i===3?.001*rho*g:0);
assert.deepEqual(neutral.weight,inflated.weight);
const active=state.slice();active[2]=-.09;active[9]=.32;active[10]=-.18;active[11]=.63;
const q=[.3,.6,-.32,.4,.2,-.2,.8,.26,.22,.16];
const sweeping=await sample({initialState:active,initialPosture:.25,currentVelocity:[0,0,0],
  initialJoints:[...q,...zeros(10)],initialLateral:[.24,.17,-.24,-.18,...zeros(4)]});
assert(sweeping.components.some(s=>s[6]>0&&Math.hypot(...s.slice(7,10))>1));
assert(sweeping.components.some(s=>Math.hypot(...s.slice(10,13))>.01));
assert(sweeping.components.some(s=>s[6]>0&&Math.hypot(...s.slice(0,3).map((v,i)=>v-s[i+3]))>.01));
assert(sweeping.dragPower.reduce((a,b)=>a+b)<-1);
const dry=await sample({initialState:[...state.slice(0,2),4,...state.slice(3)]});
assert(dry.components.every(s=>s.slice(6).every(v=>Math.abs(v)<1e-10)));
console.log('All 15 link wrenches reconstructed in moving, dry and partially immersed poses; 88 kg weight and neutral displacement; +1 L gave',.001*rho*g,'N at the vest.');
