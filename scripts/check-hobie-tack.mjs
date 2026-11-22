// Begin almost stationary in irons. The two upwind goals demand opposite tacks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {sailingStart,startGate,windBearing,windSpeed} from '../viewer/sailing-start.mjs';
const read = async url => new Response(await readFile(url));
const heading = -2.1;
const recovered = [];
for (const side of [-1,1]) {
  const goalEast = -8 + 150*Math.cos(heading) - 65*side*Math.sin(heading);
  const goalNorth = -7 + 150*Math.sin(heading) + 65*side*Math.cos(heading);
  const boat = await loadInstance('Hobie16', {
    launchHeading: heading, launchSpeed: .04, manualHelm: 0, raceGoal: [1,goalEast,goalNorth],
    windEast: -9*Math.cos(heading), windNorth: -9*Math.sin(heading)
  }, read);
  const phases = [];
  let turn, reverseSpeed, recoverySpeed;
  for (let tick=0; tick<2700; tick++) {
    boat.advance(.01);
    if (tick%10) continue;
    const [phase, speed, target, direction, bow, error] = boat.getMany([
      'tackRecovery','signedLogSpeed','helmTarget','recoveryTurn','windOffBow','error'
    ]);
    if (phase===1) assert.equal(target, 0, 'Centre the rudders while gathering sternway');
    if (phase===2) assert(target*direction<-.5, 'Reverse the helm under sternway');
    if (phases.at(-1)!==phase) {
      phases.push(phase);
      if (phase===2) {
        turn=direction; reverseSpeed=speed;
        assert(speed<-.22, 'Wait for measured negative water speed');
      }
      if (phase===0 && phases.includes(3)) {
        assert(speed>1 && direction*bow>.8, 'Regain headway on the intended side');
        recoverySpeed=speed;
      }
    }
    if (tick>=2500) assert(phase===0 && speed>1.4 && Math.abs(error)<.15, 'Hold the new close-hauled course');
  }
  assert.deepEqual(phases, [0,1,2,3,0]);
  boat.set('manualHelm', 1);boat.set('rudderInput', .6);boat.advance(.01);
  assert(Math.abs(boat.get('helmTarget')-.324)<1e-8);
  recovered.push(turn);
  console.log({turn,reverseSpeed,recoverySpeed,finalSpeed:boat.get('signedLogSpeed')});
}
assert.equal(recovered[0], -recovered[1]);

// Run the unassisted scored triangle in steady wind with the two shipped Wasm plants.
if (process.argv.includes('--race')) {
  const boat = await loadInstance('Hobie16', {...sailingStart(true),windEast:windSpeed*Math.cos(windBearing),
    windNorth:windSpeed*Math.sin(windBearing),currentEast:.2,currentNorth:.04,manualHelm:0}, read);
  const race = await loadInstance('Regatta', {...startGate,windBearing,utc:295}, read);
  const stages = [];
  for (let tick=0; tick<200000; tick++) {
    if (tick%5===0) {
      const [east,north] = boat.getMany(['east','north']);
      race.set('east',east);race.set('north',north);race.set('utc',295+tick/100);
      race.advance(.05);
      const [stage,target] = race.getMany(['stage','pilotTarget']);
      boat.set('raceGoal',[1,...target]);
      if (stages.at(-1)!==stage) {
        stages.push(stage);
        console.log({stage,seconds:tick/100});
      }
      if (stage===5) break;
    }
    boat.advance(.01);
  }
  assert.deepEqual(stages,[0,1,2,3,4,5]);
  console.log({scoredLapSeconds:race.get('lapTime')});
}
