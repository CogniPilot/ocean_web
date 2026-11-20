import {loadInstance} from './fmi3/instance.mjs';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
const ready=Promise.all([
  loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45}),
  loadInstance('Wreck_Navigation',{})
]);
let tick=0, estimate, image, features;
let mapRows, mappedKeys=-1, closures=-1;
function acquire(plant,nav){
  nav.set('stamp',tick*.01);
  nav.set('truth',[...plant.get('position'),...plant.get('orientation'),
    ...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
    ...plant.get('specificForce'),...plant.get('rates')]);
  const [sensor,ranges,pixels,corners,pose,history]=nav.getMany([
    'sensor','elev','image','features','estimate','keyframes'
  ]);
  image=pixels;features=corners;estimate=pose;
  if(estimate[12]!==mappedKeys||estimate[13]!==closures){
    mappedKeys=estimate[12];closures=estimate[13];
    mapRows=Float32Array.from(history.slice(0,mappedKeys*180));
  }
  plant.set('sensor',sensor);plant.set('elevationRanges',ranges);
  nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
}
self.onmessage=async({data})=>{
  try{
    const [plant,nav]=await ready;
    plant.set('manual',Number(data.manual));plant.set('pilot',data.pilot);
    plant.set('windSpeed',data.wind);plant.set('windDirection',data.bearing);
    for(let i=0;i<data.steps;i++){
      if(tick%20===0)acquire(plant,nav);
      plant.advance(.01);tick++;
    }
    const survey=plant.get('surveyTelemetry');
    self.postMessage({waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,
      thrust:survey.slice(3,10),buoyancy:survey.slice(10,13),contact:survey.slice(13,16),mapRows,
      time:tick*.01,position:plant.get('position'),q:plant.get('orientation'),
      rpm:plant.get('propellerRPM'),cavitation:plant.get('cavitation'),flow:plant.get('current'),
      estimate,image,features},mapRows?[mapRows.buffer]:[]);
    mapRows=undefined;
  }catch(error){self.postMessage({error:error.message});}
};
