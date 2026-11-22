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

const automatic=[];
for(const side of [-1,1]){
  const boat=await reach(15,55*side);
  const offset=side*boat.get('ballastY'),limit=boat.get('ballastTrapezeReach');
  assert(offset>limit-.05&&offset<=limit+1e-8,'Loaded auto trim reaches the windward trapeze');
  automatic.push(side*offset);

  boat.set('ballastManual',1);
  boat.set('ballastCmdY',5*side);
  for(let i=0;i<350;i++)boat.advance(.02);
  assert(Math.abs(boat.get('ballastY')-.84*side)<.001,'Manual trim stays within its deck range');
}
console.log({light:light.get('ballastY'),automatic});
