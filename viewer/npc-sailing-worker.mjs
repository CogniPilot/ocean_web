import {loadInstance} from './fmi3/instance.mjs';
import {readRacerFrame} from './npc-sailing-frame.mjs';

const models=new Map();
self.onmessage=async({data})=>{
  try{
    const {racers,utc,traffic,step,sea}=data;
    const incident=sea?{incidentSea:1,seaTide:sea.tide,seaTile:sea.tile,swellSample:sea.swell}:{incidentSea:0};
    const active=new Set(racers.map(racer=>racer.id));
    for(const id of models.keys())if(!active.has(id))models.delete(id);
    const frames=[];
    for(const racer of racers){
      let model=models.get(racer.id);
      if(!model){
        model=await loadInstance('HobieFleetPilot',{...racer.initial,...incident,seaHeight:racer.water});
        models.set(racer.id,model);
      }
      const nearby=new Float64Array(90),attitude=new Float64Array(20);
      let index=0;
      for(const row of traffic){
        if(row.id===racer.id||index===10)continue;
        nearby.set(row.pose,9*index);
        attitude.set(row.tilt,2*index);
        index++;
      }
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
        model.advance(.05);
      }
      frames.push({id:racer.id,data:readRacerFrame(model),
        forestay:model.has('boat.forestayPath')?model.get('boat.forestayPath'):undefined,
        mastRotation:model.has('boat.mastRotation')?model.get('boat.mastRotation'):undefined});
    }
    self.postMessage({frames});
  }catch(error){self.postMessage({error:error.message});}
};
