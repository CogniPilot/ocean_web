// Drive the shipped race physics through a mark on the centreline, under either hull, and clear.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/sailing-runtime')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
function openRace(east,north,speed){
  return openFmuSession({index,base,fetch:fileFetch,parameters:{prevailingBearing:0,
    'boat.launchEast':east,'boat.launchNorth':north,'boat.launchSpeed':speed,'boat.launchHeading':0}});
}
async function run(offset,mark=1,launchSpeed=3.62,extraRunUp=0){
  const locations=[[-10,-26.5],[-210,-6.5],[-110,-6.5-100*Math.sqrt(3)]];
  const [east,north]=locations[mark-1];
  const session=await openRace(east-4-extraRunUp,north+offset,launchSpeed);
  try{
    session.set_inputs(JSON.stringify([['sailingManual',1],['windSpeed',0],['omitWake',1]]));
    const probe=session.bind_outputs(JSON.stringify(['boat.east','boat.ve',
      ...(mark===1?['race.pinEast','race.pinNorth']:['race.markEast['+(mark-1)+']','race.markNorth['+(mark-1)+']']),
      ...Array.from({length:12},(_,i)=>'race.markWrench['+mark+','+(i+1)+']')]));
    let peak=0,firstContact,shift=0,speed,impulseEast=0;
    for(let i=0;i<=200;i++){
      const [x,ve,markE,markN,...wrench]=session.read_bound(probe);
      assert([x,ve,markE,markN,...wrench].every(Number.isFinite));
      const force=Math.hypot(...wrench.slice(0,3));
      if(i===0)assert.equal(force,0);
      if(force>1)firstContact??=x-east;
      for(let axis=0;axis<3;axis++)assert(Math.abs(wrench[axis]+wrench[axis+6])<1e-8);
      peak=Math.max(peak,force);shift=Math.max(shift,Math.hypot(markE-east,markN-north));speed=ve;
      if(i<200){
        impulseEast+=.01*wrench[0];
        session.step(.01);
      }
    }
    return {mark,offset,firstContact,peak,impulseEast,shift,speed};
  }finally{session.free();}
}
const clear=await run(4),center=await run(0),port=await run(-1.02,2),starboard=await run(1.02,3);
console.table([clear,center,port,starboard]);
assert.equal(clear.peak,0);
for(const hit of [center,port,starboard]){
  assert(hit.peak>30 && hit.shift>.03);
  assert(hit.speed<clear.speed-.1);
}
assert(center.firstContact < -2, "Centerline mark must catch the bow bridle before it reaches the trampoline");

// Approach the committee launch from the same position with and without lateral clearance.
async function launchImpact(offset){
  const session=await openRace(-17,13.5+offset,4);
  try{
    session.set_inputs(JSON.stringify([['sailingManual',1],['windSpeed',0],['seaState',0],['omitWake',1]]));
    const probe=session.bind_outputs(JSON.stringify(['race.committeeEast','race.deckState[7]',
      'boat.sceneForce[1]','boat.committeeReaction[1]','boat.sceneContact[6]']));
    let peak=0,impulse=0,east,velocity;
    for(let i=0;i<300;i++){
      const [x,ve,force,reaction,normalForce]=session.read_bound(probe);
      assert(Math.abs(force+reaction)<1e-7);
      east=x;velocity=ve;peak=Math.max(peak,normalForce);impulse+=.01*reaction;
      session.step(.01);
    }
    return {peak,impulse,east,velocity};
  }finally{session.free();}
}
const launchClear=await launchImpact(7),launchHit=await launchImpact(0);
assert.equal(launchClear.peak,0);assert(launchHit.peak>50&&launchHit.impulse>0);
assert(launchHit.east>launchClear.east+.015&&launchHit.velocity>launchClear.velocity);
console.log({launchClear,launchHit});

if(process.argv.includes('--speed-sweep')){
  // Vary the arrival phase within one 50 ms contact period. These are
  // diagnostics for convergence, separate from the low-speed hit assertions.
  const launchSpeed=26*1852/3600;
  const distances=[0,.17,.33,.50];
  const results=[];
  for(const extraRunUp of distances){
    results.push({extraRunUp,...await run(0,1,launchSpeed,extraRunUp)});
  }
  console.table(results);
}
