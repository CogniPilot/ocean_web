import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

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
assert(moderate.main>.10&&moderate.main<.305);
assert(moderate.jib>.18&&moderate.jib<.38);
assert(gust.main>.4&&gust.main<.56&&gust.jib>moderate.jib);
assert(Math.abs(gust.payout-.012)<1e-9,'Automatic upwind trim should haul the main tight in a gust');
assert(heavyCrew.main<gust.main&&heavyCrew.jib<gust.jib);
assert.deepEqual(otherTack,moderate);
assert(downwind.main>.8&&downwind.jib>.8);
assert.equal(manual.main,.66);
assert.equal(manual.jib,.72);
