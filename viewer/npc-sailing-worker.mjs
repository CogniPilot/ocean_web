import {loadInstance} from './fmi3/instance.mjs';
import {readRacerFrame} from './npc-sailing-frame.mjs';

import {raceController} from './hobie-race-policies.mjs';

const models=new Map();
self.onmessage=async({data})=>{
  try{
    const {racers,utc,traffic,step,sea,coursePoints,courseGateEnds}=data;
    const incident=sea?{incidentSea:1,seaTide:sea.tide,seaTile:sea.tile,swellSample:sea.swell}:{incidentSea:0};
    const active=new Set(racers.map(racer=>racer.id));
    for(const [id,entry] of models)if(!active.has(id)){entry.model.close();entry.pilot.close();models.delete(id);}
    const frames=[];
    for(const racer of racers){
      self.postMessage({started:racer.id});
      let entry=models.get(racer.id);
      if(!entry){
        const kind=racer.controller??'vmg';
        const pilot=await raceController(kind,racer.weights);
        const model=await loadInstance('HobieFleetPilot',{...racer.initial,learnedHelm:Number(kind==='rl'),predictiveHelm:Number(kind==='mppi'||kind==='nmpc'),...incident,...(coursePoints?{externalCourse:1,coursePoints}:{}),seaHeight:racer.water},
          undefined,courseGateEnds?{courseGateEnds}:{});
        entry={model,pilot};models.set(racer.id,entry);
      }
      const started=performance.now();
      const {model,pilot}=entry;
      const nearby=new Float64Array(90),attitude=new Float64Array(20);
      let index=0;
      for(const row of traffic){
        if(row.id===racer.id||index===10)continue;
        nearby.set(row.pose,9*index);
        attitude.set(row.tilt,2*index);
        index++;
      }
      if(coursePoints){model.set('coursePoints',coursePoints);model.set('externalCourse',1);}
      if(courseGateEnds&&model.has('courseGateEnds'))model.set('courseGateEnds',courseGateEnds);
      model.set('traffic',nearby);model.set('trafficTilt',attitude);
      model.set('raceStart',racer.raceStart);
      model.set('seaRoll',racer.roll);model.set('seaPitch',racer.pitch);
      for(const [name,value] of Object.entries(incident))model.set(name,value);
      model.set('swellSampleTime',model.time+.05*step);
      model.set('seaHeight',racer.water);
      model.set('windEast',racer.wind[0]);
      model.set('windNorth',racer.wind[1]);
      for(let j=0;j<step;j++){
        model.set('utc',utc-.05*(step-j-1));
        pilot.step(model);
        model.advance(.05);
      }
      const frame={id:racer.id,data:readRacerFrame(model),
        forestay:model.has('boat.forestayPath')?model.get('boat.forestayPath'):undefined,
        mastRotation:model.has('boat.mastRotation')?model.get('boat.mastRotation'):undefined};
      frames.push({...frame,computeMs:performance.now()-started});
    }
    self.postMessage({frames});
  }catch(error){self.postMessage({error:error.message});}
};
