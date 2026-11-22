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
  const [main,jib,payout]=boat.getMany(['mainCarTarget','jibCarTarget','autoPayout']);
  return {main:Math.abs(main),jib,payout};
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
assert.equal(manual.main,.66);
assert.equal(manual.jib,.72);

for(const windNorth of [-1.5,1.5]){
  const boat=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
    launchSpeed:1,manualHelm:1,deckManual:1,jibCarInput:.65,windEast:-1.5,windNorth},read);
  for(let step=0;step<500;step++)boat.advance(.01);
  const leeward=boat.get('windSide'),jib=boat.get('jibCar');
  boat.set('mainCarInput',.9*leeward);
  let easeTime;
  for(let step=1;step<=280;step++){
    boat.advance(.01);
    if(easeTime===undefined&&leeward*boat.get('mainCar')>=.855)easeTime=step*.01;
  }
  const released=boat.get('mainCar');
  assert(easeTime>.50&&easeTime<.70,'Manual ease reaches 95% travel in under 0.70 s');
  assert(leeward*released<=.9+1e-8,'The traveler stays on the rail');
  boat.set('mainCarInput',released-.8*leeward);
  let haulTime;
  for(let step=1;step<=270;step++){
    boat.advance(.01);
    if(haulTime===undefined&&leeward*(released-boat.get('mainCar'))>=.76)haulTime=step*.01;
  }
  assert(haulTime>2.00&&haulTime<2.25,'Windward trim keeps its finer speed');
  assert(Math.abs(boat.get('jibCar')-jib)<.001,'The jib travelers are independent');
  console.log({windNorth,easeTime,haulTime});
}

async function loadedReach(ease){
  const angle=.92,wind=14;
  const boat=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
    launchSpeed:3.5,manualHelm:1,deckManual:1,jibCarInput:.32,windEast:-wind*Math.cos(angle),
    windNorth:-wind*Math.sin(angle),trimInput:-1,ballastManual:1,ballastCmdY:.5},read);
  for(let step=0;step<80;step++)boat.advance(.01);
  boat.set('trimInput',0);
  if(ease)boat.set('mainCarInput',.9*boat.get('windSide'));
  let peakHeel=0;
  for(let step=0;step<150;step++){
    boat.advance(.01);
    peakHeel=Math.max(peakHeel,Math.abs(boat.get('heel')));
  }
  return peakHeel;
}

const heldHeel=await loadedReach(false),easedHeel=await loadedReach(true);
assert(easedHeel<.65*heldHeel,'Quick traveler release arrests the heel on a loaded reach');
console.log({heldHeel,easedHeel});
