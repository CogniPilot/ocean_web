// Paired, isolated beam-reach starts on the shipping Hobie plant.
// The course adapter exposes the same fields as the fleet worker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {raceController,hobieControllers} from '../viewer/hobie-race-policies.mjs';
globalThis.fetch=async url=>new Response(await readFile(url));
const duration=35,dt=.05,distance=30;
const scenarios=[['steady',0,1],['shifts',.38,1],['opposite tack',.38,-1]];
for(const [weather,amplitude,tack] of scenarios){
  for(const mode of Object.keys(hobieControllers)){
    const rl=mode==='rl',start=[-900,-200],goal=[start[0]+distance,start[1]];
    const boat=await loadInstance('Hobie16',{launchEast:start[0],launchNorth:start[1],launchSpeed:2,launchHeading:0,
      launchHeight:.20,windEast:0,windNorth:-8*tack,currentEast:0,currentNorth:0,raceGoal:[1,...goal],
      manualHelm:Number(rl),deckManual:Number(rl),ballastManual:Number(rl),manualJibAssist:0});
    const keys=['rudderInput','trimInput','mainCarInput','jibCarInput','jibTrimInput','downhaulInput','outhaulInput','jibHalyardInput','ballastCmdX','ballastCmdY'];
    function get(key){
      if(key==='course')return Math.atan2(goal[1]-boat.get('north'),goal[0]-boat.get('east'));
      if(key==='goal')return goal;
      if(key==='pose')return boat.getMany(['east','north','heave','heading','surge','ve','vn','yawRate']);
      return boat.get(key.replace(/^boat\./,''));
    }
    const adapter={get,getMany:keys=>keys.map(get),get time(){return boat.time;},set:(key,value)=>{
      if(key==='actuators')value.forEach((v,i)=>boat.set(keys[i],v));
      else if(key==='predictedHeading')boat.set('tacticalCourse',[1,value,1]);
      else throw Error('Unexpected race command '+key);
    }};
    const pilot=await raceController(mode);
    let previous=0,crossing=null,previousNorth=0;
    try{
      for(let k=0;k<duration/dt;k++){
        const t=k*dt,angle=tack*Math.PI/2+amplitude*(Math.sin(.31*t)+.35*Math.sin(.73*t));
        const wind=8+amplitude*3*Math.sin(.43*t);
        boat.set('windEast',-wind*Math.cos(angle));boat.set('windNorth',-wind*Math.sin(angle));
        pilot.step(adapter);boat.advance(dt);
        const east=boat.get('east')-start[0],north=boat.get('north')-start[1];
        assert(Number.isFinite(east)&&Number.isFinite(north));
        if(previous<distance&&east>=distance){
          const f=(distance-previous)/(east-previous);
          if(Math.abs(previousNorth+f*(north-previousNorth))<=12){crossing=t+dt*f;break;}
        }
        previous=east;previousNorth=north;
      }
      console.log(JSON.stringify({weather,mode,finishSeconds:crossing,east:boat.get('east')-start[0],north:boat.get('north')-start[1]}));
    }finally{pilot.close();boat.close();}
  }
}
