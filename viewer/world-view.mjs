// Views share one committed worker snapshot, so every mesh uses the same clock.
import {boatFields} from './board/boat.mjs';
const group=(prefix,names)=>names.split(' ').map(name=>prefix+'.'+name);
const outputs=[
 ...new Set([...boatFields,...'tack leg windEast windNorth currentEast currentNorth foilX ballastX ballastY swellK swellBearing swellAmplitude swellPhase mainCar jibCar ve vn yawRate exposedSheetSag vangTension leechSpeed mainTension rigForce foilLoad foilArm waterFraction waterStamp'.split(' ')].map(n=>'boat.'+n)),
 ...group('race','countdown stage elapsed committeeEast committeeNorth windBearing pinEast pinNorth markEast markNorth'),
 ...group('drone','position quaternion rotorAngle dragBody aircraft.rotorGeometry.positionBodyFlu_m'),
 ...group('sub','surveyTelemetry position orientation propellerRPM cavitation current'),
 ...group('wind','field strikeBearing strikeFlash thunderArrival travelE travelN'),
 ...group('waves','height driftE driftN period'),
 ...group('boatWater','tile tide wind'),
 'estimate','features','image','keyframes'
];
const boatInputs={manualHelm:'sailingManual',rudderInput:'rudder',trimInput:'trim',vangInput:'vang',deckManual:'deckManual',
 mainCarInput:'mainCar',jibCarInput:'jibCar',jibTrimInput:'jibSheet',ballastManual:'ballastManual',ballastCmdX:'ballastX',ballastCmdY:'ballastY',traffic:'traffic'};
export async function openWorld(){
 const worker=new Worker(new URL('./world/ocean-world-worker.mjs',import.meta.url),{type:'module'});
 addEventListener('pagehide',()=>worker.terminate(),{once:true});
 let id=0,pending,error,time=0;
 const state=new Map();
 worker.onmessage=({data})=>{if(data.error)pending.reject(Error(data.error));else pending.resolve(data);};
 worker.onerror=e=>{error=Error(e.message);pending?.reject(error);};
 function send(message){return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage({...message,id:++id});});}
 const initial={sailingManual:1,subManual:1,flightManual:1,windSpeed:Math.hypot(10,4),windBearing:Math.atan2(4,10),epoch:Date.now()/1000,vang:.5};
 const inputs=[...new Set([...Object.keys(initial),...Object.values(boatInputs),'seaState','subPilot','flightPilot','motorCut'])];
 const frame=await send({type:'open',outputs,inputs,initial});
 const layout=frame.layout,offsets=new Map(layout.inputs.map(i=>[i.name,i.offset]));
 const controls=new Float64Array(layout.inputs.reduce((n,i)=>n+i.count,0));
 function set(name,value){const i=offsets.get(name);if(i===undefined)throw Error('Unknown world control '+name);
   if(typeof value==='number')controls[i]=value;else controls.set(value,i);}
 Object.entries(initial).forEach(([name,v])=>set(name,v));
 function receive(f){time=f.time;
   for(const v of layout.outputs)state.set(v.name,v.shape.length?f.values.subarray(v.offset,v.offset+v.count):f.values[v.offset]);}
 receive(frame);
 let busy=false;
 function advance(steps){if(error)throw error;if(busy||!steps)return false;
   set('epoch',Date.now()/1000-time);
   busy=true;send({type:'advance',steps,values:controls}).then(receive).catch(e=>{error=e;}).finally(()=>{busy=false;});return true;}
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
 return {advance,set,flight,boat:view('boat',(n,v)=>set(boatInputs[n],v)),race:view('race'),wind:view('wind'),get:n=>state.get(n),get time(){return time;}};
}
