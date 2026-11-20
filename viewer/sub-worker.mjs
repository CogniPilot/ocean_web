import {loadInstance} from './fmi3/instance.mjs';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
const ready=Promise.all([
  loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45}),
  loadInstance('Wreck_Navigation',{})
]);
let tick=0, estimate, image, features;
let receiveRanges;
self.addEventListener('message',({data})=>{
  if(data.ranges)receiveRanges?.(data.ranges);
});
async function acquire(plant,nav){
  const pos=plant.get('position'),q=plant.get('orientation');
  const rangesReady=new Promise(resolve=>{receiveRanges=resolve;});
  self.postMessage({scan:true,pos,q,beams:tick===0?nav.get('beam'):undefined});
  nav.set('raster',await rangesReady);nav.set('useRaster',1);
  receiveRanges=null;
  nav.set('stamp',tick*.01);
  nav.set('truth',[...plant.get('position'),...plant.get('orientation'),
    ...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
    ...plant.get('specificForce'),...plant.get('rates')]);
  const sensor=nav.get('sensor'),ranges=nav.get('elev');
  image=nav.get('image'); features=nav.get('features'); estimate=nav.get('estimate');
  const history=nav.get('keyframes');
  plant.set('sensor',sensor);plant.set('elevationRanges',ranges);
  nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
}
self.onmessage=async({data})=>{
  if(data.ranges)return;
  try{
    const [plant,nav]=await ready;
    plant.set('manual',Number(data.manual));plant.set('pilot',data.pilot);
    plant.set('windSpeed',data.wind);plant.set('windDirection',data.bearing);
    for(let i=0;i<data.steps;i++){
      if(tick%20===0)await acquire(plant,nav);
      plant.advance(.01);tick++;
    }
    self.postMessage({time:tick*.01,position:plant.get('position'),q:plant.get('orientation'),
      rpm:plant.get('propellerRPM'),cavitation:plant.get('cavitation'),flow:plant.get('current'),
      estimate,image,features});
  }catch(error){self.postMessage({error:error.message});}
};
