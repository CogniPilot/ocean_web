// Exercise the real 100 Hz plant and its 5 Hz navigation sensor interface.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {submarinePilot} from '../viewer/submarine.mjs';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',root));
const read=async url=>new Response(await readFile(url));

async function stepResponse(mode,axis,goal) {
  const level=mode===1 && axis<2;
  const plant=await loadInstance('Wreck_Plant',{
    manual:1,manualMode:mode,spawnPosition:[-5,0,-8],windSpeed:0,seaState:0,
    'ocean.profile':[0,0,0,8,0,0,16,0,0],'ocean.tidalSpeed':0
  },read);
  const nav=await loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0},read);
  let previousGyro=[0,0,0],peak=-Infinity,atRelease=0,oppositePeak=0,settledAfter=0;
  for(let tick=0;tick<1250;tick++){
    if(tick%20===0){
      const [position,q,velocity,rate,pressure,force,gyro]=plant.getMany([
        'position','orientation','velocity','yawRate','pressure','specificForce','gyroAngle'
      ]);
      nav.set('stamp',tick*.01);
      nav.set('truth',[...position,...q,...velocity,rate,pressure,...force,...gyro.map((v,i)=>(v-previousGyro[i])/.2)]);
      previousGyro=gyro;
      const [sensor,est]=nav.getMany(['sensor','estimate']);
      nav.set('prior',est);
      plant.set('sensor',sensor);
      plant.set('navigationUp',est[2]);
      plant.set('navigationUpValid',1);
    }
    if(tick===400 || tick===800){
      const requested=tick===400?goal:0;
      const stick=[0,0],pilot=[0,0,0,0];
      if(axis===2) pilot[2]=requested;
      else stick[axis]=requested/(level?[Math.PI/2,plant.has('pilotPitchLimit')?plant.get('pilotPitchLimit'):Math.PI/4][axis]:[1.05,.90][axis]);
      plant.set('attitudePilot',stick);
      plant.set('pilot',pilot);
    }
    plant.advance(.01);
    const [w,x,y,z]=plant.get('orientation');
    const value=level?(axis===0?Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)):
      Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))):plant.get('rates')[axis];
    if(tick>=400 && tick<800){peak=Math.max(peak,value);atRelease=value;}
    if(tick>=800){
      oppositePeak=Math.min(oppositePeak,value);
      if(Math.abs(value)>.04*goal) settledAfter=(tick-799)*.01;
    }
  }
  const label=(mode===1?'Auto level':'Acro')+' '+['roll','pitch','yaw'][axis];
  console.log({label,goal,peak,atRelease,oppositePeak,settledAfter});
  assert.ok(peak<1.06*goal && atRelease>.93*goal && atRelease<1.06*goal,label+' tracks the command');
  assert.ok(oppositePeak>-.06*goal && settledAfter<2,label+' damps the release');
}

for(const mode of [1,2]){
  const fullYaw=submarinePilot(positive=>Number(positive==='KeyA'),mode).pilot[2];
  for(const axis of [0,1,2]){
    const goal=axis===2?fullYaw:mode===1?(axis===0?Math.PI/2:.24):.35;
    await stepResponse(mode,axis,goal);
  }
}
