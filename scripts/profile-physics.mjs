// Profile the released physics without a renderer or wall-clock pacing.
import assert from 'node:assert/strict';
import {closeSync, openSync, readFileSync, readSync, writeFileSync, writeSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {sailingStart, startGate, windBearing, windSpeed} from '../viewer/sailing-start.mjs';

const [root='build/pages', role='sailing', count='400', ...options]=process.argv.slice(2);
const ticks=Number(count), warmup=200, step=.01;
const wakes=options.includes('--no-wakes')?0:1;
const banked=options.includes('--banked');
assert(Number.isSafeInteger(ticks)&&ticks>=20,'Provide at least 20 timed steps');
assert(options.every(option=>option==='--no-wakes'||(role==='shark'&&option==='--banked')),'Unknown profiling option');
const base=pathToFileURL(resolve(root)+'/');
const read=async url=>new Response(readFileSync(url));
const arrays=(name,count)=>Array.from({length:count},(_,i)=>name+'['+(i+1)+']');
const boatPose=['boat.east','boat.north','boat.heave','boat.heading','boat.heel','boat.pitch'];
const oceanFields=['boatWater.surface','wind.localEast','race.countdown'];
const cases={
  sailing:{inputs:{sailingManual:1,downhaul:.5,ballastManual:1},fields:boatPose,launch:true},
  sloop:{inputs:{sailingManual:1,vang:.5},fields:boatPose,launch:false},
  motorboat:{inputs:{throttleLever:.65,helmLever:.08},fields:[...arrays('boatPose',6),...arrays('engine',4)]},
  flight:{inputs:{station:[-5,0],flightManual:1,flightMode:0,flightPilot:[.2,-.1,0,.1]},fields:[...arrays('drone.position',3),...arrays('drone.quaternion',4),...arrays('drone.dragBody',3)]},
  'flight-idle':{runtime:'flight',inputs:{station:[-5,0],flightManual:1,flightMode:0,flightPilot:[0,0,0,0]},fields:arrays('focus',3)},
  submarine:{inputs:{subManual:0,idleCamera:-1},fields:[...arrays('sub.position',3),...arrays('estimate',3),'sub.waypoint']},
  habitat:{inputs:{animalPosition:[9,-12,-4]},fields:arrays('focus',3)},
  world:{inputs:{sailingManual:1,subManual:0,idleCamera:-1,flightManual:0},fields:[...boatPose,...arrays('sub.position',3),...arrays('drone.position',3)],launch:true},
  whale:{model:'HarborTraffic',inputs:{whalePilot:[1,0,.65,-1],whaleTurn:.05},fields:['whale','swimmerState','tailForce','tailPower']},
  shark:{model:'HarborTraffic',
    inputs:{sharkPilot:[1,banked?-.15:0,.65,-1],sharkTurn:.05,...(banked?{sharkBank:.7}:{})},
    fields:['state','fish','sharkTailForce','sharkTailPower',...(banked?['sharkBankState']:[])]},
  gull:{model:'HerringGull',inputs:{wind:[0,11]},fields:['x','wings','memory','power']}
};
const scenario=cases[role];
assert(scenario,'Unknown vehicle '+role);

async function openVehicle(){
  if(scenario.model){
    const instanceURL=new URL('fmi3/instance.mjs',base);
    const {loadInstance}=await import(instanceURL);
    const instance=await loadInstance(scenario.model,scenario.inputs,read);
    return {advance(){instance.advance(step);},observe(){return instance.getMany(scenario.fields).flat();},close(){}};
  }
  const runtime=new URL((scenario.runtime??role)+'/',base);
  const load=async name=>(await read(new URL(name,runtime))).json();
  const manifest=await load('manifest.json'),index=await load(manifest.index);
  const variables=new Map(index.variables.map(v=>[v.name,v]));
  const parameters={prevailingBearing:windBearing};
  for(const [key,value] of Object.entries(startGate))parameters['race.'+key]=value;
  if(scenario.launch!==undefined){
    for(const [key,value] of Object.entries(sailingStart(scenario.launch)))parameters['boat.'+key]=value;
  }
  const fmu=await openFmuSession({index,base:runtime,fetch:fileFetch,parameters});
  try{
    const controls={windSpeed,windBearing,seaState:.45,epoch:100,omitWake:1-wakes,...scenario.inputs};
    const inputs=Object.entries(controls).flatMap(([name,value])=>{
      const variable=variables.get(name);
      if(!variable)return [];
      return Array.isArray(value)?value.map((v,i)=>[name+'['+(i+1)+']',v]):[[name,value]];
    });
    fmu.set_inputs(JSON.stringify(inputs));
    const binding=fmu.bind_outputs(JSON.stringify([...scenario.fields,...oceanFields]));
    return {advance(){fmu.step(step);},observe(){return fmu.read_bound(binding);},close(){fmu.free();}};
  }catch(error){fmu.free();throw error;}
}

// perf's FIFO controls keep startup, WebAssembly compilation and warmup out of the sample.
const perfControl=process.env.OCEAN_PERF_CONTROL;
let control,ack;
function perf(command){
  if(!perfControl)return;
  writeSync(control,command+'\n');
  const reply=Buffer.alloc(1);
  for(let size=0;size<64;size++){
    assert.equal(readSync(ack,reply,0,1,null),1,'perf control closed');
    if(reply[0]===10)return;
  }
  throw Error('Unexpected reply from perf');
}
const vehicle=await openVehicle();
try{
  for(let tick=0;tick<warmup;tick++){
    vehicle.advance();
    assert(vehicle.observe().every(Number.isFinite));
  }
  if(perfControl){
    control=openSync(perfControl,'w');
    ack=openSync(process.env.OCEAN_PERF_ACK,'r');
  }
  const stepTimes=[],readTimes=[],trace=[];
  perf('enable');
  for(let tick=0;tick<ticks;tick++){
    const start=performance.now();
    vehicle.advance();
    const advanced=performance.now();
    const pose=vehicle.observe();
    const observed=performance.now();
    assert(pose.every(Number.isFinite),role+' step '+tick);
    stepTimes.push(advanced-start);readTimes.push(observed-advanced);
    if(process.env.OCEAN_PHYSICS_TRACE)trace.push(Array.from(pose));
  }
  perf('disable');
  const summarize=samples=>{
    const sorted=[...samples].sort((a,b)=>a-b);
    const quantile=p=>sorted[Math.ceil(sorted.length*p)-1];
    return {mean:samples.reduce((sum,x)=>sum+x,0)/samples.length,p50:quantile(.50),p95:quantile(.95)};
  };
  const timing={step:summarize(stepTimes),read:summarize(readTimes)};
  if(process.env.OCEAN_PHYSICS_TRACE)writeFileSync(process.env.OCEAN_PHYSICS_TRACE,JSON.stringify(trace));
  console.log(JSON.stringify({role,ticks,warmup,wakes,banked,timing,realTimeFactor:1000*step/(timing.step.mean+timing.read.mean)}));
}finally{
  vehicle.close();
  if(control!==undefined)closeSync(control);
  if(ack!==undefined)closeSync(ack);
}
