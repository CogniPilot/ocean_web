import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const read=async url=>new Response(await readFile(url));
async function setting(speed,angle,extra={}){
  const bow=angle*Math.PI/180;
  const boat=await loadInstance('Hobie16',{launchHeading:0,manualHelm:0,
    windEast:-speed*Math.cos(bow),windNorth:-speed*Math.sin(bow),...extra},read);
  const [main,jib,payout,line,min,max]=boat.getMany(['mainCarTarget','jibCarTarget','autoPayout','travelerCommand','travelerMinLine','travelerMaxLine']);
  return {main,jib,payout,ease:(line-min)/(max-min)};
}
const light=await setting(3,50),moderate=await setting(8,50),gust=await setting(15,50);
const heavyCrew=await setting(15,50,{ballastMass:135});
const otherTack=await setting(8,-50),downwind=await setting(8,150);
const manual=await setting(8,50,{deckManual:1,mainCarInput:.66,jibCarInput:.72});
console.log({light,moderate,gust,heavyCrew,otherTack,downwind,manual});
assert(light.main<.03&&Math.abs(light.jib-.18)<1e-9);
assert(moderate.main<.03,'Automatic upwind trim keeps the main centered in moderate wind');
assert(moderate.jib>.18&&moderate.jib<.38);
assert(gust.main>.15&&gust.main<.25&&gust.jib>moderate.jib,'Heavy-air upwind trim travels out by part of the rail');
assert(Math.abs(gust.payout-.030)<1e-9,'Automatic upwind trim hauls the main with enough lead for the battens to twist');
assert(heavyCrew.main<gust.main&&heavyCrew.jib<gust.jib);
assert.deepEqual(otherTack,moderate);
assert(downwind.main>.8&&downwind.jib>.8);
assert(Math.abs(manual.ease-.66)<1e-9);
assert.equal(manual.jib,.72);

async function rig(windNorth,step=.01){
  const boat=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
    launchSpeed:windNorth?2:0,manualHelm:1,deckManual:1,jibCarInput:.40,jibTrimInput:.07,
    windEast:windNorth?-6:0,windNorth},read);
  const advance=seconds=>{
    for(let t=0;t<Math.round(seconds/step);t++)boat.advance(step);
    assert(boat.getMany(['mainCar','travelerVelocity','travelerTension','heel']).every(Number.isFinite));
  };
  return {boat,advance};
}
const {boat:calm,advance:advanceCalm}=await rig(0);
advanceCalm(2);
calm.set('mainCarInput',1);
advanceCalm(2.5);
assert(calm.get('travelerEase')>.97&&calm.get('travelerTension')===0);
assert(Math.abs(calm.get('mainCar'))<.025,'Easing an unloaded traveler cannot drive the car sideways');

for(const [windNorth,step] of [[-6,.01],[6,.02]]){
  const {boat,advance}=await rig(windNorth,step);
  advance(3);
  const [initial,jib,working,loads,pins,spans,purchase]=boat.getMany([
    'mainCar','jibCar','jibWorkingSide','jibSheetLoads','jibSheetPins','lineSpan','jibPurchase'
  ]);
  assert.equal(purchase,2);
  const selected=working>0?0:1;
  assert(loads[selected]>1&&loads[1-selected]===0,'The working clew block carries the load and the lazy sheet is slack');
  const clewLeg=i=>Math.hypot(...Array.from({length:3},(_,k)=>pins[3*i+k]-pins[k]));
  for(let i=0;i<2;i++){
    const expected=(clewLeg(2*i+1)+clewLeg(2*i+2))/2;
    assert(Math.abs(spans[i+1]-expected)<1e-10,'Both legs through the clew block determine the physical span');
  }
  boat.set('mainCarInput',1);
  advance(2.7);
  const released=boat.get('mainCar');
  assert(working*released>working*initial+.2,'Sheet load moves the released traveler leeward');
  assert(Math.abs(released)<.93,'The car stays on the rail');
  assert(Math.abs(boat.get('jibCar')-jib)<.001&&Math.abs(boat.get('jibSheet')-.07)<.001,
    'The traveler line and jib controls are independent');
  boat.set('jibTrimInput',1);
  advance(2.4);
  assert(boat.get('jibSheetLoads').every(load=>load===0),'An eased jib has no sheet tension');
  boat.set('mainCarInput',0);
  boat.set('jibTrimInput',.07);
  advance(3.5);
  const [hauled,tension,newLoads]=boat.getMany(['mainCar','travelerTension','jibSheetLoads']);
  assert(Math.abs(hauled)<Math.abs(released)/3&&tension>0,'Hauling the line pulls the car inboard');
  assert(newLoads[selected]>1&&newLoads[1-selected]===0,'Only the working jib sheet loads when hauled');
  console.log({windNorth,step,initial,released,hauled,tension,jibTailLoad:newLoads[selected]});
}

const {boat:tacking,advance:advanceTack}=await rig(-6);
advanceTack(3);
assert(tacking.get('jibSheetLoads')[1]>1);
tacking.set('windNorth',6);
advanceTack(3);
const [portLoad,starboardLoad]=tacking.get('jibSheetLoads');
assert(portLoad>1&&starboardLoad===0,'The load transfers to the opposite jib sheet when the wind crosses the bow');
