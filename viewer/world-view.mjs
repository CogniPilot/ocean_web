import {sailingStart,windBearing,windSpeed} from './sailing-start.mjs';
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
const flightOutputs=group('drone','position quaternion rotorAngle attitude gps gpsVelocity dragBody aircraft.rotorGeometry.positionBodyFlu_m');
const submarineOutputs=[...group('sub','surveyTelemetry position orientation propellerRPM cavitation current'),
 'estimate','sensor','ping'];
const boatInputs={manualHelm:'sailingManual',rudderInput:'rudder',trimInput:'trim',vangInput:'vang',downhaulInput:'downhaul',deckManual:'deckManual',
 mainCarInput:'mainCar',jibCarInput:'jibCar',jibTrimInput:'jibSheet',ballastManual:'ballastManual',ballastCmdX:'ballastX',ballastCmdY:'ballastY',traffic:'traffic'};
export async function openWorld(mode='world',seaState=.45){
 const hasBoat=mode==='world'||mode==='sailing'||mode==='sloop',hasSub=mode==='world'||mode==='submarine',hasFlight=mode==='world'||mode==='flight';
 const workerUrl=new URL('./'+mode+'/ocean-world-worker.mjs',import.meta.url);
 workerUrl.search=new URL(import.meta.url).search;
 const worker=new Worker(workerUrl,{type:'module'});
 addEventListener('pagehide',()=>worker.terminate(),{once:true});
 let id=0,pending,error,time=0;
 const state=new Map();
 const surveyView={camera:false,map:false,wakeSource:false,wakeSurface:false};
 worker.onmessage=({data})=>{if(data.error)pending.reject(Error(data.error));else pending.resolve(data);};
 worker.onerror=e=>{error=Error(e.message);pending?.reject(error);};
 function send(message){return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage({...message,id:++id});});}
 const initial={windSpeed,windBearing,seaState,epoch:Date.now()/1000};
 const inputs=['seaState'];
 if(hasBoat){
   Object.assign(initial,{sailingManual:1,vang:.5,downhaul:.5});
   if(mode!=='sloop')initial.ballastManual=1;
   inputs.push(...Object.values(boatInputs));
 }
 if(hasSub){initial.subManual=1;inputs.push('subPilot');}
 if(hasFlight){initial.flightManual=1;inputs.push('flightPilot','motorCut');}
 if(mode==='flight'){initial.station=[-5,0];inputs.push('peerDeck');}
 const parameters={prevailingBearing:windBearing};
 if(hasBoat)for(const [key,value] of Object.entries(sailingStart(mode!=='sloop')))parameters['boat.'+key]=value;
 const outputs=[...environmentOutputs,...(hasBoat?sailingOutputs:['focus','swell','waterStamp','waterFraction']),
   ...(hasSub?submarineOutputs:[]),...(hasFlight?flightOutputs:[])];
 const controlsToBind=[...new Set([...Object.keys(initial),...inputs])];
 const frame=await send({type:'open',outputs,inputs:controlsToBind,initial,parameters,surveyMap:hasSub,sampledFields:true,surveyView,
   optionalInputs:['seaClockOffset','windAnchor','peerWake','idleCamera','omitWake'],
   optionalOutputs:['wind.gustEast','wind.gustNorth','waves.sourceStrips','waves.wakeHeight','bowSources','bowSpeed']});
 const layout=frame.layout,offsets=new Map(layout.inputs.map(i=>[i.name,i.offset]));
 const controls=new Float64Array(layout.inputs.reduce((n,i)=>n+i.count,0));
 function set(name,value){const i=offsets.get(name);if(i===undefined)throw Error('Unknown world control '+name);
   if(typeof value==='number')controls[i]=value;else controls.set(value,i);}
 if(offsets.has('idleCamera'))set('idleCamera',1);
 Object.entries(initial).forEach(([name,v])=>set(name,v));
 function unpack(fields,values){
   for(const v of fields)state.set(v.name,v.shape.length?values.subarray(v.offset,v.offset+v.count):values[v.offset]);
 }
 function receive(f){time=f.time;
   if(f.mapRows)state.set('keyframes',f.mapRows);
   if(f.bowHeight)state.set('bowHeight',f.bowHeight);
   unpack(layout.outputs,f.values);
   f.sampled?.forEach((values,i)=>{if(values)unpack(layout.sampled[i],values);});
 }
 receive(frame);
 let busy=false,queued=0;
 function advance(steps){
   if(error)throw error;
   const accepted=Math.min(steps,5-queued);
   queued+=accepted;
   dispatch();
   return accepted;
 }
 function dispatch(){
   if(busy||!queued||document.hidden)return;
   const steps=queued;queued=0;
   set('epoch',Date.now()/1000-time);
   busy=true;send({type:'advance',steps,values:controls,surveyView}).then(f=>{
     receive(f);busy=false;dispatch();
   }).catch(e=>{busy=false;queued=0;error=e;});
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
   else set(n==='pilot'?'flightManual':n,v);});
 return {advance,setWakeSourceRequested(enabled){
   surveyView.wakeSource=enabled;
   if(!enabled)state.delete('waves.sourceStrips');
  },setWakeEnabled(enabled){
   if(offsets.has('omitWake'))set('omitWake',Number(!enabled));
   surveyView.wakeSurface=enabled;
   if(!enabled){state.delete('waves.wakeHeight');state.delete('bowHeight');}
 },hasSeaClock:offsets.has('seaClockOffset'),hasWindAnchor:offsets.has('windAnchor'),hasPeerWake:offsets.has('peerWake'),setSurveyView(active,camera,map){surveyView.camera=camera;surveyView.map=map;if(offsets.has('idleCamera'))set('idleCamera',active?-1:1);},clearQueued:()=>{queued=0;},set,flight:hasFlight?flight:null,boat:hasBoat?view('boat',(n,v)=>set(boatInputs[n],v)):null,race:view('race'),wind:view('wind'),get:n=>state.get(n),get time(){return time;}};
}
