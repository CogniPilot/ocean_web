// Exercise the production FMI carrier, including tension, swing, cradle loads and launch.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {hookAbovePiccard} from '../viewer/piccard-hoist.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/motorboat')+'/');
const read=async name=>JSON.parse(await readFile(new URL(name,base)));
const index=await read((await read('manifest.json')).index);
const fields=[['sternLiftState',2],['sternLiftPose',15],['sternLiftWrench',6],
  ['sternHoistCable',8],['sternHoistSeated',1],['sternLiftBottomPose',15],['boatPose',6]];
const columns=fields.flatMap(([name,n])=>scalarNames(name,n===1?[]:[n]));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const cross=([x,y,z],[a,b,c])=>[y*c-z*b,z*a-x*c,x*b-y*a];

async function stroke(occupied){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,downloadFirst:true,
    parameters:{initialEast:-130,initialNorth:-100,initialHeading:0}});
  const handle=fmu.bind_outputs(JSON.stringify(columns));
  const set=(name,value)=>fmu.set_inputs(JSON.stringify([[name,value]]));
  function values(){
    const v=fmu.read_bound(handle),result={};let offset=0;
    for(const [key,count] of fields){
      result[key]=Array.from(v.slice(offset,offset+count));offset+=count;
    }
    return result;
  }
  set('seaState',0);set('windSpeed',0);set('omitWake',1);set('sternLiftOccupied',occupied);
  let maxSwing=0,peakTension=0,maxExtension=0,seatedWeight,immersedTension,releasePose;
  const stepMs=[];let previousPose;
  try{
    // New cruisers start with the hook parked, ready to board on the aft deck.
    for(const [name,goal,ticks] of [['parked',1,30],['first launch',0,420],['underwater',0,100],['recover',1,520],['launch',0,470],['partial rise',1,70],['reverse',0,26]]){
      set('sternLiftGoal',goal);
      const initialLevel=values().sternLiftState[0];let lastLevel=initialLevel,endpointTime;
      for(let i=0;i<ticks;i++){
        const before=performance.now();fmu.step(.02);stepMs.push(performance.now()-before);
        const {sternLiftState:[level],sternHoistCable:c,sternLiftPose:p,sternLiftWrench:w,
          sternHoistSeated:[seated],sternLiftBottomPose:bottom,boatPose:boat}=values();
        assert([...c,...p,...w].every(Number.isFinite),'Non-finite hoist output');
        const tip=c.slice(0,3),hook=c.slice(3,6),[paid,tension]=c.slice(6),span=distance(tip,hook);
        assert(tension>=0&&paid>0,'Line can only carry positive tension');
        assert(distance(hook,p.slice(0,3).map((v,j)=>v+hookAbovePiccard*p[9+j]))<1e-8,'Rider magnet plate must coincide with the reported lifting head');
        maxExtension=Math.max(maxExtension,span-paid);peakTension=Math.max(peakTension,tension);
        if(name==='recover'&&level>.38&&level<.9)maxSwing=Math.max(maxSwing,Math.hypot(tip[0]-hook[0],tip[1]-hook[1]));
        if(previousPose)assert(distance(previousPose,p.slice(0,3).map((v,j)=>v-.02*p[3+j]))<.075,'Rider velocity must follow the actual moving body');
        previousPose=p.slice(0,3);
        if(name==='recover'&&level>.2&&level<.7&&tension>30){
          const arm=tip.map((v,j)=>v-boat[j]);
          assert(distance(w.slice(3),cross(arm,w.slice(0,3)))<2,'Suspended cable load must act at the boom tip');
        }
        if(name==='parked'){
          assert.equal(level,1,'Fresh cruiser must start stowed on deck');
          assert.equal(seated,occupied,'Stowed cradle accepts a rider without waiting for winch motion');
          assert(tension<1&&paid-span>.019,'Parked hook should be slack');
        }
        if(name==='underwater'&&i===ticks-1)immersedTension=tension;
        if(name==='recover'&&i===ticks-1&&occupied){
          assert.equal(seated,1,'Recovered Piccard must settle on the deck cradle');
          assert(tension<1,'Deck-supported Piccard should unload the line');
          assert(paid-span>.019,'Stowed winch should leave visible line slack');
          seatedWeight=-w[2];
        }
        if(name==='launch'&&lastLevel>0&&level===0){
          releasePose=[...bottom];assert(distance(bottom.slice(0,3),p.slice(0,3))<.03,'Latched launch pose matches physical rider');
        }
        if(name==='launch'&&releasePose)assert(distance(releasePose,bottom)<1e-9,'Launch pose must stay latched');
        if(lastLevel!==goal&&level===goal)endpointTime=(i+1)*.02;
        assert(distance(tip,boat.slice(0,3))<5,'Boom tip stays local to the moving cruiser');
        lastLevel=level;
      }
      if(name==='partial rise'||name==='reverse')assert((lastLevel-initialLevel)*(goal?1:-1)>.04,'Actuator reverses during the stroke');
      if(name==='recover'||name==='launch'||name==='first launch')assert(Math.abs(endpointTime-8)<.08,'Full winch/slew sequence takes eight seconds');
    }
    assert(releasePose);assert(maxExtension<.12,'Line stretched beyond the test load envelope');
    stepMs.sort((a,b)=>a-b);
    return {occupied,immersedTension,peakTension,maxSwing,maxExtension,seatedWeight,
      medianStepMs:stepMs[Math.floor(.5*stepMs.length)],p95StepMs:stepMs[Math.floor(.95*stepMs.length)]};
  }finally{fmu.free();}
}
const empty=await stroke(0),loaded=await stroke(1);
console.log({empty,loaded});
assert(loaded.peakTension>130&&loaded.peakTension<650,'Slung hull should load its cable during recovery');
assert(loaded.seatedWeight>150&&loaded.seatedWeight<235,'Cradle carries the dry Piccard and lifting tackle');
assert(loaded.immersedTension<.35*loaded.peakTension,'Water buoyancy unloads the cable');
assert(loaded.maxSwing>.05,'The simulated sling must move laterally during slew');
assert(empty.peakTension<.35*loaded.peakTension,'Empty hook does not carry the vehicle weight');
