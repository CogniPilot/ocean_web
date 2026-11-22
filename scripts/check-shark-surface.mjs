import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));

async function swim(name, initialPitch, depth, surge, seconds, pilot) {
  const model=await loadInstance('HarborTraffic',{
    initialState:[0,-28,6,0,2,-25,2,6,0,-55,-38,-depth,0,-.06,0,0,0],
    initialFish:[surge,0,initialPitch,0,0,0,0,0,0,0]
  },read);
  let maxNose=-Infinity, maxHeight=-Infinity, firstLevel, dry=0, partial=0;
  let wasOut=false, emerged=0, returned=0, maxTimeOut=0, riseTime=0, pitch=0;
  for(let tick=0;tick<seconds*100;tick++){
    const time=tick/100;
    model.set('sharkPilot',pilot(time));model.advance(.01);
    const [state,fish,wet,thrust]=model.getMany(['state','fish','whiteShark.tailWet','sharkTailForce']);
    pitch=fish[2];
    const height=state[11],nose=height+2.32*Math.sin(pitch),out=nose>.1;
    assert(Number.isFinite(pitch)&&Number.isFinite(nose));
    if(wet===0){dry++;assert(thrust===0,'Dry caudal lobes generated water thrust');}
    if(wet>0&&wet<1)partial++;
    if(out&&!wasOut){riseTime=time;emerged++;}
    if(wasOut&&!out)returned++;
    if(out)maxTimeOut=Math.max(maxTimeOut,time-riseTime);
    if(firstLevel===undefined&&Math.abs(pitch)<.25)firstLevel=time;
    maxNose=Math.max(maxNose,nose);maxHeight=Math.max(maxHeight,height);wasOut=out;
  }
  const result={emerged,returned,maxTimeOut,maxNose,maxHeight,firstLevel,pitch,dry,partial};
  console.log(name,result);
  return result;
}
const climb=await swim('held climb',0,3,3.5,28,()=>[1,.88,1,-1]);
assert(climb.maxTimeOut<1 && Math.abs(climb.pitch)<.22);
for(const direction of [1,-1]){
  const result=await swim('vertical release '+direction,1.48*direction,.12,.1,8,()=>[1,0,1,-1]);
  assert(result.firstLevel<2.5 && Math.abs(result.pitch)<.12 && result.maxTimeOut<2);
  if(direction<0)assert(result.dry>0 && result.partial>0,'Exposed caudal lobes must reenter progressively');
}
const breaches=await swim('repeated breaches',0,2,3,44,time=>{
  const age=time%16;
  return [1,0,1,age<=10?age:-1];
});
assert.equal(breaches.emerged,3);
assert.equal(breaches.returned,3);
assert(breaches.maxNose>1.2 && breaches.maxHeight>0 && breaches.maxTimeOut<3.5);
