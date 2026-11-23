import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {pilotSticks} from '../viewer/keyboard-sticks.mjs';
const up=pilotSticks(key=>Number(key==='ArrowUp'));
const right=pilotSticks(key=>Number(key==='ArrowRight'));
assert.deepEqual([up.pitch,up.roll,right.pitch,right.roll],[1,0,0,1]);
const drone=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0},async u=>new Response(await readFile(u)));
function observe(seconds){for(let i=0;i<seconds*200;i++)drone.advance(.005);return drone.get('position');}
const hover=observe(8);
drone.set('pilot',1);drone.set('forward',1);drone.set('climb',.5);
const flying=observe(2);
drone.set('forward',0);drone.set('climb',0);
const hold=observe(6);
drone.set('pilot',0);const back=observe(12);
console.log({hover,flying,hold,back,rotors:drone.get('rotorSpeed')});
assert(Math.abs(hover[2]-5)<.15&&Math.abs(hover[0]+5)<.15);
assert(flying[0]>hover[0]+1&&flying[2]>hover[2]+.4);
assert(Math.abs(hold[0]+1)<.3&&Math.abs(hold[2]-6)<.2);
assert(Math.hypot(back[0]+5,back[1],back[2]-5)<.2);
// At rest, a lateral wind produces positive side force. Reversing it reverses
// the force, and the controller must lean into it to hold the station.
for(const speed of [-5,0,5]){
  const gust=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0,windENU:[0,speed,0]},async u=>new Response(await readFile(u)));
  gust.advance(.005);
  const sideForce=gust.get('dragBody')[1];
  const expected=(.5*1.225*.08*Math.abs(speed)+.12)*speed;
  assert(Math.abs(sideForce-expected)<.02);
  for(let i=0;i<1200;i++)gust.advance(.005);
  const y=gust.get('position')[1],roll=gust.get('quaternion')[1];
  if(speed!==0)assert(y*speed>0 && roll*speed>0);
  console.log({windNorth:speed,sideForce,y,rollQuaternion:roll});
}
const sinking=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0},async u=>new Response(await readFile(u)));
for(let i=0;i<400;i++)sinking.advance(.005);
sinking.set('motorCut',1);
let lowest=5;
for(let i=0;i<8500;i++){
  sinking.advance(.005);
  lowest=Math.min(lowest,sinking.get('position')[2]);
}
const bottom=sinking.get('position')[2];
console.log({lowest,bottom});
assert.equal(sinking.get('displacedVolume'),0);
assert(Math.abs(bottom+13.61)<.03 && lowest>-13.71);
assert(sinking.get('immersed')>.99 && Math.max(...sinking.get('rotorSpeed'))<.01);

// Immersion alone must shut down the rotors, even with the hover controller active.
const flooded=await loadInstance('Rdd2Survey',{waterLevel:5.25},async u=>new Response(await readFile(u)));
for(let i=0;i<1200;i++)flooded.advance(.005);
assert(flooded.get('immersed')>.99 && flooded.get('position')[2]<3);
assert(Math.max(...flooded.get('rotorSpeed'))<.01);

// A near miss produces no force. A closing airframe transmits force and moment.
const contact=await loadInstance('Rdd2Survey',{},async u=>new Response(await readFile(u)));
for(const offset of [.4,.26]){
  const [east,north,up]=contact.get('position');
  const traffic=new Float64Array(4*14);
  traffic.set([1,east+offset,north,up,...contact.get('quaternion'),-1,0,0,0,0,0]);
  contact.set('droneTraffic',traffic);
  contact.advance(.005);contact.advance(.005);
  const wrench=contact.get('droneContactWrench');
  if(offset===.4)assert.deepEqual(wrench,[0,0,0,0,0,0]);
  else assert(wrench[0]<-1&&Math.hypot(...wrench.slice(3))>.01);
}
for(let i=0;i<10;i++)contact.advance(.005);
assert(contact.get('aircraft.truth.velocityWorldEnu_m_s')[0]<-.1,'Contact must push the physical drone away');

// Track a moving survey station across a rotating 8–14 m/s wind.
const follower=await loadInstance('Rdd2Survey',{pilot:0,stationEast:-5,stationNorth:0,windENU:[10,4,0]},
  async u=>new Response(await readFile(u)));
