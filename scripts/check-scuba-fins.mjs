// Exercise the same FMI runtime and pilot inputs used by the harbor worker.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const directory = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('../viewer/fmi3/', import.meta.url);
const {loadInstance} = await import(new URL('instance.mjs', directory));
const initialState = [0, 0, -30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function create(inputs = {}) {
  return loadInstance('ScubaDiver', {initialState, bedHeight: -100, pilot: [1, 0, 0, 0, 0], ...inputs},
    async url => new Response(await readFile(url)));
}

const fixed = await create({policyMode: 1});
fixed.advance(2);
for (const key of ['limbForces', 'finMoment', 'jointTorque']) {
  assert(fixed.get(key).every(v => Math.abs(v) < 1e-9), key);
}
assert(Math.abs(fixed.get('mechanicalPower')) < 1e-9);
assert(fixed.get('state').slice(0, 12).every((value, i) => Math.abs(value - initialState[i]) < 1e-9));

// Ankle rotation alone moves the blade center even when the ankle joint's
// position is stationary. Reversing that rate must reverse the fluid load.
for (const direction of [-1, 1]) {
  const joints = Array(20).fill(0);
  joints[12] = direction;
  const fmu = await create({initialJoints: joints, policyMode: 1});
  const force=fmu.get('rigForce').slice(0,3),motion=fmu.get('rigMotion').slice(0,3);
  assert(force.reduce((power,component,i)=>power+component*motion[i],0)<-.1,
    'water must remove energy from the moving blade centre');
  assert(direction * fmu.get('loadTorque')[2] < -.1);
}

for (const direction of [-1, 1]) {
  const fmu = await create({pilot: [1, 0, 0, 0, direction]});
  let rollTravel = 0, meanMoment = 0, muscleWork = 0, handTravel = 0, meanHandMoment = 0;
  for (let step = 0; step < 240; step++) {
    const dt = .05;
    fmu.advance(dt);
    const [s, moment, forces, angles, rates, loads, musclePower, fluidPower, points, localForces] = fmu.getMany([
      'state', 'finMoment', 'limbForces', 'jointAngles', 'jointRates', 'loadTorque', 'mechanicalPower', 'finFluidPower', 'positionBody', 'localForce'
    ]);
    assert(fluidPower <= 1e-7);
    // Reconstruct work at the floating base and each articulated joint.
    const translation = s[3]*(forces[0]+forces[3]) + s[4]*(forces[1]+forces[4]) + s[5]*(forces[2]+forces[5]);
    const rotation = moment[0]*s[11] - moment[1]*s[10] + moment[2]*s[9];
    const [lateralRates,sweepLoads,cantLoads]=fmu.getMany(['lateralRates','sweepTorque','cantDrag']);
    let axialPower=0;
    if(fmu.has('axialRates')){
      const [rates,loads]=fmu.getMany(['axialRates','hipLoad']);
      axialPower=rates[0]*loads[0]+rates[2]*loads[1];
      if(fmu.has('cantAxis')){
        const [axes,moments]=fmu.getMany(['cantAxis','soleMoment']);
        for(let k=0;k<2;k++)cantLoads[k]=axes.slice(3*k,3*k+3).reduce((w,a,j)=>w+a*moments[3*k+j],0);
      }
    }
    const lateralPower=axialPower+lateralRates[0]*sweepLoads[0]+lateralRates[2]*sweepLoads[1]
      +lateralRates[1]*cantLoads[0]+lateralRates[3]*cantLoads[1];
    const articulation = [0,1,2,5,6,7].reduce((sum, j) => sum + rates[j]*loads[j], lateralPower);
    assert(Math.abs(translation + rotation + articulation - fluidPower) < 1e-6, 'joint and fluid power disagree');
    const targets=fmu.get('target');
    for (const j of [3,4,8,9]) {
      assert(Math.abs(targets[j])<1e-8, 'bank must not command an arm stroke');
      handTravel = Math.max(handTravel, Math.abs(angles[j]));
    }
    // Any residual hand force comes from water passing the relaxed hands.
    for (const k of [6, 9]) meanHandMoment += (points[k+1]*localForces[k+2] - points[k+2]*localForces[k+1]) / 240;
    rollTravel += dt * s[11];
    meanMoment += moment[0] / 240;
    muscleWork += musclePower * dt;
  }
  assert(direction * rollTravel > Math.PI && direction * meanMoment > 1);
  assert(muscleWork > 0);
  // A relaxed hand damps ongoing roll. Its drag may be substantial even though
  // its target remains fixed and it supplies no propulsive roll moment.
  assert(direction*meanHandMoment<=0,'passive palms must oppose the commanded roll');
  console.log('Pilot bank', direction, 'axial roll', (rollTravel*180/Math.PI).toFixed(1), 'deg, mean fin moment', meanMoment.toFixed(2), 'N m, passive hand moment', meanHandMoment.toFixed(4), 'N m, maximum absolute hand joint angle', handTravel, 'rad.');
}
const idle = await create();
idle.advance(.7);
const idlePose = idle.get('jointAngles');
assert(idlePose[3] > .04 && idlePose[4] > .12 && Math.abs(idlePose[3]-idlePose[8]) < .005);
console.log('Locked fins, pure ankle sweep, dissipation, joint work balance and relaxed bilateral idle sculling passed.');

for (const direction of [-1,1]) {
  const diver=await create({pilot:[1,direction,0,0,0]});
  const inside=direction===1?0:1, outside=1-inside;
  const foreAft=[0,0],yawImpulse=[0,0],kneePeak=[0,0];
  let yaw=0,previous=0,finImpulse=0,handImpulse=0;
  for(let step=0;step<160;step++){
    const dt=.05;
    diver.advance(dt);
    const [state,angles,targets,fin,points,forces,fluidPower]=diver.getMany([
      'state','jointAngles','target','finMoment','positionBody','localForce','finFluidPower'
    ]);
    const delta=state[6]-previous;
    yaw+=Math.atan2(Math.sin(delta),Math.cos(delta));
    previous=state[6];
    for(let k=0;k<2;k++){
      const i=3*k;
      kneePeak[k]=Math.max(kneePeak[k],angles[5*k+1]);
      foreAft[k]+=dt*forces[i];
      yawImpulse[k]+=dt*(points[i]*forces[i+1]-points[i+1]*forces[i]);
    }
    for(const j of [3,4,8,9])assert(Math.abs(targets[j])<1e-8,'helicopter kick commanded the arms');
    for(const k of [6,9])handImpulse+=dt*(points[k]*forces[k+1]-points[k+1]*forces[k]);
    finImpulse+=dt*fin[2];
    assert(fluidPower<=1e-7);
  }
  assert(direction*yaw>.5 && direction*finImpulse>4, 'working fin must turn the body');
  assert(kneePeak.every(angle=>angle>.85),'both heels tuck during the turn');
  assert(foreAft[inside]>.5 && foreAft[outside]<-.5,'inside frog kick and outside back kick must produce opposite impulses');
  assert(yawImpulse.every(value=>direction*value>2),'both fins must contribute to the commanded rotation');
  assert(Math.abs(handImpulse)<.05*Math.abs(finImpulse), 'hands supplied appreciable yaw');
  console.log('Helicopter turn',direction,{degrees:yaw*180/Math.PI,kneePeak,foreAft,yawImpulse,finImpulse,handImpulse});
}
