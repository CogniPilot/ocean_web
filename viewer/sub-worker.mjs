import {loadInstance} from './fmi3/instance.mjs';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
const ready=Promise.all([
  loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45}),
  loadInstance('Wreck_Navigation',{useRaster:1})
]);
let tick=0, estimate, image, features;
let receiveRanges, mapRows, mappedKeys=-1, closures=-1;
self.addEventListener('message',({data})=>{
  if(data.scanResult)receiveRanges?.(data.ranges);
});
async function acquire(plant,nav){
  const pos=plant.get('position'),q=plant.get('orientation');
  const rangesReady=new Promise(resolve=>{receiveRanges=resolve;});
  self.postMessage({scan:true,pos,q,beams:tick===0?nav.get('beam'):undefined});
  const rangesInput=await rangesReady;
  if(rangesInput)nav.set('raster',rangesInput);
  nav.set('useRaster',rangesInput?1:0);
  receiveRanges=null;
  nav.set('stamp',tick*.01);
  nav.set('truth',[...plant.get('position'),...plant.get('orientation'),
    ...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
    ...plant.get('specificForce'),...plant.get('rates')]);
  const sensor=nav.get('sensor'),ranges=nav.get('elev');
  image=nav.get('image'); features=nav.get('features'); estimate=nav.get('estimate');
  const history=nav.get('keyframes');
  if(estimate[12]!==mappedKeys||estimate[13]!==closures){
    mappedKeys=estimate[12];closures=estimate[13];
    mapRows=Float32Array.from(history.slice(0,mappedKeys*180));
  }
  plant.set('sensor',sensor);plant.set('elevationRanges',ranges);
  nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
}
self.onmessage=async({data})=>{
  if(data.scanResult)return;
  try{
    const [plant,nav]=await ready;
    plant.set('manual',Number(data.manual));plant.set('pilot',data.pilot);
    plant.set('windSpeed',data.wind);plant.set('windDirection',data.bearing);
    for(let i=0;i<data.steps;i++){
      if(tick%20===0)await acquire(plant,nav);
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
