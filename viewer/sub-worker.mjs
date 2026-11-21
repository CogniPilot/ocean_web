import {loadInstance} from './fmi3/instance.mjs?api=2';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
const ready=Promise.all([
  loadInstance('Wreck_Plant',{manual:1,windSpeed:11,windDirection:.45}),
  loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0})
]);
let tick=0, estimate, image, features, ping, dvl, sentImage;
let mapRows, mappedKeys=-1, closures=-1;
const blankImage=new Float64Array(864);
function acquire(plant,nav,active){
  nav.set('stamp',tick*.01);
  const [position,orientation,velocity,yawRate,pressure,accel,rates]=plant.getMany(
    ['position','orientation','velocity','yawRate','pressure','specificForce','rates']);
  nav.set('truth',[...position,...orientation,...velocity,yawRate,pressure,...accel,...rates]);
  const names=active?['sensor','elev','estimate','image','features','keyframes','ping']:['sensor','elev','estimate'];
  const [sensor,ranges,pose,pixels,corners,history,echoes]=nav.getMany(names);
  estimate=pose;dvl=sensor;
  plant.set('sensor',sensor);plant.set('elevationRanges',ranges);
  nav.set('prior',estimate);
  if(active){
    nav.set('priorImage',pixels);nav.set('keyHistory',history);
    if(estimate[12]!==mappedKeys||estimate[13]!==closures){
      mappedKeys=estimate[12];closures=estimate[13];
      mapRows=Float32Array.from(history.slice(0,mappedKeys*180));
    }
  }else if(image){
    nav.set('priorImage',blankImage);
  }
  image=pixels;features=corners;ping=echoes;
}
self.onmessage=async({data})=>{
  try{
    const [plant,nav]=await ready;
    plant.set('manual',Number(data.manual));plant.set('pilot',data.pilot);
    plant.set('windSpeed',data.wind);plant.set('windDirection',data.bearing);
    nav.set('idleCamera',Number(!data.active));nav.set('useSonar',Number(data.active||!data.manual));
    const previousEstimate=estimate;
    for(let i=0;i<data.steps;i++){
      if(tick%20===0)acquire(plant,nav,data.active);
      plant.advance(.01);tick++;
    }
    const [survey,position,q,rpm,cavitation,flow]=plant.getMany(
      ['surveyTelemetry','position','orientation','propellerRPM','cavitation','current']);
    self.postMessage({waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,
      thrust:survey.slice(3,10),buoyancy:survey.slice(10,13),contact:survey.slice(13,16),mapRows,
      time:tick*.01,position,q,rpm,cavitation,flow,
      ...(previousEstimate!==estimate?{estimate}:{}),
      ...(data.showSensorImage && sentImage!==image?{image,features,ping,dvl}:{})},mapRows?[mapRows.buffer]:[]);
    sentImage=data.showSensorImage?image:undefined;
    mapRows=undefined;
  }catch(error){self.postMessage({error:error.message});}
};
