import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
// Course qualification in steady wind and flat water isolates the onboard pilot.
const boat=await loadInstance('Sailboat',{launchHeight:.069,windEast:10,windNorth:4,
  currentEast:.2,currentNorth:.04,manualHelm:0,vangInput:.5},read);
const legs=[boat.get('leg')];let tack=boat.get('tack'),tacks=0,peakCamber=0;
for(let i=0;i<6000;i++){
  for(let n=0;n<10;n++)boat.advance(.01);
  const leg=boat.get('leg'),side=boat.get('tack');
  if(leg!==legs.at(-1))legs.push(leg);
  else if(tack!==side)tacks++;
  tack=side;
  peakCamber=Math.max(peakCamber,...boat.get('sailVertex').filter((_,i)=>i%3===1).map(Math.abs));
  if(legs.join(',').includes('1,2,3,1')&&tacks)break;
}
console.log({legs,tacks,peakCamber,time:boat.time});
assert(legs.join(',').includes('1,2,3,1')&&tacks>0&&peakCamber>0);
