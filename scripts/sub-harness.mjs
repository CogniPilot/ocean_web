import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));

export async function subHarness(){
  const [plant,nav]=await Promise.all([
    loadInstance('Wreck_Plant',{windSpeed:11,windDirection:.45},read),loadInstance('Wreck_Navigation',{},read)
  ]);
  let tick=0;
  function sample(){
    const pos=plant.get('position'),q=plant.get('orientation');
    nav.set('stamp',tick/100);
    nav.set('truth',[...pos,...q,...plant.get('velocity'),plant.get('yawRate'),plant.get('pressure'),
      ...plant.get('specificForce'),...plant.get('rates')]);
    const [sensor,elev,image,estimate,features,history]=nav.getMany([
      'sensor','elev','image','estimate','features','keyframes'
    ]);
    plant.set('sensor',sensor);plant.set('elevationRanges',elev);
    nav.set('priorImage',image);nav.set('prior',estimate);nav.set('keyHistory',history);
    return {pos,q,sensor,elev,image,estimate,features,history};
  }
  return {plant,nav,sample,step(count=20){for(let i=0;i<count;i++){plant.advance(.01);tick++;}}};
}
