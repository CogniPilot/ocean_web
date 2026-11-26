import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {keyboardAxisKey} from '../viewer/keyboard-sticks.mjs';
import {submarinePilot} from '../viewer/submarine.mjs';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',root));
const read=async url=>new Response(await readFile(url));
const start=[-5,0,-8];
const plant=await loadInstance('Wreck_Plant',{manual:1,manualMode:0,spawnPosition:start,
  spawnHeading:Math.PI/2,windSpeed:8,seaState:0},read);
const nav=await loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0},read);
for(const layout of ['wasd','mode2']){
  const command=key=>{const code=keyboardAxisKey(key,layout,'sub');return (p,n)=>Number(code===p)-Number(code===n);};
  assert(submarinePilot(command('KeyQ')).pilot[1]>0,layout+' port station adjustment');
  const {pilot,attitude}=submarinePilot(command('ArrowLeft'));
  assert(pilot[2]>0&&pilot[1]===0&&attitude[0]===0,layout+' left arrow aims the nose independently of strafe and automatic bank');
}
let tick=0,lastGyro=[0,0,0],locked=0,missed=0,peakOffset=0,lateOffset=0,lateDepthError=0;
function advance(seconds,receive){
  for(let j=0;j<seconds*5;j++){
    const [position,q,velocity,yawRate,pressure,force,gyro]=plant.getMany(
      ['position','orientation','velocity','yawRate','pressure','specificForce','gyroAngle']);
    nav.set('stamp',tick/100);
    nav.set('truth',[...position,...q,...velocity,yawRate,pressure,...force,...gyro.map((x,i)=>(x-lastGyro[i])/.2)]);
    lastGyro=gyro;
    const [sensor,estimate]=nav.getMany(['sensor','estimate']);
    nav.set('prior',estimate);plant.set('sensor',sensor);
    plant.set('navigationUp',estimate[2]);plant.set('navigationUpValid',1);
    receive?.(position,sensor,q);
    for(let i=0;i<20;i++){plant.advance(.01);tick++;}
  }
}

assert(plant.get('current')[0]>.25,'Cross-current must exercise sway control');
advance(90,(position,sensor)=>{
  if(sensor[62]>.5)locked++;else missed++;
  const offset=Math.hypot(position[0]-start[0],position[1]-start[1]);
  peakOffset=Math.max(peakOffset,offset);
  if(tick>=6000){
    lateOffset=Math.max(lateOffset,offset);
    lateDepthError=Math.max(lateDepthError,Math.abs(position[2]-start[2]));
  }
});
assert(locked>350&&missed>0,'Actual DVL dropouts were exercised');
assert(peakOffset<2&&lateOffset<.35&&lateDepthError<.08,'Current-compensated station and pressure depth');

// A banked station turn mixes pitch and yaw body rates. Verify that the
// physical vehicle holds pitch, depth and position through a complete turn.
const heading=([w,x,y,z])=>Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
let sweep=0,priorHeading=heading(plant.get('orientation')),maxPitch=0,maxTurnOffset=0,maxTurnDepth=0;
plant.set('pilot',[0,0,.42,0]);
for(let sample=0;sample<150 && sweep<2*Math.PI;sample++){
  advance(.2,(pos,sensor,q)=>{
    const h=heading(q),[w,x,y,z]=q;
    sweep+=angleDifference(h,priorHeading);
    priorHeading=h;
    maxPitch=Math.max(maxPitch,Math.abs(Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))));
    maxTurnOffset=Math.max(maxTurnOffset,Math.hypot(pos[0]-start[0],pos[1]-start[1]));
    maxTurnDepth=Math.max(maxTurnDepth,Math.abs(pos[2]-start[2]));
  });
}
assert(sweep>=2*Math.PI && maxPitch<.07 && maxTurnOffset<.35 && maxTurnDepth<.12,'Banked yaw should hold level pitch and station');
const releasedHeading=heading(plant.get('orientation'));
plant.set('pilot',[0,0,0,0]);
advance(12);
const releaseError=angleDifference(heading(plant.get('orientation')),releasedHeading);
assert(Math.abs(releaseError)<.10,'Neutral yaw should retain the heading at release');
console.log({sweep,maxPitch,maxTurnOffset,maxTurnDepth,releaseError});

plant.set('pilot',[.4,0,0,.2]);advance(6);plant.set('pilot',[0,0,0,0]);
const released=plant.get('position');
assert(released[1]>start[1]+1&&released[2]>start[2]+.5,'Pilot retargeted position and depth');
advance(35);
const held=plant.get('position');
const retargetError=Math.hypot(held[0]-released[0],held[1]-released[1]);
assert(retargetError<.55&&Math.abs(held[2]-released[2])<.12,'Neutral sticks must hold the new point');
console.log({locked,missed,peakOffset,lateOffset,lateDepthError,retargetError,retargetDepthError:held[2]-released[2]});

const lateralStart=plant.get('position'),lateralHeading=heading(plant.get('orientation'));
plant.set('pilot',[0,.35,0,0]);
advance(7);
const translated=plant.get('position');
const portTravel=-(translated[0]-lateralStart[0])*Math.sin(lateralHeading)
  +(translated[1]-lateralStart[1])*Math.cos(lateralHeading);
const lateralYaw=angleDifference(heading(plant.get('orientation')),lateralHeading);
assert(portTravel>1 && Math.abs(lateralYaw)<.07,'Strafe translates without a yaw command');
plant.set('pilot',[0,.35,.28,0]);
advance(4);
const turned=angleDifference(heading(plant.get('orientation')),lateralHeading+lateralYaw);
assert(turned>.6,'The yaw stick remains active during lateral translation');
plant.set('pilot',[0,0,0,0]);
let capture;
advance(18,(p,sensor)=>{capture??=sensor.slice(59,61);});
const target=plant.get('stationControl.sampleState').slice(0,2);
assert(Math.hypot(target[0]-capture[0],target[1]-capture[1])<.025,
  'Releasing both translation axes captures the latest measured horizontal position');
console.log({portTravel,lateralYaw,simultaneousYaw:turned,releasedStation:target});

// A rigid FPV camera looks with the body. The pilot can pitch while station
// keeping, even at a heading different from the spawn heading.
const aimStation=plant.get('position');
const pitchLimitDeg=plant.has('pilotPitchLimit')?plant.get('pilotPitchLimit')*180/Math.PI:45;
for(const noseDown of [-30,20,45,0]){
  plant.set('attitudePilot',[0,noseDown/pitchLimitDeg]);
  advance(10);
  const [w,x,y,z]=plant.get('orientation');
  const pitch=Math.asin(Math.max(-1,Math.min(1,2*(w*y-x*z))))*180/Math.PI;
  const p=plant.get('position');
  const drift=Math.hypot(...p.map((v,i)=>v-aimStation[i]));
  assert(Math.abs(pitch-noseDown)<5,'Position hold follows commanded FLU pitch '+noseDown+'°, got '+pitch);
  assert(drift<.9,'Position hold remains on station through a change in pitch, moved '+drift+' m');
  console.log({requestedPitchDeg:noseDown,reachedPitchDeg:pitch,driftM:drift});
}
