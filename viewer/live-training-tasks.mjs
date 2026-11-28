import {gullTask,mantaTask,sharkTask,whaleTask} from './wildlife-training-tasks.mjs';
import {basinTask,droneTask,motorboatTask,submarineTask} from './vehicle-training-tasks.mjs';
import {sailTrainingTasks} from './sail-training-tasks.mjs';
import {diverCheckpoint} from './diver-training.mjs';

export const trainingTasks=[sharkTask,gullTask,mantaTask,whaleTask,...sailTrainingTasks,submarineTask,droneTask,motorboatTask,basinTask];
export function getTrainingTask(id){
  const task=trainingTasks.find(task=>task.id===id);
  if(!task)throw Error('Unknown training task '+id);
  return task;
}
export function validateWeights(task,weights){
  const rows=task.actionNames.length,cols=task.featureNames.length;
  if(!Array.isArray(weights)||weights.length!==rows||!Array.from(weights).every(row=>
    Array.isArray(row)&&row.length===cols&&Array.from(row).every(Number.isFinite))){
    throw Error(task.label+' requires a finite '+rows+' × '+cols+' policy matrix.');
  }
  return weights;
}
export function validateTrainingCheckpoint(task,checkpoint){
  if(checkpoint?.version!==1||checkpoint.task!==task.id||!Number.isFinite(checkpoint.score)||
     !Number.isSafeInteger(checkpoint.bestRound)||checkpoint.bestRound<0)throw Error('Invalid '+task.label+' checkpoint.');
  validateWeights(task,checkpoint.weights);
  return checkpoint;
}

const prefix='ocean.live-training.applied.v1.';
const savedPrefix='ocean.live-training.saved.v1.';
const applied=new Map();
const sessionPolicies=new Map();

function parseCheckpoint(id,raw){
  const round=raw?.bestRound??raw?.round;
  const score=raw?.score??raw?.validationReward??raw?.validation?.trained??raw?.validation?.score;
  const weights=id==='shark'&&raw?.weights?.every?.(Number.isFinite)?raw.weights.map(value=>[value]):raw?.weights;
  const checkpoint={task:raw?.task??id,version:raw?.version??1,bestRound:round,score,weights};
  if(id==='diver')return diverCheckpoint(checkpoint);
  return validateTrainingCheckpoint(getTrainingTask(id),checkpoint);
}
export function importTrainingCheckpoint(raw,selected){
  const id=raw?.task??(Array.isArray(raw?.weights)&&raw.weights.length===8&&raw.weights[0]?.length===15?'diver':selected);
  return parseCheckpoint(id,raw);
}
export function savedTrainingPolicies(task){
  const keyPrefix=savedPrefix+task+'.',entries=new Map();
  try{
    for(let i=0;i<globalThis.localStorage.length;i++){
      const key=globalThis.localStorage.key(i);
      if(!key?.startsWith(keyPrefix))continue;
      try{
        const value=JSON.parse(globalThis.localStorage.getItem(key));
        const id=key.slice(keyPrefix.length);
        if(typeof value.name!=='string'||!Number.isFinite(value.updated))continue;
        entries.set(id,{id,name:value.name,updated:value.updated,checkpoint:parseCheckpoint(task,value.checkpoint)});
      }catch{}
    }
  }catch{}
  for(const [key,value] of sessionPolicies)if(key.startsWith(keyPrefix))entries.set(value.id,value);
  return [...entries.values()].sort((a,b)=>b.updated-a.updated||a.name.localeCompare(b.name));
}
export function rememberTrainingPolicy(task,raw,name,id){
  const checkpoint=parseCheckpoint(task,raw),weights=JSON.stringify(checkpoint.weights);
  if(id===undefined){
    const existing=savedTrainingPolicies(task).find(entry=>JSON.stringify(entry.checkpoint.weights)===weights);
    if(existing)return existing;
  }
  id??=Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>v.toString(16).padStart(2,'0')).join('');
  const entry={id,name:String(name).trim().slice(0,80)||'Policy',checkpoint,updated:Date.now()};
  const key=savedPrefix+task+'.'+id;
  try{globalThis.localStorage.setItem(key,JSON.stringify(entry));sessionPolicies.delete(key);}
  catch{sessionPolicies.set(key,entry);}
  return entry;
}
globalThis.addEventListener?.('storage',event=>{
  if(!event.key)applied.clear();
  else if(event.key.startsWith(prefix))applied.delete(event.key.slice(prefix.length));
});
export function getAppliedPolicy(id){
  if(!applied.has(id)){
    let checkpoint=null;
    try{
      const value=globalThis.localStorage?.getItem(prefix+id);
      if(value)checkpoint=parseCheckpoint(id,JSON.parse(value));
    }catch{}
    applied.set(id,checkpoint);
  }
  return applied.get(id);
}
export function setAppliedPolicy(id,checkpoint){
  if(checkpoint)checkpoint=parseCheckpoint(id,checkpoint);
  try{
    if(checkpoint)globalThis.localStorage.setItem(prefix+id,JSON.stringify(checkpoint));
    else globalThis.localStorage.removeItem(prefix+id);
  }catch{}
  applied.set(id,checkpoint??null);
}
