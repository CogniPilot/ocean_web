import {gullTask,mantaTask,sharkTask,whaleTask} from './wildlife-training-tasks.mjs';
import {basinTask,droneTask,motorboatTask,submarineTask} from './vehicle-training-tasks.mjs';
import {sailTrainingTasks} from './sail-training-tasks.mjs';

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
const applied=new Map();
globalThis.addEventListener?.('storage',event=>{
  if(!event.key)applied.clear();
  else if(event.key.startsWith(prefix))applied.delete(event.key.slice(prefix.length));
});
export function getAppliedPolicy(id){
  if(!applied.has(id)){
    let checkpoint=null;
    try{
      const value=globalThis.localStorage?.getItem(prefix+id);
      if(value)checkpoint=validateTrainingCheckpoint(getTrainingTask(id),JSON.parse(value));
    }catch{}
    applied.set(id,checkpoint);
  }
  return applied.get(id);
}
export function setAppliedPolicy(id,checkpoint){
  const task=getTrainingTask(id);
  if(checkpoint){
    validateTrainingCheckpoint(task,checkpoint);localStorage.setItem(prefix+id,JSON.stringify(checkpoint));
  }else localStorage.removeItem(prefix+id);
  applied.set(id,checkpoint??null);
}
