import {trainingChart} from './training-chart.mjs';
import {trainingPaths} from './model-training-paths.mjs';
import {trainingDevices,trainingDeviceFor,releaseTrainingDevice} from './training-physics.mjs';
import {trainingTasks,getTrainingTask,validateTrainingCheckpoint,getAppliedPolicy,setAppliedPolicy} from './live-training-tasks.mjs';

export function modelTraining(signal,openDiver){
  const element=suffix=>document.getElementById('modelTraining'+suffix);
  const dialog=element(''),model=element('Task'),init=element('Init'),physics=element('Physics');
  const backend=element('Backend'),lanes=element('Lanes'),count=element('Count'),run=element('Run');
  const file=element('File'),load=element('Load'),save=element('Save'),apply=element('Apply'),restore=element('Restore');
  const status=element('Status'),step=element('Step'),progress=element('Progress'),metrics=element('Metrics');
  const plots=element('Plots'),chart=element('Chart'),focus=element('Focus');
  const paths=trainingPaths(element('Paths'),focus);
  const reward=trainingChart(element('Reward'),new Map([['score','#f9bd7c'],['candidate','#76ddcf']]));
  const checkpoints=new Map(),controls=[model,init,physics,backend,lanes,load];
  const on=(target,event,fn)=>target.addEventListener(event,fn,{signal});
  const option=(select,value)=>select.querySelector('[value="'+value+'"]');
  const selected=()=>getTrainingTask(model.value);
  const diverModel=document.getElementById('diverTrainingTask');
  const entries=[...trainingTasks,{id:'diver',label:'Scuba diver'}];
  for(const menu of [model,diverModel])menu.replaceChildren(...entries.map(task=>new Option(task.label,task.id)));
  diverModel.value='diver';
  let devices={},devicesPending=true,gpuAvailable=false,gpuPending=true;
  let worker,sessionId,stopTimer,stopping=false,probe=0,backendSummary='';

  function limits(){
    const task=selected(),device=trainingDeviceFor(devices,task.plant);
    option(physics,'cuda').disabled=!device;
    if(!device)physics.value='cpu';
    option(backend,'gpu').disabled=!gpuAvailable;
    if(!gpuAvailable)backend.value='cpu';
    const maximum=physics.value==='cuda'?device.maxCount:256;
    count.max=maximum;
    for(const choice of lanes.options)if(Number(choice.value)>0)choice.disabled=Number(choice.value)>maximum;
    if(lanes.selectedOptions[0]?.disabled)lanes.value='auto';
    count.disabled=Boolean(worker)||lanes.value!=='manual';
    element('CountLabel').hidden=lanes.value!=='manual';
    const availability=[];
    if(devicesPending)availability.push('Checking CUDA…');
    else if(!device)availability.push('CUDA unavailable for '+task.plant+(devices.errors?.[task.plant]?' · '+devices.errors[task.plant]:''));
    else{
      const capacity=device.busy?'GPU in use · last measured capacity '+device.maxCount:'up to '+device.maxCount;
      availability.push('CUDA · '+(device.device??task.plant)+' · '+capacity+' instances');
    }
    if(gpuPending)availability.push('Checking WebGPU…');
    else if(!gpuAvailable)availability.push('WebGPU unavailable');
    element('Availability').textContent=availability.join(' · ');
  }
  function showCheckpoint(){
    const applied=getAppliedPolicy(model.value);
    if(!checkpoints.has(model.value)&&applied)checkpoints.set(model.value,applied);
    const checkpoint=checkpoints.get(model.value);
    option(init,'current').disabled=!checkpoint;
    option(init,'current').textContent=checkpoint?'Saved policy · round '+checkpoint.bestRound:'Saved policy';
    save.disabled=apply.disabled=!checkpoint;
    const appliedStatus=element('Applied');
    appliedStatus.hidden=!applied;
    if(applied)appliedStatus.textContent='Simulation policy · round '+applied.bestRound+
      (selected().applicationHint?' · '+selected().applicationHint:'');
    restore.hidden=!applied;
  }
  function clearPlots(){
    plots.hidden=chart.hidden=progress.hidden=true;
    step.textContent=metrics.textContent='';paths.clear();reward.clear();
  }
  function selectTask(){
    const task=selected();
    clearPlots();showCheckpoint();
    option(init,'pretrained').disabled=!task.pretrained;
    init.value=checkpoints.has(task.id)?'current':task.pretrained?'pretrained':'scratch';
    element('Objective').textContent=task.summary??'';
    status.textContent='Ready';limits();
  }
  function finish(message){
    clearTimeout(stopTimer);worker?.terminate();worker=null;
    releaseTrainingDevice(sessionId);sessionId=null;stopping=false;
    for(const control of controls)control.disabled=false;
    run.disabled=false;run.textContent='Start training';status.textContent=message;
    showCheckpoint();if(checkpoints.has(model.value))init.value='current';
    limits();
  }
  function stop(){
    if(!worker||stopping)return;
    stopping=true;run.disabled=true;status.textContent='Stopping training…';
    worker.postMessage({type:'stop'});
    stopTimer=setTimeout(()=>finish('Training stopped'),3000);
  }
  function start(){
    const task=selected();
    const next=new Worker(new URL('./live-training-worker.mjs',import.meta.url),{type:'module'});
    worker=next;clearPlots();backendSummary='';
    for(const control of controls)control.disabled=true;
    count.disabled=true;run.textContent='Stop training';status.textContent='Loading '+task.label+'…';
    next.onerror=event=>{if(worker===next)finish(event.message||'Training worker failed');};
    next.onmessage=({data})=>{
      if(worker!==next)return;
      if(data.type==='deviceSession'){sessionId=data.id;return;}
      if(data.type==='done'){finish(stopping?'Training stopped':'Training complete');return;}
      if(data.type==='error'){finish(data.message);return;}
      if(stopping)return;
      switch(data.type){
        case 'stage':status.textContent=data.message;break;
        case 'sizing':status.textContent='Measuring capacity · '+data.count+' instances';break;
        case 'ready':{
          const optimizer=backend.value==='gpu'?'WebGPU ('+data.adapter+')':'CPU';
          backendSummary=data.physics+' physics · '+optimizer+' policy updates · '+data.lanes+' instance'+(data.lanes===1?'':'s');
          status.textContent=backendSummary;
          break;
        }
        case 'frames':
          if(backendSummary&&status.textContent!==backendSummary)status.textContent=backendSummary;
          plots.hidden=false;paths.add(data);
          step.textContent='Round '+data.round+' · '+data.phase+' · step '+data.tick+' / '+data.total;
          if(data.total>0){progress.hidden=false;progress.max=data.total;progress.value=data.tick;}
          break;
        case 'progress':{
          const candidate=data.candidateScore??data.score;
          status.textContent=backendSummary;
          const rate=Number.isFinite(data.stepsPerSecond)?' · '+Math.round(data.stepsPerSecond)+' steps/s':'';
          metrics.textContent='Round '+data.round+' · reward '+candidate.toFixed(3)+' · best '+data.score.toFixed(3)+' (round '+data.bestRound+') · '+data.steps+' physics steps'+rate;
          plots.hidden=chart.hidden=false;reward.add({round:data.round,candidate,score:data.score});
          if(data.checkpoint){checkpoints.set(task.id,data.checkpoint);showCheckpoint();}
          break;
        }
      }
    };
    const instances=lanes.value==='manual'?count.valueAsNumber:lanes.value==='auto'?'auto':Number(lanes.value);
    next.postMessage({type:'start',task:task.id,physics:physics.value,backend:backend.value,
      lanes:instances,initialization:init.value,checkpoint:init.value==='current'?checkpoints.get(task.id):undefined});
  }
  on(element('Form'),'submit',event=>{
    event.preventDefault();
    if(worker){stop();return;}
    try{start();}catch(error){finish(error.message);}
  });
  on(model,'change',()=>{
    if(model.value==='diver'){
      probe++;
      dialog.close();openDiver();
    }else selectTask();
  });
  on(diverModel,'change',()=>{
    const task=diverModel.value;
    diverModel.value='diver';document.getElementById('diverTraining').close();
    open(task);
  });
  on(physics,'change',limits);on(lanes,'change',limits);
  on(focus,'change',paths.draw);
  on(load,'click',()=>file.click());
  on(file,'change',async()=>{
    const source=file.files[0];file.value='';
    if(!source)return;
    try{
      const raw=JSON.parse(await source.text()),task=getTrainingTask(raw?.task);
      const checkpoint=validateTrainingCheckpoint(task,raw);
      if(signal.aborted||worker||!dialog.open)return;
      checkpoints.set(task.id,checkpoint);model.value=task.id;selectTask();
      status.textContent='Loaded '+task.label+' checkpoint · round '+checkpoint.bestRound;
    }catch(error){status.textContent='Could not load checkpoint · '+error.message;}
  });
  on(save,'click',()=>{
    const checkpoint=checkpoints.get(model.value);
    const url=URL.createObjectURL(new Blob([JSON.stringify(checkpoint,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=model.value+'-round-'+checkpoint.bestRound+'.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  });
  on(apply,'click',()=>{
    try{
      const checkpoint=checkpoints.get(model.value);
      setAppliedPolicy(model.value,checkpoint);showCheckpoint();
      status.textContent='Simulation policy set · '+selected().label+' · round '+checkpoint.bestRound;
    }catch(error){status.textContent=error.message;}
  });
  on(restore,'click',()=>{
    try{setAppliedPolicy(model.value,null);showCheckpoint();status.textContent='Default simulation policy restored';}
    catch(error){status.textContent=error.message;}
  });
  const observer=new ResizeObserver(()=>{paths.draw();reward.draw();});observer.observe(plots);
  on(element('Close'),'click',()=>dialog.close());
  for(const name of ['keydown','keyup'])on(dialog,name,event=>event.stopPropagation());
  on(dialog,'close',()=>{if(!dialog.open){probe++;stop();}});
  on(window,'pagehide',()=>{if(worker)finish('Training stopped');});
  signal.addEventListener('abort',()=>{
    probe++;observer.disconnect();if(worker)finish('Training stopped');if(dialog.open)dialog.close();
  },{once:true});

  function open(vehicle){
    if(vehicle==='diver'){openDiver();return;}
    if(dialog.open)return;
    if(!worker&&model.value==='diver')model.selectedIndex=0;
    dialog.showModal();
    if(worker)return;
    const suggested=({hobie:'hobie16',sloop:'sailboat',sub:'submarine'})[vehicle]??vehicle;
    if(trainingTasks.some(task=>task.id===suggested))model.value=suggested;
    devicesPending=gpuPending=true;selectTask();
    const ticket=++probe;
    trainingDevices().then(result=>{
      if(ticket!==probe)return;
      devices=result;devicesPending=false;limits();
    });
    Promise.resolve(navigator.gpu?.requestAdapter({powerPreference:'high-performance'})).catch(()=>null).then(adapter=>{
      if(ticket!==probe)return;
      gpuAvailable=Boolean(adapter);gpuPending=false;limits();
    });
  }
  return {dialog,open};
}
