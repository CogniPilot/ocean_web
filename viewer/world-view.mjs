import {sailingStart,startGate,windBearing,windSpeed} from './sailing-start.mjs';
// Views share one committed worker snapshot, so every mesh uses the same clock.
import {boatFields} from './board/boat.mjs';
const group=(prefix,names)=>names.split(' ').map(name=>prefix+'.'+name);
const sailingOutputs=[
 ...new Set([...boatFields,...'noGo tack leg windEast windNorth currentEast currentNorth foilX ballastX ballastY swellK swellBearing swellAmplitude swellPhase mainCar jibCar ve vn yawRate exposedSheetSag shroudTail sailTail stayPath downhaulTension vangTension leechSpeed mainTension rigForce foilLoad foilArm waterFraction waterStamp'.split(' ')].map(n=>'boat.'+n)),
];
const environmentOutputs=[
 ...group('race','countdown stage elapsed lapTime markPose launchPose committeeEast committeeNorth windBearing pinEast pinNorth markEast markNorth'),
 ...group('wind','period field thunderArrival strikeBearing strikeFlash travelE travelN localEast localNorth'),
 ...group('waves','height driftE driftN period'),
 ...group('boatWater','tile tide wind'),
];
const flightOutputs=group('drone','position quaternion rotorAngle throttle attitude gps gpsVelocity dragBody aircraft.rotorGeometry.positionBodyFlu_m');
const submarineOutputs=[...group('sub','surveyTelemetry position orientation propellerRPM cavitation current'),
 'estimate','sensor','ping'];
const boatInputs={manualHelm:'sailingManual',rudderInput:'rudder',trimInput:'trim',vangInput:'vang',downhaulInput:'downhaul',deckManual:'deckManual',
 mainCarInput:'mainCar',jibCarInput:'jibCar',jibTrimInput:'jibSheet',ballastManual:'ballastManual',ballastCmdX:'ballastX',ballastCmdY:'ballastY',traffic:'traffic'};
