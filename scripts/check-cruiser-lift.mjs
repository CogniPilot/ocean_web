// Verify the carrier's stroke, attachment twist and payload wrench in the shipped FMI component.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {liftPose} from '../viewer/stern-lift.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/motorboat')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
assert.equal(index.modelName,'OceanMotorboat');
if(index.variables.some(variable=>variable.name==='sternHoistCable')){
  await import('./check-davit-cable.mjs');
  process.exit(0);
}
const dt=.02;
const gravity=9.80665, mass=18+2*1025*.00035, displacement=.0184;
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=([x,y,z],[a,b,c])=>[y*c-z*b,z*a-x*c,x*b-y*a];
const length=a=>Math.hypot(...a);
function close(actual,expected,tolerance,about){
  const error=length(minus(actual,expected));
  assert(error<tolerance,`${about}: error ${error}, got ${actual}, expected ${expected}`);
}
const channels=[['sternLiftState',2],['sternLiftPose',15],['sternLiftWrench',6],['boatPose',6],['landingDeck',12],['sternLiftBottomPose',15],['liftWaterline',1]];
async function carrier(occupied){
  const fmu=await openFmuSession({index,base,fetch:fileFetch});
  const bindings=channels.map(([key,count])=>[key,fmu.bind_outputs(JSON.stringify(scalarNames(key,count===1?[]:[count])))]);
  fmu.set_inputs(JSON.stringify(Object.entries({sternLiftOccupied:occupied,seaState:0,windSpeed:0,omitWake:1})));
  return {fmu,samples:[],read:()=>Object.fromEntries(bindings.map(([key,binding])=>[key,Array.from(fmu.read_bound(binding))]))};
}
const empty=await carrier(0),loaded=await carrier(1),phases=[['hold',0,50],['raise',1,420],['lower',0,420],
  ['raise partway',1,50],['reverse',0,20],['reverse again',1,18]];
let raisedPitch=0,raisedHeave=0,maxOmega=0,maxTwist=0,bottomPose,steps=0;
try{
  for(const [label,command,count] of phases){
    for(const model of [empty,loaded])model.fmu.set_inputs(JSON.stringify([['sternLiftGoal',command]]));
    let arrival,previous,firstLevel;
    for(let i=0;i<count;i++){
      // Alternate which initialized instance runs first to avoid a persistent warm-cache advantage.
      const order=(steps++%2===0)?[empty,loaded]:[loaded,empty];
      for(const model of order){
        const before=performance.now();model.fmu.step(dt);const elapsed=performance.now()-before;
        if(steps>50)model.samples.push(elapsed);
      }
      const wet=loaded.read(),dry=empty.read();
      const [level,rate]=wet.sternLiftState;
      assert(level>=0&&level<=1);
      close(dry.sternLiftState,[level,rate],1e-9,'empty and occupied strokes');
      close(dry.sternLiftWrench,Array(6).fill(0),1e-10,'empty lift load');
      const [x,y,z,heel,pitch,yaw]=wet.boatPose,[ve,vn,vu,we,wn,wu]=wet.landingDeck.slice(6);
      const expected=liftPose({x,y,z,heel,pitch,yaw,ve,vn,vu,we,wn,wu},level,command,rate);
      const pose=wet.sternLiftPose,omega=pose.slice(12),force=wet.sternLiftWrench.slice(0,3);
      const arm=minus(pose.slice(0,3),[x,y,z]);
      close(pose.slice(0,3),[expected.x,expected.y,expected.z],2e-8,'mount position');
      close(pose.slice(6,9),expected.forward,1e-9,'rider forward');
      close(pose.slice(9,12),expected.up,1e-9,'tilted rider normal');
      close(omega,expected.omega,1e-9,'carrier and hinge rotation');
      close(pose.slice(3,6),[expected.ve,expected.vn,expected.vu],1e-7,'mount velocity');
      close(wet.sternLiftWrench.slice(3),cross(arm,force),1e-5,'force moment about cruiser origin');
      maxOmega=Math.max(maxOmega,length(omega));maxTwist=Math.max(maxTwist,length(cross(omega,arm)));
      if(label==='raise'&&level===1){
        close(force,[0,0,-mass*gravity],1e-6,'fully raised weight');
        if(i===count-1){raisedPitch=wet.boatPose[4]-dry.boatPose[4];raisedHeave=wet.boatPose[2]-dry.boatPose[2];}
      }
      if(label==='hold'&&i>5){
        // At the tipped stop, the cruiser flotation sets the rider immersion.
        const immersed=Math.max(0,Math.min(1,(wet.liftWaterline[0]-pose[2]+.08)/.16));
        assert(Math.abs(force[2]-(1025*displacement*immersed-mass)*gravity)<1.2,'wet support disagrees with displaced volume');
      }
      if(previous!==undefined){
        const delta=level-previous;
        const expected=Math.max(0,Math.min(1,firstLevel+(command?1:-1)*i*dt/8));
        // A 20 ms event on a floating-point communication boundary can land
        // on either side. The accumulated stroke must stay within one event.
        assert((command?delta:-delta)>=-1e-10&&Math.abs(level-expected)<=dt/8+1e-8,`${label} stroke ${level}, expected ${expected}`);
      }else firstLevel=level;
      if(level===(command?1:0)&&arrival===undefined)arrival=(i+1)*dt;
      if(label==='lower'&&level===0){
        if(!bottomPose){
          bottomPose=wet.sternLiftBottomPose;
          close(bottomPose.slice(0,3),pose.slice(0,3),.015,'release at lower endpoint');
        }else close(wet.sternLiftBottomPose,bottomPose,1e-8,'latched endpoint pose');
      }
      previous=level;
    }
    if(label==='raise'||label==='lower')assert(Math.abs(arrival-8)<=.041,`${label} arrived at ${arrival} s`);
    if(label.includes('reverse')||label==='raise partway')assert((previous-firstLevel)*(command?1:-1)>.03,label);
  }
  assert(raisedPitch<0&&raisedHeave<0,`aft payload should sink the stern, pitch delta ${raisedPitch}, heave delta ${raisedHeave}`);
  assert(maxOmega>.001&&maxTwist>.005,'nonzero carrier rotation was exercised');
  function metrics(model){
    const sample=model.samples.slice().sort((a,b)=>a-b);
    return {medianMs:sample[Math.floor(.5*sample.length)],p95Ms:sample[Math.floor(.95*sample.length)]};
  }
  console.log({steps,raisedPitchRad:raisedPitch,raisedHeaveM:raisedHeave,maxOmega,maxTwist,empty:metrics(empty),loaded:metrics(loaded)});
}finally{empty.fmu.free();loaded.fmu.free();}