let horizontalSquared=0,altitudeSquared=0,samples=0;
for(let k=0;k<20000;k++){
  const t=k*.005,east=-5+10*Math.sin(t/14),north=6*Math.sin(t/9);
  if(k%40===0){
    const speed=11+3*Math.sin(t/8),bearing=.45+.23*Math.sin(t/15);
    follower.set('stationEast',east);follower.set('stationNorth',north);
    follower.set('windENU',[speed*Math.cos(bearing),speed*Math.sin(bearing),0]);
  }
  follower.advance(.005);
  if(k%40===0){
    const [x,y,z]=follower.get('position');
    horizontalSquared+=(x-east)**2+(y-north)**2;altitudeSquared+=(z-5)**2;samples++;
  }
}
const horizontalRms=Math.sqrt(horizontalSquared/samples),altitudeRms=Math.sqrt(altitudeSquared/samples);
console.log({horizontalRms,altitudeRms});
assert(horizontalRms<1 && altitudeRms<.25,'Aircraft lost its moving station in crosswind');

// The same pitch input commands a bank-limited attitude or a sustained body
// rate. Keep the aircraft clear of the surface throughout the inverted pass.
for(const mode of [1,2]){
  const aircraft=await loadInstance('Rdd2Survey',{pilot:1,flightMode:mode,waterLevel:-50},async u=>new Response(await readFile(u)));
  const advance=steps=>{for(let i=0;i<steps;i++)aircraft.advance(.005);};
  aircraft.set('climb',.6);advance(80);aircraft.set('climb',0);
  const throttle=aircraft.get('throttle');
  aircraft.set('forward',1);
  let inverted=false;
  for(let i=0;i<300;i++){
    advance(1);
    const [,x,y]=aircraft.get('quaternion');
    inverted ||= 1-2*(x*x+y*y)<-.8;
  }
  assert.equal(inverted,mode===2);
  if(mode===1)assert(Math.abs(aircraft.get('attitude')[1]-.72)<.02);
  aircraft.set('forward',0);advance(160);
  if(mode===1)assert(Math.abs(aircraft.get('attitude')[1])<.02);
  else assert(Math.abs(aircraft.get('bodyRate')[1])<.15);
  assert(Math.abs(aircraft.get('throttle')-throttle)<1e-6);
  aircraft.set('flightMode',0);advance(200);
  assert(aircraft.get('position').every(Number.isFinite));
}
console.log('Auto level recovered, acro rotated through inverted, throttle held and position hold re-engaged.');

// Covariance should grow while dead reckoning and contract when GPS returns.
// The drag observer must recover both wind components and track a reversal.
const navigation=await loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0,windENU:[-3,7,0]},
  async u=>new Response(await readFile(u)));
function advanceNavigation(seconds){
  for(let i=0;i<seconds*200;i++)navigation.advance(.005);
  return navigation.get('positionCovariance');
}
function estimateError(){
  const [estimate,actual]=navigation.getMany(['estimatedPosition','position']);
  return Math.hypot(...estimate.map((value,i)=>value-actual[i]));
}
function windError(east,north){
  const [e,n]=navigation.get('estimatedWindENU');
  return Math.hypot(e-east,n-north);
}
assert.equal(navigation.get('windEstimateValid'),0);
const lockedCovariance=advanceNavigation(4);
assert.equal(navigation.get('windEstimateValid'),1);
assert(windError(-3,7)<.08&&estimateError()<.05);
navigation.set('gpsDropout',1);
const dropoutCovariance=advanceNavigation(3);
assert(dropoutCovariance.every((variance,i)=>variance>25*lockedCovariance[i]));
assert(estimateError()<.25);
navigation.set('gpsDropout',0);
navigation.set('windENU',[6,-4,0]);
const recoveredCovariance=advanceNavigation(4);
assert(recoveredCovariance.every((variance,i)=>variance<.1*dropoutCovariance[i]));
assert(windError(6,-4)<.08&&estimateError()<.05);
console.log({lockedCovariance,dropoutCovariance,recoveredCovariance,positionError:estimateError(),windError:windError(6,-4)});
