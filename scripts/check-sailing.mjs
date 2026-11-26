import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
// A monohull may receive independent water measurements on its two sample
// lines. Verify that they can coincide, separate, and coincide again.
const hull=await loadInstance('Sailboat',{launchHeight:.069,windEast:5,windNorth:2,manualHelm:1},read);
hull.set('useSectionWater',1);
for(const rightLevel of [.015,.080,.015]){
  const water=[...Array(6).fill(.015),...Array(6).fill(rightLevel)];
  hull.set('previousWater',water);hull.set('sectionWater',water);hull.set('waterStamp',hull.time);
  hull.advance(.01);
  const volumes=hull.get('hydroSectionVolume'),stations=volumes.length/2;
  const difference=Math.max(...volumes.slice(0,stations).map((left,i)=>Math.abs(left-volumes[stations+i])));
  if(rightLevel===.015)assert.equal(difference,0);
  else assert(difference>.001,'Independent water lines produce different submerged volumes');
}

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
