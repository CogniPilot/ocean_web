import {readFile} from 'node:fs/promises';
import {loadInstance as defaultLoad} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));

export async function subHarness(parameters={},loadInstance=defaultLoad){
  const [plant,nav]=await Promise.all([
    loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45,...parameters},read),loadInstance('Wreck_Navigation',{},read)
  ]);
  let tick=0,lastGyro=[0,0,0];
  function sample(){
    const pos=plant.get('position'),q=plant.get('orientation');
    nav.set('stamp',tick/100);
    const gyro=plant.get('gyroAngle'),rates=gyro.map((value,i)=>(value-lastGyro[i])/.2);lastGyro=gyro;
    nav.set('truth',[...pos,...q,...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
      ...plant.get('specificForce'),...rates]);
    const [sensor,elev,image,estimate,features,history]=nav.getMany([
      'sensor','elev','image','estimate','features','keyframes'
    ]);
    plant.set('sensor',sensor);plant.set('elevationRanges',elev);
    plant.set('navigationUp',estimate[2]);plant.set('navigationUpValid',1);
    nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
    return {pos,q,sensor,elev,image,estimate,features,history};
  }
  return {plant,nav,sample,step(count=20){for(let i=0;i<count;i++){plant.advance(.01);tick++;}}};
}
