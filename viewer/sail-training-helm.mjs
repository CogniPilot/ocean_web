import {getAppliedPolicy} from './live-training-tasks.mjs';
import {openPolicyActor} from './live-policy-actor.mjs';
import {sailTrainingTasks,signedWindAngle} from './sail-training-tasks.mjs';

// Keep the controls that the manual helm/autopilot would have written. This
// lets the player take the helm again with the same rig and crew settings.
export function sailTrainingHelm(raw,cat,field,select,report){
  const task=sailTrainingTasks[cat?0:1],overrides={manualHelm:1,deckManual:1,manualJibAssist:0,ballastManual:1};
  const manual={manualHelm:1,deckManual:0,manualJibAssist:1,ballastManual:0,
    rudderInput:0,trimInput:0,vangInput:.5,mainCarInput:0,jibCarInput:.53,jibTrimInput:.35,
    downhaulInput:.5,outhaulInput:.65,jibHalyardInput:.55,ballastCmdX:0,ballastCmdY:0};
  let policy,actor,loading,failed,shipped,fetching,next=0,captured=0;
  const model=Object.create(raw);
  model.set=(key,value)=>{
    if(Object.hasOwn(manual,key)){
      manual[key]=value;
      if(policy)return;
    }
    raw.set(key,value);
  };
  function restore(){
    if(!policy)return;
    for(const [key,value] of Object.entries(manual)){
      if(key==='jibHalyardInput'&&(!cat||!raw.has('jibHalyardTension')))continue;
      raw.set(key,value);
    }
    policy=null;field.hidden=true;
  }
  return {model,step(enabled){
    const selected=enabled&&(getAppliedPolicy(task.id)??shipped);
    if(enabled&&cat&&!selected&&!fetching&&!failed){
      fetching=task.pretrained().then(weights=>{shipped={weights};}).catch(error=>{failed=error;report(error);}).finally(()=>{fetching=null;});
    }
    if(!selected){restore();if(!enabled)failed=null;return;}
    if(selected===failed)return;
    if(!actor){
      loading??=openPolicyActor().then(result=>{actor=result;}).catch(error=>{failed=selected;report(error);}).finally(()=>{loading=null;});
      return;
    }
    try{
      if(policy!==selected){
        captured=signedWindAngle(raw);next=0;
        for(const [key,value] of Object.entries(overrides))raw.set(key,value);
        policy=selected;field.hidden=false;
      }
      if(raw.time+1e-8<next)return;
      next=raw.time+task.dt*task.ticksPerDecision;
      const target={pointOfSail:select.value==='hold'?captured:Number(select.value)*Math.PI/180};
      task.act(raw,target,actor.decide(policy.weights,task.observe(raw,target)));
    }catch(error){restore();failed=selected;report(error);}
  }};
}
