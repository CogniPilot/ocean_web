// Compare a hauled, loaded edge with the same edge after releasing the purchase.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
for(const trim of [-1,1]){
  const boat=await loadInstance('Hobie16',{windEast:5.5,windNorth:11,launchSpeed:2.4,launchHeading:0,
  launchHeight:.2,deckManual:1,manualHelm:1},async url=>new Response(await readFile(url)));
  boat.set('trimInput',trim);
  let speed=0,maxLoad=0;
  for(let i=0;i<(trim<0?800:350);i++){
    boat.advance(.01);
    if(i>=300){
      speed=Math.max(speed,boat.get('leechSpeed')[0]);
      maxLoad=Math.max(maxLoad,boat.get('leechLoad'));
    }
  }
  console.log({trim,peakLeechSpeed:speed,peakLeechTension:maxLoad});
  if(trim<0)assert(maxLoad>100 && speed<1.5,'loaded sail edge oscillated');
  else assert(boat.get('mainTension')===0 && speed>.15,'an eased sail should remain free to move');
}
