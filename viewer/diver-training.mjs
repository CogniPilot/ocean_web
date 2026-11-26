import {trainingDevices,releaseTrainingDevice} from './training-physics.mjs';
import {trainingReplay} from './training-replay.mjs';
import {trainingChart} from './training-chart.mjs';

export function diverTraining(T,signal,releaseControls,swimmer){
  const el=id=>document.getElementById(id);
  const dialog=el('diverTraining'),backend=el('trainingBackend'),run=el('trainingRun'),lanes=el('trainingLanes');
  const physics=el('trainingPhysics'),manual=el('trainingCount');
  let deviceMaximum=0;
  function countLimit(){
    const max=physics.value==='cuda'?deviceMaximum:256;manual.max=max;
    for(const option of lanes.options)if(Number(option.value)>0)option.disabled=Number(option.value)>max;
    if(lanes.selectedOptions[0]?.disabled)lanes.value='auto';
  }
  physics.addEventListener('change',countLimit,{signal});
  countLimit();
  const init=el('trainingStart'),focus=el('trainingFocus'),overlay=el('trainingOverlay');
  const status=el('trainingStatus'),metrics=el('trainingMetrics'),save=el('trainingSave'),charts=el('trainingCharts');
  const reward=trainingChart(el('trainingReward'),new Map([['score','#f9bd7c'],['candidate','#76ddcf']]));
  const error=trainingChart(el('trainingError'),new Map([['speed','#76ddcf']]));
  const playback=el('trainingPlayback'),recorded=playback.querySelector('[value=replay]'),replay=trainingReplay();
  let replayFrame;
  function playRecorded(now){
    const rows=replay.sample(now);
    if(rows)view?.frames(rows);
    replayFrame=requestAnimationFrame(playRecorded);
  }
  function live(){
    cancelAnimationFrame(replayFrame);replay.stop();playback.value='live';
    if(lastRows)view?.frames(lastRows);
  }
  playback.addEventListener('change',()=>{
    if(playback.value==='live'){live();return;}
    replay.stop();replayFrame=requestAnimationFrame(playRecorded);
  },{signal});
  const observer=new ResizeObserver(()=>{reward.draw();error.draw();});observer.observe(charts);
  let session,worker,deviceSession,view,lastRows,checkpoint,completed=0;
  function stop(apply=false){
    if(!worker)return;
    worker.terminate();worker=null;releaseTrainingDevice(deviceSession);deviceSession=null;run.textContent='Start training';
    for(const select of [backend,physics,lanes,manual,init])select.disabled=false;
    if(!apply)return;
    if(!checkpoint||!completed){status.textContent='Stopped before the first update. Your swimmer kept its policy.';return;}
    const applied=swimmer.apply(checkpoint.weights);
    status.textContent=applied?'Applied the best validated weights to your swimmer · round '+checkpoint.round:
      'Swimmer is no longer under your control. Save weights to keep this checkpoint.';
    if(applied){init.querySelector('[value=current]').disabled=false;init.value='current';}
  }
  function close(){
    stop(true);lastRows=null;live();replay.clear();recorded.disabled=true;session?.abort();session=null;view=null;
  }
  function fail(message){stop();el('trainingSceneLabel').textContent='Training stopped';status.textContent=message;}
  function focusOptions(count=0){
    focus.replaceChildren(new Option('All swimmers','-1'));
    for(let i=0;i<count;i++)focus.add(new Option('Swimmer '+(i+1),String(i)));
    focus.value='-1';view?.focus(-1);
  }
  function start(){
    if(worker){stop(true);return;}
    if(lanes.value==='manual'&&!manual.reportValidity())return;
    checkpoint=null;completed=0;save.disabled=true;metrics.textContent='';lastRows=null;
    live();replay.clear();recorded.disabled=true;charts.hidden=true;reward.clear();error.clear();focusOptions();view?.frames([]);
    const selected=backend.value;
    let runStatus='';
    const next=new Worker(new URL('./diver-training-worker.mjs',import.meta.url),{type:'module'});
    worker=next;for(const input of [backend,physics,lanes,manual,init])input.disabled=true;
    run.textContent='Stop training';status.textContent='Loading diver models…';
    next.onerror=e=>{if(worker===next)fail(e.message||'Training worker failed to start.');};
    next.onmessage=({data})=>{
      if(worker!==next)return;
      if(data.type==='error'){fail(data.message??'Training failed.');return;}
      if(data.type==='stage'){status.textContent=data.message;return;}
      if(data.type==='deviceSession'){deviceSession=data.id;return;}
      if(data.type==='sizing'){status.textContent='Measuring capacity · '+data.count+' instances';return;}
      if(data.type==='ready'){
        focusOptions(data.lanes);
        runStatus=status.textContent=selected.toUpperCase()+' policy updates · '+data.physics+' diver physics · '+(lanes.value==='auto'?'Auto count ':'Count ')+data.lanes;
      }else if(data.type==='frames'){
        lastRows=data.frames;
        if(data.phase!=='sizing'){
          replay.record(lastRows,data.batchSeconds);recorded.disabled=!replay.available();
        }
        if(playback.value==='live')view?.frames(lastRows);
        if(runStatus)status.textContent=runStatus;
        const phase=data.phase==='sizing'?'Measuring capacity':data.round===0?'Initial validation':data.phase==='exploration'?'Exploring · round '+data.round:'Validating · round '+data.round;
        const eta=data.remainingSeconds;
        const remaining=eta>=60?Math.ceil(eta/60)+' min':Math.ceil(eta)+' s';
        const progress=data.phase==='sizing'?'':(' · step '+data.tick+'/'+data.total+(eta>0?' · ~'+remaining+' left':''));
        const rate=data.realTime>0?' · '+data.realTime.toFixed(data.realTime<.1?3:2)+'× sim':'';
        const fps=Number.isFinite(view?.fps)?' · '+Math.round(view.fps)+' view FPS':'';
        el('trainingSceneLabel').textContent=phase+' · '+data.lanes+' instances'+progress+rate+fps;
      }else if(data.type==='progress'){
        completed=data.round;
        const validation=data.candidateScore??data.score;
        metrics.textContent='Round '+data.round+' · Validation reward '+validation.toFixed(3)+' · Best '+data.score.toFixed(3)
          +(Number.isFinite(data.stepsPerSecond)?' · '+Math.round(data.stepsPerSecond)+' steps/s':'');
        charts.hidden=false;reward.add({round:data.round,score:data.score,candidate:validation});
        error.add({round:data.round,speed:data.metrics?.[1]});
        if(data.weights){checkpoint={weights:data.weights,round:data.bestRound??0,score:data.score};save.disabled=false;}
      }
    };
    next.postMessage({type:'start',backend:selected,physics:physics.value,lanes:lanes.value==='manual'?manual.valueAsNumber:lanes.value==='auto'?'auto':Number(lanes.value),initialization:init.value,
      weights:init.value==='current'?swimmer.weights():undefined});
  }
  el('openDiverTraining').addEventListener('click',async()=>{
    if(dialog.open)return;
    releaseControls();dialog.showModal();session=new AbortController();const active=session;
    const current=Boolean(swimmer.weights());init.querySelector('[value=current]').disabled=!current;
    if(current)init.value='current';else if(init.value==='current')init.value='pretrained';
    if(!navigator.gpu)backend.value='cpu';
    trainingDevices().then(devices=>{
      if(active.signal.aborted||worker)return;
      const option=physics.querySelector('[value=cuda]');option.disabled=!devices.plants?.includes('ScubaDiver')||devices.maxCount<1;
      deviceMaximum=devices.maxCount??0;physics.value=option.disabled?'cpu':'cuda';countLimit();
      if(devices.error)status.textContent='CUDA unavailable · '+devices.error;
    });
    status.textContent='Ready';el('trainingSceneLabel').textContent='Open ocean';el('trainingViewStatus').textContent='Loading diver model…';const canvas=el('trainingGhosts');
    const surface=canvas.cloneNode(false);canvas.replaceWith(surface);focusOptions();
    try{
      const {trainingView}=await import('./diver-training-view.mjs');
      if(active.signal.aborted)return;
      const prepared=await trainingView(T,surface,active.signal,message=>{if(!active.signal.aborted)el('trainingViewStatus').textContent=message;});
      if(!active.signal.aborted)el('trainingViewStatus').textContent='';
      if(active.signal.aborted)return;
      view=prepared;view.focus(Number(focus.value));view.overlay(overlay.checked);if(lastRows)view.frames(lastRows);
    }catch(e){if(!active.signal.aborted)status.textContent='Swimmer view unavailable · '+e.message;}
  },{signal});
  lanes.addEventListener('change',()=>{manual.hidden=lanes.value!=='manual';},{signal});
  focus.addEventListener('change',()=>view?.focus(Number(focus.value)),{signal});
  overlay.addEventListener('change',()=>view?.overlay(overlay.checked),{signal});
  el('trainingZoomIn').addEventListener('click',()=>view?.magnify(.67),{signal});
  el('trainingZoomOut').addEventListener('click',()=>view?.magnify(1.5),{signal});
  run.addEventListener('click',()=>{try{start();}catch(e){fail(e.message);}},{signal});
  save.addEventListener('click',()=>{
    if(!checkpoint)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(checkpoint,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='diver-swim-round-'+checkpoint.round+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  },{signal});
  el('trainingClose').addEventListener('click',()=>dialog.close(),{signal});
  for(const key of ['keydown','keyup'])dialog.addEventListener(key,e=>e.stopPropagation(),{signal});
  dialog.addEventListener('close',close,{signal});
  signal.addEventListener('abort',()=>{observer.disconnect();stop();if(dialog.open)dialog.close();close();},{once:true});
}
