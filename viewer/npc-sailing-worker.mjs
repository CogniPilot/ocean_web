import {loadInstance} from './fmi3/instance.mjs';
import {readRacerFrame} from './npc-sailing-frame.mjs';

const models=new Map();
self.onmessage=async({data})=>{
  try{
    const {racers,utc,traffic,step}=data;
    const active=new Set(racers.map(racer=>racer.id));
    for(const id of models.keys())if(!active.has(id))models.delete(id);
    const frames=[];
    for(const racer of racers){
      let model=models.get(racer.id);
      if(!model){
        model=await loadInstance('HobieFleetPilot',racer.initial);
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
      model.set('utc',utc);
      model.set('seaHeight',racer.water);
      model.set('windEast',racer.wind[0]);
      model.set('windNorth',racer.wind[1]);
      for(let j=0;j<step;j++)model.advance(.05);
      frames.push({id:racer.id,data:readRacerFrame(model)});
    }
    self.postMessage({frames});
  }catch(error){self.postMessage({error:error.message});}
};
