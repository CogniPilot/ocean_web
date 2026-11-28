import {diverTask,diverCheckpoint,diverTrainingView} from './diver-training.mjs';
import {requestTrainingAdapter} from './diver-training-update.mjs';
import {trainingChart} from './training-chart.mjs';
import {trainingPaths} from './model-training-paths.mjs';
import {trainingDevices,trainingDeviceFor,releaseTrainingDevice} from './training-physics.mjs';
import {trainingTasks,getTrainingTask,importTrainingCheckpoint,getAppliedPolicy,setAppliedPolicy,
  rememberTrainingPolicy,savedTrainingPolicies} from './live-training-tasks.mjs';

let openedLinkedTask=false;

export function modelTraining(signal,controlledSwimmer){
  const element=suffix=>document.getElementById('modelTraining'+suffix);
  const dialog=element(''),model=element('Task'),init=element('Init'),physics=element('Physics');
  const backend=element('Backend'),lanes=element('Lanes'),count=element('Count'),run=element('Run');
  const file=element('File'),load=element('Load'),save=element('Save'),apply=element('Apply'),restore=element('Restore');
  const saved=element('Saved');
  const status=element('Status'),step=element('Step'),progress=element('Progress'),metrics=element('Metrics');
  const plots=element('Plots'),chart=element('Chart'),focus=element('Focus');
  const paths=trainingPaths(element('Paths'),focus);
  const reward=trainingChart(element('Reward'),new Map([['score','#f9bd7c'],['candidate','#76ddcf']]));
  const speedError=trainingChart(element('Error'),new Map([['speed','#76ddcf']]));
  const refresh=element('Refresh'),local=element('Local');
  const choices=new Map(),controls=[model,init,physics,backend,lanes,load,refresh,saved];
  const on=(target,event,fn)=>target.addEventListener(event,fn,{signal});
  const option=(select,value)=>select.querySelector('[value="'+value+'"]');
  const taskFor=id=>id==='diver'?diverTask:getTrainingTask(id);
  const selected=()=>taskFor(model.value);
  const entries=[...trainingTasks,diverTask];
  model.replaceChildren(...entries.map(task=>new Option(task.label,task.id)));
  let swimmer,runBest,runEntry,runName,stopMessage,savedEntries=[];
  let devices={},devicesPending=true,gpuAvailable=false,gpuPending=true;
  const linkedTask=openedLinkedTask?null:new URLSearchParams(location.search).get('training');
  let preferredPhysics=linkedTask?'cuda':physics.value,preferredBackend=linkedTask?'gpu':backend.value;
  let worker,sessionId,stopTimer,stopping=false,probe=0,adapterProbe=0,backendSummary='';

  const viewport=element('Viewport'),viewStatus=element('ViewStatus');
  const overlay=document.getElementById('trainingOverlay'),wave=element('Wave');
  let fleet,viewSession,latestFrame;
  function closeView(){
    viewSession?.abort();viewSession=null;latestFrame=null;
    fleet?.dispose?.();fleet=null;viewport.hidden=true;element('ViewTools').hidden=true;viewStatus.textContent='';
  }
  async function showFleet(data){
    if(!dialog.open)return;
    const task=selected();
    latestFrame=data;
    if(fleet){fleet.frames(data);return;}
    if(viewSession)return;
    const session=new AbortController();viewSession=session;
    const updateStatus=message=>{if(!session.signal.aborted)viewStatus.textContent=message;};
    viewport.hidden=false;element('ViewTools').hidden=false;element('DiverTools').hidden=task!==diverTask;
    element('OverlayLabel').hidden=task!==diverTask&&!task.sailing;
    element('WaveLabel').hidden=!task.waveGrid;
    updateStatus('Loading '+task.label+' model…');
    const previous=element('Fleet'),canvas=previous.cloneNode(false);previous.replaceWith(canvas);
    try{
      let view;
      if(task===diverTask)view=await diverTrainingView(canvas,session.signal,updateStatus);
      else {
        const {trainingFleetView}=await import('./training-fleet-view.mjs');
        if(session.signal.aborted)return;
        view=await trainingFleetView(canvas,task.id);
      }
      if(session.signal.aborted){view?.dispose?.();return;}
      fleet=view;fleet.frames(latestFrame);fleet.focus(Number(focus.value));updateStatus('');
      fleet.overlay?.(overlay.checked);fleet.waveView?.(wave.checked);
    }catch(error){updateStatus('Live view unavailable · '+error.message);}
  }
  on(element('ZoomIn'),'click',()=>fleet?.magnify(.78));
  on(element('ZoomOut'),'click',()=>fleet?.magnify(1/.78));
  on(overlay,'change',()=>fleet?.overlay?.(overlay.checked));
  on(wave,'change',()=>fleet?.waveView?.(wave.checked));

  function limits(){
    const task=selected(),device=trainingDeviceFor(devices,task.plant);
    if(!worker){
      option(physics,'cuda').disabled=!device;
      physics.value=device?preferredPhysics:'cpu';
      option(backend,'gpu').disabled=!gpuAvailable;
      backend.value=gpuAvailable?preferredBackend:'cpu';
      run.disabled=stopping||(preferredPhysics==='cuda'&&devicesPending)||(preferredBackend==='gpu'&&gpuPending);
    }
    const maximum=physics.value==='cuda'?(device?.maxCount??Number(count.max)):256;
    count.max=maximum;
    for(const choice of lanes.options)if(Number(choice.value)>0)choice.disabled=Number(choice.value)>maximum;
    if(lanes.selectedOptions[0]?.disabled)lanes.value='auto';
    count.disabled=Boolean(worker)||lanes.value!=='manual';
    element('CountLabel').hidden=lanes.value!=='manual';
    const availability=[];
    if(devicesPending)availability.push('Checking CUDA…');
    else if(!devices.local)availability.push('CUDA physics uses the training service on your computer');
    else if(!device)availability.push('CUDA unavailable for '+task.plant+(devices.errors?.[task.plant]?' · '+devices.errors[task.plant]:''));
    else{
      const capacity=device.busy?'GPU in use · last measured capacity '+device.maxCount:'up to '+device.maxCount;
      availability.push('CUDA · '+(device.device??task.plant)+' · '+capacity+' instances');
    }
    if(gpuPending)availability.push('Checking WebGPU…');
    else availability.push(gpuAvailable?'WebGPU policy updates available':'WebGPU unavailable');
    element('LocalLinks').hidden=devicesPending||Boolean(devices.local);
    local.href='http://127.0.0.1:18588/?training='+encodeURIComponent(task.id);
    element('Availability').textContent=availability.join(' · ');
  }
  async function checkPlant(){
    const ticket=++probe;
    devicesPending=true;limits();
    const result=await trainingDevices(selected().plant);
    if(ticket!==probe||!dialog.open||signal.aborted)return;
    devices=result;devicesPending=false;limits();
  }
  async function checkAdapter(){
    const ticket=++adapterProbe;
    gpuPending=true;limits();
    const adapter=await requestTrainingAdapter();
    if(ticket!==adapterProbe||!dialog.open||signal.aborted)return;
    gpuAvailable=Boolean(adapter);gpuPending=false;limits();
  }
  const selectedPolicy=()=>savedEntries.find(entry=>entry.id===saved.value);
  function showCheckpoint(){
    const diver=selected()===diverTask,applied=getAppliedPolicy(model.value);
    const entries=savedTrainingPolicies(model.value);
    if(applied&&!entries.some(entry=>JSON.stringify(entry.checkpoint.weights)===JSON.stringify(applied.weights)))
      entries.push(rememberTrainingPolicy(model.value,applied,'Previously applied policy'));
    savedEntries=entries;
    saved.replaceChildren(...(entries.length?entries.map(entry=>new Option(entry.name+' · round '+entry.checkpoint.bestRound,entry.id)):
      [new Option('No saved policies','')]));
    saved.value=entries.some(entry=>entry.id===choices.get(model.value))?choices.get(model.value):entries[0]?.id??'';
    const checkpoint=selectedPolicy()?.checkpoint;
    saved.disabled=Boolean(worker)||!entries.length;
    option(init,'current').disabled=!checkpoint&&!(diver&&swimmer?.weights());
    option(init,'current').textContent=checkpoint?'Selected saved policy':diver&&swimmer?.weights()?'My swimmer':'Saved policy';
    save.disabled=!checkpoint;apply.hidden=diver&&!swimmer;apply.disabled=!checkpoint;
    const appliedStatus=element('Applied');
    appliedStatus.hidden=!applied;
    if(applied)appliedStatus.textContent='Simulation policy · round '+applied.bestRound+
      (selected().applicationHint?' · '+selected().applicationHint:'');
    restore.hidden=!applied;
  }
  function clearPlots(){
    plots.hidden=chart.hidden=progress.hidden=true;
    element('ErrorChart').hidden=true;closeView();step.textContent=metrics.textContent='';paths.clear();reward.clear();speedError.clear();
  }
  function selectTask(){
    const task=selected();
    swimmer=task===diverTask?controlledSwimmer?.():null;clearPlots();showCheckpoint();
    option(init,'pretrained').disabled=!task.pretrained;
    init.value=selectedPolicy()||swimmer?.weights()?'current':task.pretrained?'pretrained':'scratch';
    element('Objective').textContent=task.summary??'';
    status.textContent='Ready';void checkPlant();
  }
  async function finish(message){
    clearTimeout(stopTimer);worker?.terminate();worker=null;
    const id=sessionId;sessionId=null;stopping=true;run.disabled=true;
    await releaseTrainingDevice(id);stopping=false;
    for(const control of controls)control.disabled=false;
    run.disabled=false;run.textContent='Start training';status.textContent=message;
    showCheckpoint();if(selectedPolicy())init.value='current';
    limits();
  }
  function stop(){
    if(!worker||stopping)return;
    stopping=true;run.disabled=true;status.textContent='Stopping training…';
    const applied=selected()===diverTask&&runBest&&swimmer?.apply(runBest.weights);
    if(applied)setAppliedPolicy('diver',runBest);
    stopMessage=applied?'Applied best policy to your swimmer · round '+runBest.bestRound:'Training stopped';
    worker.postMessage({type:'stop'});
    stopTimer=setTimeout(()=>finish(stopMessage),3000);
  }
  function start(){
    const task=selected();
    const diver=task===diverTask;
    const url=diver?new URL('./diver-training-worker.mjs',import.meta.url):new URL('./live-training-worker.mjs',import.meta.url);
    const next=new Worker(url,{type:'module'});
    worker=next;clearPlots();backendSummary='';
    runBest=null;runEntry=null;runName='Training '+new Date().toLocaleString();
    for(const control of controls)control.disabled=true;
    count.disabled=true;run.textContent='Stop training';status.textContent='Loading '+task.label+'…';
    next.onerror=event=>{if(worker===next)finish(event.message||'Training worker failed');};
    next.onmessage=({data})=>{
      if(worker!==next)return;
      if(data.type==='deviceSession'){sessionId=data.id;return;}
      if(data.type==='done'){finish(stopping?stopMessage:'Training complete');return;}
      if(data.type==='error'){finish(data.message);return;}
      if(stopping)return;
      switch(data.type){
        case 'stage':status.textContent=data.message;break;
        case 'sizing':
          status.textContent='Measuring '+data.count+' instances'+(data.best?
            ' · Best '+Math.round(data.best.rate)+' steps/s at '+data.best.count:'');
          break;
        case 'ready':{
          const optimizer=backend.value==='gpu'?'WebGPU ('+data.adapter+')':'CPU';
          backendSummary=data.physics+' physics · '+optimizer+' policy updates · '+data.lanes+' instance'+(data.lanes===1?'':'s');
          status.textContent=backendSummary;
          break;
        }
        case 'frames':{
          if(backendSummary&&status.textContent!==backendSummary)status.textContent=backendSummary;
          plots.hidden=false;paths.add(data,diver?1:0);void showFleet(data);
          step.textContent='Round '+data.round+' · '+data.phase+' · step '+data.tick+' / '+data.total;
          if(data.realTime>0)step.textContent+=' · '+data.realTime.toFixed(data.realTime<.1?3:2)+'× realtime per instance';
          if(data.stepsPerSecond>0)step.textContent+=' · '+data.stepsPerSecond.toFixed(1)+' aggregate steps/s';
          if(data.kernelMs>0)step.textContent+=' · CUDA kernel '+data.kernelMs.toFixed(2)+' ms';
          if(data.total>0){progress.hidden=false;progress.max=data.total;progress.value=data.tick;}
          break;
        }
        case 'progress':{
          const candidate=data.candidateScore??data.score;
          status.textContent=backendSummary;
          const rate=Number.isFinite(data.stepsPerSecond)?' · '+Math.round(data.stepsPerSecond)+' aggregate steps/s':'';
          metrics.textContent='Round '+data.round+' · reward '+candidate.toFixed(3)+' · best '+data.score.toFixed(3)+' (round '+data.bestRound+') · '+data.steps+' physics steps'+rate;
          plots.hidden=chart.hidden=false;reward.add({round:data.round,candidate,score:data.score});
          if(diver){
            element('ErrorChart').hidden=false;speedError.add({round:data.round,speed:data.metrics?.[1]});
          }
          const checkpoint=diver?diverCheckpoint(data):data.checkpoint;
          if(checkpoint&&data.round>0&&(!runBest||checkpoint.bestRound!==runBest.bestRound)){
            runBest=checkpoint;runEntry=rememberTrainingPolicy(task.id,checkpoint,runName,runEntry?.id??null);
            choices.set(task.id,runEntry.id);showCheckpoint();
          }
          break;
        }
      }
    };
    const instances=lanes.value==='manual'?count.valueAsNumber:lanes.value==='auto'?'auto':Number(lanes.value);
    const checkpoint=init.value==='current'?selectedPolicy()?.checkpoint:undefined;
    next.postMessage({type:'start',task:task.id,physics:physics.value,backend:backend.value,
      lanes:instances,initialization:init.value,checkpoint,
      weights:diver&&init.value==='current'?(checkpoint?.weights??swimmer?.weights()):undefined});
  }
  on(element('Form'),'submit',event=>{
    event.preventDefault();
    if(stopping)return;
    if(worker){stop();return;}
    try{start();}catch(error){finish(error.message);}
  });
  on(model,'change',selectTask);
  on(physics,'change',()=>{preferredPhysics=physics.value;limits();});
  on(backend,'change',()=>{preferredBackend=backend.value;limits();});
  on(lanes,'change',limits);
  on(refresh,'click',()=>{void checkPlant();void checkAdapter();});
  on(focus,'change',()=>{paths.draw();fleet?.focus(Number(focus.value));});
  on(load,'click',()=>file.click());
  on(saved,'change',()=>{choices.set(model.value,saved.value);showCheckpoint();if(selectedPolicy())init.value='current';});
  on(file,'change',async()=>{
    const selectedTask=model.value,sources=Array.from(file.files),errors=[];
    file.value='';let count=0;
    for(const source of sources){
      try{
        const checkpoint=importTrainingCheckpoint(JSON.parse(await source.text()),selectedTask);
        if(signal.aborted||worker||!dialog.open)return;
        const entry=rememberTrainingPolicy(checkpoint.task,checkpoint,source.name.replace(/\.json$/i,''));
        choices.set(checkpoint.task,entry.id);model.value=checkpoint.task;count++;
      }catch(error){errors.push(source.name+' · '+error.message);}
    }
    if(count)selectTask();
    status.textContent=[count?count+' '+(count===1?'policy':'policies')+' imported':'',...errors].filter(Boolean).join(' · ');
  });
  on(save,'click',()=>{
    const {checkpoint}=selectedPolicy();
    const url=URL.createObjectURL(new Blob([JSON.stringify(checkpoint,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=model.value+'-round-'+checkpoint.bestRound+'.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  });
  on(apply,'click',()=>{
    try{
      const checkpoint=selectedPolicy()?.checkpoint;
      if(selected()===diverTask){
        if(!swimmer?.apply(checkpoint.weights))throw Error('This swimmer is no longer under your control.');
      }
      setAppliedPolicy(model.value,checkpoint);
      showCheckpoint();
      status.textContent='Simulation policy set · '+selected().label+' · round '+checkpoint.bestRound;
    }catch(error){status.textContent=error.message;}
  });
  on(restore,'click',()=>{
    try{
      if(selected()===diverTask&&swimmer)swimmer.apply(null);
      setAppliedPolicy(model.value,null);showCheckpoint();status.textContent='Default simulation policy restored';
    }
    catch(error){status.textContent=error.message;}
  });
  const observer=new ResizeObserver(()=>{paths.draw();reward.draw();speedError.draw();});observer.observe(plots);
  on(element('Close'),'click',()=>dialog.close());
  for(const name of ['keydown','keyup'])on(dialog,name,event=>event.stopPropagation());
  on(dialog,'close',()=>{if(!dialog.open){probe++;stop();closeView();}});
  on(window,'pagehide',()=>{if(worker)finish('Training stopped');});
  signal.addEventListener('abort',()=>{
    probe++;observer.disconnect();closeView();if(worker)finish('Training stopped');if(dialog.open)dialog.close();
  },{once:true});

  function open(vehicle){
    if(dialog.open)return;
    dialog.showModal();
    if(worker||stopping)return;
    const suggested=({hobie:'hobie16',sloop:'sailboat',sub:'submarine'})[vehicle]??vehicle;
    if(entries.some(task=>task.id===suggested))model.value=suggested;
    gpuPending=true;selectTask();void checkAdapter();
  }
  if(entries.some(task=>task.id===linkedTask))queueMicrotask(()=>{
    if(signal.aborted||openedLinkedTask)return;
    openedLinkedTask=true;open(linkedTask);
  });
  return {dialog,open};
}
