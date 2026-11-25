// Exercise the actual automatic ballast and the manual clamp in flat water.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const read=async url=>new Response(await readFile(url));

async function reach(speed,bearing){
  const angle=bearing*Math.PI/180;
  const boat=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
    launchSpeed:3,launchHeight:.09,manualHelm:1,downhaulInput:.5,outhaulInput:.65,
    windEast:-speed*Math.cos(angle),windNorth:-speed*Math.sin(angle)},read);
  for(let i=0;i<600;i++)boat.advance(.02);
  return boat;
}

const light=await reach(4,70);
assert(Math.abs(light.get('ballastY'))<.10,'Light-wind auto trim stays near the centreline');

// Cross from one rail to the other in manual trim, with no wind or capsize recovery.
const crew=await loadInstance('Hobie16',{launchHeight:.09,launchSpeed:0,windEast:0,windNorth:0,
  manualHelm:1,ballastManual:1,ballastCmdY:-2.1},read);
for(let i=0;i<250;i++)crew.advance(.02);
assert(crew.get('ballastY')<-2.09);
crew.set('ballastCmdY',2.1);
crew.advance(.02);
assert(crew.get('ballastY')<-2,'A manual command moves the crew continuously');
for(let i=1;i<140;i++)crew.advance(.02);
assert(crew.get('ballastY')>2,'Manual crew crosses to within 10 cm of the opposite rail in 2.8 s');

const automatic=[];
for(const side of [-1,1]){
  const boat=await reach(15,55*side);
  const offset=side*boat.get('ballastY'),limit=boat.get('ballastTrapezeReach');
  assert(offset>limit-.05&&offset<=limit+1e-8,'Loaded auto trim reaches the windward trapeze');
  automatic.push(side*offset);

  boat.set('ballastManual',1);
  boat.set('ballastCmdY',5*side);
  for(let i=0;i<350;i++)boat.advance(.02);
  assert(Math.abs(boat.get('ballastY')-limit*side)<.001,'Manual trim reaches and clamps at the trapeze limit');
}
console.log({light:light.get('ballastY'),automatic});

for(const sign of [-1,1]){
  const boat=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
    launchSpeed:4,launchHeight:.24,launchPitch:.20*sign,launchPitchRate:.20*sign,
    manualHelm:1,windEast:0,windNorth:0},read);
  assert(sign*boat.get('targetX')<-.10,'Automatic trim opposes the momentary pitch rate');
  boat.advance(.02);
  assert(sign*boat.get('ballastX')<0,'Ballast moves to counter the pitch');
}

const lowBow={launchEast:-140,launchNorth:-80,launchHeading:0,launchHeight:.10,
  launchPitch:.11,manualHelm:1,windEast:0,windNorth:0};
const stationary=await loadInstance('Hobie16',{...lowBow,launchSpeed:0},read);
const fast=await loadInstance('Hobie16',{...lowBow,launchSpeed:7},read);
const [clearance,reserve,immersion,target]=fast.getMany(['bowClearance','bowClearanceReserve','deckImmersion','targetX']);
assert(clearance>0&&clearance<.08&&immersion===0,'The low bow is still dry');
assert(reserve>stationary.get('bowClearanceReserve')+.09,'Forward speed raises the dry reserve');
assert(target<-.5&&target<stationary.get('targetX')-.4,'Automatic trim moves aft before the deck is wet');
fast.advance(.02);
assert(fast.get('ballastX')<0,'Automatic ballast carriage responds to the dry foredeck');

const manual=await loadInstance('Hobie16',{...lowBow,launchSpeed:7,ballastManual:1,ballastCmdX:.65},read);
assert(Math.abs(manual.get('targetX')-.65)<1e-8,'Manual fore-aft ballast retains control');
