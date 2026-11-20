import {loadInstance} from './fmi3/instance.mjs?api=2';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
const ready=Promise.all([
  loadInstance('Wreck_Plant',{manual:1,windSpeed:11,windDirection:.45}),
  loadInstance('Wreck_Navigation',{})
]);
let tick=0, estimate, image, features;
let mapRows, mappedKeys=-1, closures=-1;
function acquire(plant,nav){
  nav.set('stamp',tick*.01);
  const [position,orientation,velocity,yawRate,pressure,accel,rates]=plant.getMany(
    ['position','orientation','velocity','yawRate','pressure','specificForce','rates']);
  nav.set('truth',[...position,...orientation,...velocity,yawRate,pressure,...accel,...rates]);
  const names=[
    'sensor','elev','image','features','estimate','keyframes'
  ];
  const [sensor,ranges,pixels,corners,pose,history]=nav.getMany?nav.getMany(names):names.map(name=>nav.get(name));
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
    const previousImage=image;
    for(let i=0;i<data.steps;i++){
      if(tick%20===0)acquire(plant,nav);
      plant.advance(.01);tick++;
    }
    const [survey,position,q,rpm,cavitation,flow]=plant.getMany(
      ['surveyTelemetry','position','orientation','propellerRPM','cavitation','current']);
    self.postMessage({waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,
      thrust:survey.slice(3,10),buoyancy:survey.slice(10,13),contact:survey.slice(13,16),mapRows,
      time:tick*.01,position,q,rpm,cavitation,flow,
      ...(previousImage===image?{}:{estimate,image,features})},mapRows?[mapRows.buffer]:[]);
    mapRows=undefined;
  }catch(error){self.postMessage({error:error.message});}
};
