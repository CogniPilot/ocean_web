// Each worker owns one world and its FMI clock. Controls and observations use
// modelDescription variable names (including one-based Modelica array indices).
import {openFmuSession} from './fmu-session.js';

import {scalarNames} from './fmu-page-contract.js';
import {loadInstance} from '../fmi3/instance.mjs';

let session,observations,inputs,surveyMap;
let bowField,bowFields;
let sampledGroups=[],stepCount=0,stepTicks=1;
// These discrete outputs share sample events in OceanWorld. The initial
// right limit can differ from the initialization snapshot on the first step.
function sampleEpoch(step,interval){
  return step===0 ? -1 : Math.floor(step/interval);
}
function expand(names,variables){
  const layout=[],elements=[];
  for(const name of names){
    const shape=variables.get(name)?.dimensions??[];
    const scalars=scalarNames(name,shape);
    layout.push({name,shape,offset:elements.length,count:scalars.length});
    elements.push(...scalars);
  }
  return {layout,elements};
}
async function handle(request){
  let layout;
  if(request.type==='open'){
    if(session)throw Error('World already initialized');
    stepTicks=request.stepTicks??1;
    if(stepTicks!==1&&stepTicks!==2)throw Error('Expected a 10 or 20 ms communication step');
    const base=new URL('./',import.meta.url);
    const {index:file}=await (await fetch(new URL('manifest.json',base),{cache:'no-cache'})).json();
    const index=await (await fetch(new URL(file,base))).json();
    const parameters={...request.parameters};
    if(request.surveyView && index.variables.some(v=>v.name==='surveyAtStartup'))parameters.surveyAtStartup=0;
    session=await openFmuSession({index,base,parameters,instanceName:'ocean_web'});
    const variables=new Map(index.variables.map(v=>[v.name,v]));
    const initial={};
    if(variables.has('sailingManual'))initial.sailingManual=1;
    if(variables.has('subManual'))initial.subManual=1;
    if(variables.has('flightManual'))initial.flightManual=1;
    if(variables.has('omitWake')&&request.omitWake!==undefined)initial.omitWake=request.omitWake;
    const initialInputs=Object.entries({...initial,...request.initial}).flatMap(([name,value])=>
      Array.isArray(value)?scalarNames(name,variables.get(name).dimensions).map((key,i)=>[key,value[i]]):[[name,value]]);
    session.set_inputs(JSON.stringify(initialInputs));
    let names=[...request.outputs,...(request.optionalOutputs??[]).filter(name=>variables.has(name))];
    if(request.sampledFields){
      const [waveDt,windDt]=session.read_values(JSON.stringify(['waves.dt','wind.dt']));
      const battenFields=[1,2].flatMap(sail=>
        ['battenCount','battenLuff','battenLeech','mesh'].map(name=>`boat.cloth[${sail}].${name}`));
      const schedules=[
        [waveDt*100,['waves.height','waves.driftE','waves.driftN','bowSources','bowSpeed'],'wakeSurface'],
        [waveDt*100,['waves.sourceStrips'],'wakeSource'],
        [waveDt*100,['boat.stationGeometry','boat.beamFraction','boat.halfSpacing','boat.sectionVolume','boat.sectionWater','boat.stationX','boat.beamHalf',
          'boat.hydroStationGeometry','boat.hydroSectionVolume','hydroSurfaceProbes',
          'stripEast','stripNorth','stripZ','stripForce','stripVolume','panelSea',...battenFields],'physics'],
        [20,['boatWater.tile']],[20,['sensor'],'dvl'],[20,['ping'],'camera'],[windDt*100,['wind.field']]
      ];
      for(const [interval,candidates,subscription] of schedules){
        if(!Number.isSafeInteger(interval)||interval<1)continue;
        const selected=names.filter(name=>candidates.includes(name));
        if(!selected.length)continue;
        const fields=expand(selected,variables);
        sampledGroups.push({interval,subscription,layout:fields.layout,binding:session.bind_outputs(JSON.stringify(fields.elements))});
        if(selected.includes('bowSources')){
          const sources=fields.layout.find(entry=>entry.name==='bowSources');
          const speed=fields.layout.find(entry=>entry.name==='bowSpeed');
          bowFields={index:sampledGroups.length-1,sources,speed};
        }
        names=names.filter(name=>!selected.includes(name));
      }
    }
    const reads=expand(names,variables),writes=expand([...request.inputs,...(request.optionalInputs??[]).filter(name=>variables.has(name))],variables);
    observations=session.bind_outputs(JSON.stringify(reads.elements));
    if(request.surveyMap){
      const estimate=reads.layout.find(v=>v.name==='estimate');
      if(!estimate)throw Error('Survey map snapshots require the estimate output');
      const keys=expand(['keyframes'],variables);
      surveyMap={estimateOffset:estimate.offset, stride:keys.layout[0].shape[1],
        binding:session.bind_outputs(JSON.stringify(keys.elements)), count:-1, closures:-1};
    }
    inputs=session.bind_inputs(JSON.stringify(writes.elements));
    layout={outputs:reads.layout,inputs:writes.layout,sampled:sampledGroups.map(group=>group.layout)};
  }else if(request.type==='advance'){
    if(!Number.isSafeInteger(request.steps)||request.steps<0||request.steps%stepTicks!==0)throw Error('Expected whole communication steps');
    if(request.values)session.write_bound(inputs,request.values);
    for(let i=0;i<request.steps;i+=stepTicks)session.step(.01*stepTicks);
    stepCount+=request.steps;
  }else if(request.type==='close'){
    session?.free();self.close();return;
  }else throw Error('Unknown world request');
  const values=session.read_bound(observations);
  const transfer=[values.buffer];
  const sampled=sampledGroups.map(group=>{
    if(group.subscription && request.surveyView?.[group.subscription]===false){
      group.epoch=undefined;
      return null;
    }
    const epoch=sampleEpoch(stepCount,group.interval);
    if(epoch===group.epoch)return null;
    group.epoch=epoch;
    const data=session.read_bound(group.binding);
    transfer.push(data.buffer);
    return data;
  });
  let bowHeight;
  const bowSnapshot=bowFields&&sampled[bowFields.index];
  if(bowSnapshot){
    const {sources,speed}=bowFields;
    const values=bowSnapshot.subarray(sources.offset,sources.offset+sources.count);
    const velocity=bowSnapshot.subarray(speed.offset,speed.offset+speed.count);
    if(bowField||values.some(v=>v!==0)){
      bowField??=await loadInstance('BowWavePatch',{});
      bowField.set('sources',values);bowField.set('relativeSpeed',velocity);
      bowField.advance(.01);
      bowHeight=Float32Array.from(bowField.get('height'));
      transfer.push(bowHeight.buffer);
    }
  }
  let mapRows;
  if(surveyMap && request.surveyView?.map!==false){
    // The estimator appends a keyframe or optimizes on loop closure. Send the
    // entire occupied prefix on either event so earlier optimized poses refresh.
    const count=values[surveyMap.estimateOffset+12],closures=values[surveyMap.estimateOffset+13];
    if(count!==surveyMap.count || closures!==surveyMap.closures){
      mapRows=count ? session.read_bound(surveyMap.binding).slice(0,count*surveyMap.stride) : new Float64Array();
      transfer.push(mapRows.buffer);
      surveyMap.count=count;
      surveyMap.closures=closures;
    }
  }
  self.postMessage({id:request.id,time:session.time(),values,layout,mapRows,sampled,bowHeight},transfer);
}
// Opening the guest is asynchronous. Process later control packets in order.
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(()=>handle(data)).catch(error=>{
    self.postMessage({id:data.id,error:error.message});
    session?.free();self.close();
  });
};
