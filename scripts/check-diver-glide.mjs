// Verify open-water attitude, articulated glide trim and passive waterline loads.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadSwimPolicy,decisionSteps} from '../viewer/diver-swim-policy.mjs';
const directory=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',directory));
const read=async url=>new Response(await readFile(url));
async function swimmer(depth,velocity=0,inputs={}){
  return loadInstance('ScubaDiver',{
    initialState:[0,0,-depth,velocity,0,0,0,0,0,0,0,0,0,0,0,0],
    initialPosture:1,waterLevel:0,bedHeight:-30,meshCollision:1,pilot:[1,0,0,0,0],...inputs
  },read);
}
let maxSubmergedPitch=0;
for(const depth of [.72,8]){
  const m=await swimmer(depth);
  for(let i=0;i<60;i++){
    m.advance(.05);
    const [state,upright,q,sites]=m.getMany(['state','upright','jointAngles','siteLoads']);
    assert.equal(upright,0,'a submerged swimmer acquired a prescribed torso rotation');
    assert(q[1]>.72&&q[6]>.72,'idle knees straightened');
    assert(sites.filter((_,i)=>i%13===6).every(b=>b>0),'a submerged link lost its buoyancy');
    maxSubmergedPitch=Math.max(maxSubmergedPitch,Math.abs(state[7]));
  }
}
assert(maxSubmergedPitch<.04,'unexpected active rotation in full immersion');
for(const learned of [false,true]){
  const m=await swimmer(6,.49,{policyMode:Number(learned),neutralTrim:Number(learned)});
  const c=learned&&await loadSwimPolicy(read);
  let crossflow=0,dissipation=0,kneeSwing=0,minKnee=10,maxKnee=-10;
  for(let tick=0;tick<400;tick++){
    const active=tick>=250;
    if(tick===250)m.set('pilot',[1,0,0,1,0]);
    if(c){const s=m.get('state');c.command([0,0,0],Number(active),0,0,0,false);
      if(tick%decisionSteps===0)c.decide(s);c.stroke(m,s);}
    m.advance(.01);
    const [q,normals,flow,power,upright]=m.getMany(['jointAngles','bladeNormal','rigFlow','finFluidPower','upright']);
    assert.equal(upright,0);
    if(tick>=35&&tick<205){
      assert(q[1]>.72&&q[6]>.72);
      for(let side=0;side<2;side++){
        const i=3*side,w=flow.slice(i,i+3);
        const normalSpeed=normals.slice(i,i+3).reduce((n,x,k)=>n+x*w[k],0);
        crossflow=Math.max(crossflow,Math.abs(normalSpeed)/Math.max(.05,Math.hypot(...w)));
      }
      dissipation=Math.max(dissipation,-power);
    }
    if(tick>=300){minKnee=Math.min(minKnee,q[1]);maxKnee=Math.max(maxKnee,q[1]);}
  }
  kneeSwing=maxKnee-minKnee;
  assert(crossflow<.20&&dissipation<.23,'unfeathered glide '+JSON.stringify({crossflow,dissipation}));
  assert(kneeSwing>.06,'commanded kicks must resume');
  console.log(learned?'Learned':'Manual',{maxNormalFlowFraction:crossflow,maxFinDragPowerW:dissipation,resumedKneeSwingRad:kneeSwing});
}
const crossing=await swimmer(.32,0,{initialState:[0,0,-.32,0,0,.34,0,.22,.12,0,0,0,0,0,0,0]});
let shallow=Infinity,deep=0,torque=0;
for(let i=0;i<110;i++){
  const state=crossing.get('state');
  crossing.set('waterLevel',state[2]+.20-.35*Math.sin(2*Math.PI*i/100));
  crossing.advance(.025);
  const [u,sites,w]=crossing.getMany(['upright','siteLoads','bodyWrench']);
  assert.equal(u,0);
  const lift=sites.filter((_,j)=>j%13===6).reduce((sum,v)=>sum+v,0);
  shallow=Math.min(shallow,lift);deep=Math.max(deep,lift);torque=Math.max(torque,Math.hypot(...w.slice(3)));
}
assert(deep>800&&shallow<400&&torque>1,'waterline should change submerged volumes and exert a real moment');
const ground=await swimmer(-1.05,0,{bedHeight:0,initialJoints:Array(20).fill(0)});
assert(ground.get('upright')>.9,'ground gait did not engage near sand');
console.log('Wet/dry torque, grounded gait and free body orientation passed.',{maxSubmergedPitch,minLiftN:shallow,maxLiftN:deep,maxTorqueNm:torque});
