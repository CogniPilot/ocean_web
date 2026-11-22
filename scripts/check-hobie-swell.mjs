// A windless following sea can accelerate the Hobie without sail power.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const read=async url=>new Response(await readFile(url));
const k=2*Math.PI/30.48,omega=Math.sqrt(9.80665*k*Math.tanh(k*13.7));
const initialPhase=.88*Math.PI,launchSpeed=5.75;

async function ride(amplitude,heading){
  const slope=amplitude*k*Math.cos(initialPhase)*Math.cos(heading);
  const boat=await loadInstance('Hobie16',{launchHeading:heading,launchEast:(initialPhase-10*Math.PI)/k,
    launchNorth:-80,launchSpeed,launchHeight:.09+amplitude*Math.sin(initialPhase),
    launchPitch:-Math.atan(slope),windEast:0,windNorth:0,manualHelm:1,swellBearing:0,swellAmplitude:amplitude},read);
  assert(Math.abs(boat.get('swellK')-k)<1e-9);
  assert(Math.abs(boat.get('swellOmega')-omega)<1e-9);
  const initialForce=boat.get('swellForce')[0];
  for(let i=0;i<600;i++)boat.advance(.01);
  const [speed,phase,force,ballast]=boat.getMany(['surge','swellPhase','swellForce','ballastX']);
  return {initialForce,speed,phase:Math.atan2(Math.sin(phase),Math.cos(phase)),force:force[0],ballast};
}

const calm=await ride(0,0),swell=await ride(1.20,0),head=await ride(1.20,Math.PI);
assert.equal(calm.initialForce,0);
assert(swell.initialForce>100&&head.initialForce< -100,'Incident pressure points down the face');
assert(swell.speed>launchSpeed+.7&&swell.speed>calm.speed+2);
assert(Math.abs(swell.speed-omega/k)<.5&&Math.cos(swell.phase)<-.4,'Hobie stays on the downhill face');
assert(Math.abs(swell.ballast)>.10&&Math.abs(swell.ballast)<=.72,'Automatic fore-aft trim remains active on the wave');
console.log({wavelength:2*Math.PI/k,period:2*Math.PI/omega,phaseSpeed:omega/k,calm,swell,head});
