// Adapt the diver's full skeletal frames to the common model training view.
import {trainingReplay} from './training-replay.mjs';

export const diverTask={id:'diver',label:'Scuba diver',plant:'ScubaDiverOpenWater',pretrained:true,
  summary:'Train the swimmer to follow translation and attitude commands while maintaining trim.'};

export function diverCheckpoint(record){
  const bestRound=record?.bestRound??record?.round;
  if((record?.task!=null&&record.task!=='diver')||(record?.version!=null&&record.version!==1)||
     !Number.isSafeInteger(bestRound)||bestRound<0||!Number.isFinite(record?.score)||
     !Array.isArray(record.weights)||record.weights.length!==8||!Array.from(record.weights).every(row=>
       Array.isArray(row)&&row.length===15&&Array.from(row).every(Number.isFinite)))throw Error('Invalid scuba diver checkpoint.');
  return {task:'diver',version:1,score:record.score,bestRound,weights:record.weights};
}

export async function diverTrainingView(canvas,signal,onStatus){
  const {trainingView}=await import('./diver-training-view.mjs');
  if(signal.aborted)return;
  const view=await trainingView(globalThis.THREE,canvas,signal,onStatus);
  if(!view||signal.aborted)return;
  const playback=document.getElementById('trainingPlayback');
  const recorded=playback.querySelector('[value=replay]'),replay=trainingReplay();
  let raf,latest;
  function play(now){
    const rows=replay.sample(now);if(rows)view.frames(rows);
    raf=requestAnimationFrame(play);
  }
  playback.value='live';recorded.disabled=true;
  playback.addEventListener('change',()=>{
    cancelAnimationFrame(raf);replay.stop();
    if(playback.value==='replay')raf=requestAnimationFrame(play);
    else if(latest)view.frames(latest);
  },{signal});
  signal.addEventListener('abort',()=>{cancelAnimationFrame(raf);replay.clear();},{once:true});
  return {frames(data){
    latest=data.frames;
    if(data.phase!=='sizing'){replay.record(latest,data.batchSeconds);recorded.disabled=!replay.available();}
    if(playback.value==='live')view.frames(latest);
  },focus:view.focus,magnify:view.magnify,overlay:view.overlay};
}
