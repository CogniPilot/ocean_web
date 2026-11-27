// Verify the training specialization against the collision-enabled model in
// free water, then inject witnesses, penetrating terrain and crossed limbs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const runtime=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {prepareInstance:prepareTraining}=await import(new URL('instance.mjs',runtime));
const original=await prepareInstance('ScubaDiver',read,true);
const training=await prepareTraining('ScubaDiverOpenWater',read,true);
const zeros=n=>Array(n).fill(0);
const inputs={initialState:[0,0,-18,...zeros(13)],bedHeight:-120,currentVelocity:[.12,-.15,.01],
  meshCollision:1,pilot:[1,.15,0,.7,0],policyMode:1,neutralTrim:1};
const fields=['state','jointAngles','jointRates','lateralAngles','axialAngles','mechanicalPower','bodyWrench','vestLitres','dive'];
function numbers(value){return [value].flat(Infinity);}
const control=await original(inputs),open=await training(inputs);
let worst=0;
try{
  for(let tick=0;tick<240;tick++){
    if(tick%20===0){
      const phase=tick*Math.PI/120;
      for(const f of [control,open]){
        f.set('jointAction',[.1*Math.sin(phase),.3,.25,.1,.05,-.1*Math.sin(phase),.45,.2,-.1,-.05]);
        f.set('lateralAction',[.1,-.05,-.1,.05]);f.set('axialAction',[.04,.1,-.04,.1]);
      }
    }
    control.advance(.01);open.advance(.01);
    const a=numbers(control.getMany(fields)),b=numbers(open.getMany(fields));
    for(let i=0;i<a.length;i++)worst=Math.max(worst,Math.abs(a[i]-b[i])/(1+Math.abs(a[i])));
  }
  assert(worst<1e-6,'free-water trajectory mismatch '+worst);
}finally{control.close();open.close();}

const shallow={...inputs,bedHeight:-.25,bedSlope:[.3,-.2],meshCollision:0};
const grounded=await original(shallow);
try{
  assert(grounded.get('footContact').some(force=>force>0)&&grounded.get('torsoReaction')>0);
}finally{grounded.close();}
const neutral=await training(inputs),intruded=await training(shallow);
try{
  intruded.set('meshSelfContact',[1,3,1,0,0,.15,.1,.1,.1]);
  intruded.set('contact',[0,0,1,.22]);intruded.set('contactLink',1);intruded.set('contactMomentArm',[.3,.1,.1]);
  for(let tick=0;tick<120;tick++){
    if(tick===60)intruded.set('contactWitness',[1,0,0,0,-17.8,0,0,0,.60]);
    for(const f of [neutral,intruded]){
      f.set('jointAction',[0,0,0,-.55,.25,0,0,0,-.55,.25]);f.advance(.01);
    }
    assert.deepEqual(intruded.getMany(fields),neutral.getMany(fields));
    assert(numbers(intruded.getMany(['contactForce','footContact','selfContactTorque','selfContactLateralTorque',
      'selfContactStatus','torsoReaction','upright'])).every(v=>v===0));
  }
}finally{neutral.close();intruded.close();}

const stops=await training({...inputs,initialJoints:[.4,-.12,0,0,0,.4,-.12,0,0,0,...zeros(10)],
  initialLateral:[-.35,.67,.35,-.67,0,0,0,0]});
try{
  const moment=stops.get('stopMoment');
  for(const i of [0,5])assert(moment[i]<-50&&moment[i+1]>50);
  stops.set('jointAction',[1,-1,0,0,0,1,-1,0,0,0]);stops.set('lateralAction',[-1,1,1,-1]);
  for(let tick=0;tick<60;tick++)stops.advance(.01);
  const q=stops.get('jointAngles'),lat=stops.get('lateralAngles');
  for(const i of [0,5])assert(q[i]<.36&&q[i+1]>-.09);
  assert(lat[0]>-.29&&lat[1]<.59&&lat[2]<.29&&lat[3]>-.59);
}finally{stops.close();}
console.log('240-step free-water parity, external/mesh/analytic/ground contact isolation, anatomical end stops passed',{worst});