export async function openWorld(mode='world',seaState=.45,omitWake=0){
 const hasBoat=mode==='world'||mode==='sailing'||mode==='sloop',hasSub=mode==='world'||mode==='submarine',hasFlight=mode==='world'||mode==='flight';
 const workerUrl=new URL('./'+mode+'/ocean-world-worker.mjs',import.meta.url);
 workerUrl.search=new URL(import.meta.url).search;
 const worker=new Worker(workerUrl,{type:'module'});
 addEventListener('pagehide',()=>worker.terminate(),{once:true});
 let id=0,error,time=0;
 const pending=new Map();
 const state=new Map();
 const surveyView={camera:false,dvl:false,map:false,wakeSource:false,wakeSurface:!omitWake};
 function fail(reason){
   error=reason;
   for(const reply of pending.values())reply.reject(reason);
   pending.clear();
 }
 worker.onmessage=({data})=>{
   if(data.error){fail(Error(data.error));return;}
   const reply=pending.get(data.id);
   pending.delete(data.id);
   reply?.resolve(data);
 };
 worker.onerror=e=>fail(Error(e.message));
 function send(message){
   return new Promise((resolve,reject)=>{
     pending.set(++id,{resolve,reject});
     worker.postMessage({...message,id});
   });
 }
 const initial={windSpeed,windBearing,seaState,epoch:Date.now()/1000};
 const inputs=['seaState'];
 if(hasBoat){
   Object.assign(initial,{sailingManual:1,vang:.5,downhaul:.5});
   if(mode!=='sloop')initial.ballastManual=1;
   inputs.push(...Object.values(boatInputs));
 }
 if(mode==='motorboat')inputs.push('throttleLever','helmLever');
 if(hasSub){initial.subManual=1;inputs.push('subPilot');}
 if(hasFlight){initial.flightManual=1;inputs.push('flightPilot','motorCut','flightMode','racePilot');}
 if(hasFlight)initial.station=[-5,0];
 if(mode==='flight')inputs.push('peerDeck');
 const parameters={prevailingBearing:windBearing};
 for(const [key,value] of Object.entries(startGate))parameters['race.'+key]=value;
 if(hasBoat)for(const [key,value] of Object.entries(sailingStart(mode!=='sloop')))parameters['boat.'+key]=value;
 const outputs=[...environmentOutputs,...(hasBoat?sailingOutputs:['focus','swell','waterStamp','waterFraction']),
   ...(mode==='motorboat'?['boatPose','engine']:[]),...(hasSub?submarineOutputs:[]),...(hasFlight?flightOutputs:[])];
 const controlsToBind=[...new Set([...Object.keys(initial),...inputs])];
 const frame=await send({type:'open',outputs,inputs:controlsToBind,initial,parameters,omitWake,surveyMap:hasSub,sampledFields:true,surveyView,
   optionalInputs:['animalTraffic','swimmerWater','animals','seaClockOffset','windAnchor','peerWake','idleCamera','omitWake'],
   optionalOutputs:['wind.gustEast','wind.gustNorth','waves.sourceStrips','bowSources','bowSpeed']});
 const layout=frame.layout,offsets=new Map(layout.inputs.map(i=>[i.name,i.offset]));
 const controls=new Float64Array(layout.inputs.reduce((n,i)=>n+i.count,0));
 function set(name,value){const i=offsets.get(name);if(i===undefined)throw Error('Unknown world control '+name);
   if(typeof value==='number')controls[i]=value;else controls.set(value,i);}
 if(offsets.has('idleCamera'))set('idleCamera',1);
 if(offsets.has('omitWake'))set('omitWake',omitWake);
 Object.entries(initial).forEach(([name,v])=>set(name,v));
 function unpack(fields,values){
   for(const v of fields)state.set(v.name,v.shape.length?values.subarray(v.offset,v.offset+v.count):values[v.offset]);
 }
 const wakeGroup=layout.sampled.findIndex(fields=>fields.some(v=>v.name==='waves.height'));
 let wakeRevision=0;
 function receive(f,revision){time=f.time;
   if(f.mapRows)state.set('keyframes',f.mapRows);
   const acceptWake=surveyView.wakeSurface && revision===wakeRevision;
   if(acceptWake && f.bowHeight)state.set('bowHeight',f.bowHeight);
   unpack(layout.outputs,f.values);
   f.sampled?.forEach((values,i)=>{if(values && (i!==wakeGroup || acceptWake))unpack(layout.sampled[i],values);});
 }
 receive(frame,wakeRevision);
 // Keep the worker supplied while the main thread draws. Both requests run
 // serially on the same FMU. Bound the submitted work to ten solver steps.
 let batchSize=5;
 let outstanding=0,queued=0,afterAdvance;
 function advance(steps,headroom=false){
   if(error)throw error;
   if(document.hidden)return 0;
   batchSize=headroom?10:5;
   const capacity=Math.max(0,2*batchSize-outstanding-queued);
   const accepted=Math.min(steps,capacity);
   queued+=accepted;
   dispatch();
   return accepted;
 }
 function dispatch(){
   while(!error&&pending.size<2&&queued&&!document.hidden){
     const steps=Math.min(batchSize,queued);
     queued-=steps;
     set('epoch',Date.now()/1000-time-.01*outstanding);
     outstanding+=steps;
     const revision=wakeRevision;
     send({type:'advance',steps,values:controls,surveyView}).then(f=>{
       outstanding-=steps;
       receive(f,revision);
       afterAdvance?.(time);
       dispatch();
     }).catch(e=>{queued=0;fail(e);});
   }
 }
 function view(prefix,write){
   const get=name=>{
     const full=prefix+'.'+name;
     if(!state.has(full))throw Error('Unbound world observation '+full);
     return state.get(full);
   };
   return {get,getMany:names=>names.map(get),set:write,get time(){return time;}};
 }
 const axes=['forward','left','climb','turn'];
 const flight=view('drone',(n,v)=>{const i=axes.indexOf(n);if(i>=0)controls[offsets.get('flightPilot')+i]=v;
   else if(n==='stationEast'||n==='stationNorth')controls[offsets.get('station')+Number(n==='stationNorth')]=v;
   else set(n==='pilot'?'flightManual':n,v);});
 return {advance,get scheduledSteps(){return outstanding+queued;},setAfterAdvance(callback){afterAdvance=callback;},setWakeSourceRequested(enabled){
   surveyView.wakeSource=enabled;
   if(!enabled)state.delete('waves.sourceStrips');
  },setWakeEnabled(enabled){
   if(offsets.has('omitWake'))set('omitWake',Number(!enabled));
   if(surveyView.wakeSurface!==enabled)wakeRevision++;
   surveyView.wakeSurface=enabled;
   if(!enabled){state.delete('waves.height');state.delete('bowHeight');}
 },hasAnimalTraffic:offsets.has('animalTraffic'),hasSwimmerWater:offsets.has('swimmerWater'),hasAnimals:offsets.has('animals'),hasSeaClock:offsets.has('seaClockOffset'),hasWindAnchor:offsets.has('windAnchor'),hasPeerWake:offsets.has('peerWake'),setSurveyView(active,camera,map,dvl=false){surveyView.dvl=camera||dvl;surveyView.camera=camera;surveyView.map=map;if(offsets.has('idleCamera'))set('idleCamera',active?-1:1);},clearQueued:()=>{queued=0;},set,flight:hasFlight?flight:null,boat:hasBoat?view('boat',(n,v)=>set(boatInputs[n],v)):null,race:view('race'),wind:view('wind'),get:n=>state.get(n),get time(){return time;}};
}
