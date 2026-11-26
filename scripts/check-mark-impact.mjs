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
// The cruiser uses its normal helm, propulsion and spawn parameters. Use the
// published course coordinates, so this covers the default wind and layout.
if(index.modelName==='OceanMotorboat'){
  const open=parameters=>openFmuSession({index,base,fetch:fileFetch,downloadFirst:true,parameters});
  const resting=await open({});
  const mark=1,heading=resting.read_bound(resting.bind_outputs('["boatPose[6]"]'))[0];
  const pin=Array.from(resting.read_bound(resting.bind_outputs('["race.pinEast","race.pinNorth"]')));
  resting.free();
  const f=[Math.cos(heading),Math.sin(heading)],port=[-f[1],f[0]],dt=.02;
  async function motorApproach(clearance){
    const start=pin.map((v,i)=>v-5.7*f[i]+clearance*port[i]);
    const session=await open({initialEast:start[0],initialNorth:start[1]});
    try{
      session.set_inputs(JSON.stringify([['throttleLever',1],['helmLever',0],['windSpeed',0],['seaState',0],['omitWake',1]]));
      const cols=['race.pinEast','race.pinNorth','boatPose[1]','boatPose[2]',
        ...Array.from({length:12},(_,i)=>'race.markWrench['+mark+','+(i+1)+']'),
        ...Array.from({length:6},(_,i)=>'race.racerLoad['+(i+1)+']'),
        ...Array.from({length:3},(_,i)=>'race.markPose['+mark+','+(i+1)+']')];
      const stream=session.bind_outputs(JSON.stringify(cols));
      let peak=0,alongImpulse=0,initialLoad,track=[];
      for(let i=0;i<=400;i++){
        const values=Array.from(session.read_bound(stream));
        assert(values.every(Number.isFinite));
        const [px,py,east,north]=values,w=values.slice(4,16),sum=values.slice(16,22);
        for(let j=0;j<3;j++)assert(Math.abs(w[j]+w[j+6])<1e-7,'Opposite contact forces');
        for(let j=0;j<6;j++)assert(Math.abs(w[j]-sum[j])<1e-7,'Contact reaches the cruiser load');
        const force=Math.hypot(...w.slice(0,3));
        if(i===0)initialLoad=force;
        peak=Math.max(peak,force);alongImpulse+=dt*(w[0]*f[0]+w[1]*f[1]);
        track.push([px,py,east-start[0],north-start[1],...values.slice(22)]);
        if(i<400)session.step(dt);
      }
      assert(initialLoad<1e-7);
      return {peak,alongImpulse,track};
    }finally{session.free();}
  }
  const hit=await motorApproach(0),clear=await motorApproach(5);
  const difference=(i,j)=>hit.track[i][j]-clear.track[i][j];
  const markShift=Math.max(...hit.track.map((_,i)=>Math.hypot(difference(i,0),difference(i,1))));
  const markTilt=Math.max(...hit.track.map((_,i)=>Math.hypot(difference(i,5),difference(i,6))));
  const lostTravel=Math.max(...hit.track.map((_,i)=>-difference(i,2)*f[0]-difference(i,3)*f[1]));
  console.log({heading,pin,clearPeakN:clear.peak,hitPeakN:hit.peak,forwardImpulseNs:hit.alongImpulse,markShiftM:markShift,markTiltRad:markTilt,lostTravelM:lostTravel});
  assert(clear.peak<1e-7,'Five-metre lateral clearance must miss the mark');
  assert(hit.peak>30&&hit.alongImpulse<-1,'Bow impact should retard the cruiser');
  assert(markShift>.04&&markTilt>.005&&lostTravel>.003,'Both the visible mark and the cruiser must respond');
  process.exit(0);
}
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
