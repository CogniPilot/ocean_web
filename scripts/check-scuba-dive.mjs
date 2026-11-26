// Run the same Wasm FMU used by the harbor worker. A passive, co-moving diver
// prescribes pressure histories independently of the swimming controller.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const directory = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('../viewer/fmi3/', import.meta.url);
const {loadInstance} = await import(new URL('instance.mjs', directory));

const read = async url => new Response(await readFile(url));
const surfaceBar = 1.01325;
const barPerMetre = 1025 * 9.80665 / 100000;

function initialState(depth, vertical = 0) {
  return [0, 0, -depth, 0, 0, vertical, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

function diverAt(depth, inputs = {}) {
  return loadInstance('ScubaDiver', {
    initialState: initialState(depth), initialJoints:Array(20).fill(0), bedHeight: -100, policyMode: 1,
    pilot: [1, 0, 0, 0, 0], ...inputs
  }, read);
}

function advance(fmu, seconds, interval = 1) {
  const count = Math.ceil(seconds / interval);
  for (let i = 0; i < count; i++) fmu.advance(seconds / count);
}

function near(actual, expected, tolerance) {
  assert(Math.abs(actual - expected) < tolerance, `got ${actual}, expected ${expected} ± ${tolerance}`);
}

const deep = await diverAt(30);
advance(deep, 300, 5);
const dive = deep.get('dive');
const ambient = surfaceBar + 30 * barPerMetre;
near(dive[0], 200 - 13 * ambient * 5 / 12, .02);
near(dive[1], .79 * ((surfaceBar + ambient) / 2 - .0627), .001);
assert(dive[16] < dive[1] && dive[18] === 0);

// Compare gas per ambient bar-second while both regulators remain immersed.
async function gasUse(sprinting) {
  const fmu = await diverAt(30, {policyMode: 0, pilot: [1, 0, 0, Number(sprinting), 0], sprint: Number(sprinting)});
  let exposure = 0;
  let previous = fmu.get('gauge')[1];
  for (let i = 0; i < 60; i++) {
    fmu.advance(.1);
    const pressure = fmu.get('gauge')[1];
    assert(fmu.get('activity')[3] > .5);
    exposure += .05 * (previous + pressure);
    previous = pressure;
  }
  assert(Math.abs(fmu.get('computer')[0] - 30) < 2);
  return (200 - fmu.get('dive')[0]) * 12 * 60 / exposure;
}
near(await gasUse(false), 13, .02);
const workingVentilation = await gasUse(true);
assert(workingVentilation > 26 && workingVentilation < 32);

// An analytical 25-minute tissue preload at 30 m avoids coupling the ascent
// comparison to a preceding swim. The half-time equation itself is tested above.
const halfMinutes = [5, 8, 12.5, 18.5, 27, 38.3, 54.3, 77, 109, 146, 187, 239, 305, 390, 498, 635];
const loaded = [...dive];
for (let i = 0; i < halfMinutes.length; i++) {
  loaded[i + 1] = .79 * (ambient - .0627 - (ambient - surfaceBar) * 2 ** (-25 / halfMinutes[i]));
}
loaded[19] = 25 * 60;
const freshDeep = await diverAt(30);
const loadedDeep = await diverAt(30, {initialDive: loaded});
assert(loadedDeep.get('computer')[1] < freshDeep.get('computer')[1]);

async function ascentLeg(from, to, speed, history) {
  const fmu = await diverAt(from, {
    neutralVestLitres: 0, // prescribed co-moving pressure ramp with an empty BCD
    initialState: initialState(from, speed), initialDive: history, currentVelocity: [0, 0, speed]
  });
  advance(fmu, (from - to) / speed);
  near(fmu.get('computer')[0], to, .08);
  return fmu;
}

// End the controlled pressure ramp while every rigid link is still wet.
// A separate surface fixture starts the nose up with an inflated jacket.
const rapid = await ascentLeg(30, .80, 1, loaded);
const stagedAscent = await ascentLeg(30, 6, .15, loaded);
const stop = await diverAt(6, {initialDive: stagedAscent.get('dive')});
advance(stop, 180, 5);
const staged = await ascentLeg(6, .80, .15, stop.get('dive'));
const surfaceBody = initialState(.32);
surfaceBody[7] = 1.4; // An actual nose-up torso orientation.
const rapidSurface = await diverAt(.32, {initialState: surfaceBody, initialVestGas: 15 * (surfaceBar + .32 * barPerMetre), initialDive: rapid.get('dive')});
const stagedSurface = await diverAt(.32, {initialState: surfaceBody, initialVestGas: 15 * (surfaceBar + .32 * barPerMetre), initialDive: staged.get('dive')});
advance(rapidSurface, 60, 5);
advance(stagedSurface, 60, 5);
assert(rapidSurface.get('dive')[18] > stagedSurface.get('dive')[18]);
assert(rapidSurface.get('dive')[18] > 6);
assert(rapidSurface.get('gauge')[2] > stagedSurface.get('gauge')[2]);
const shallow = await diverAt(3, {initialState: initialState(3, .7), currentVelocity: [0, 0, .7]});
advance(shallow, 3);
assert(shallow.get('dive')[17] > 9 && shallow.get('dive')[18] === 0);

const atSurface = await diverAt(.32, {initialState: surfaceBody, initialVestGas: 15 * (surfaceBar + .32 * barPerMetre), initialDive: loaded});
assert(atSurface.get('mouthHeight')>0);
advance(atSurface, .5, .05);
assert(atSurface.get('mouthHeight')>0);
near(atSurface.get('dive')[0], loaded[0], .0001);
assert(atSurface.get('dive')[1] < loaded[1]);
const restored = await diverAt(30, {
  initialState: deep.get('state'), initialDive: dive, initialPosture: deep.get('upright'),
  initialVestGas: deep.get('vestGas'), initialPitchCommand: deep.get('pitchCommand'),
  initialJoints: [...deep.get('jointAngles'), ...deep.get('jointRates')],
  initialLateral: [...deep.get('lateralAngles'), ...deep.get('lateralRates')],
  initialAxial: [...deep.get('axialAngles'), ...deep.get('axialRates')]
});
advance(deep, 1);
advance(restored, 1);
deep.get('dive').forEach((value, i) => near(value, restored.get('dive')[i], 1e-7));
const empty = await diverAt(10, {initialDive: [1, ...loaded.slice(1)]});
advance(empty, 20, 5);
assert.equal(empty.get('gauge')[0], 0);
assert.equal(empty.get('state')[15], 0);
console.log('Passed cylinder draw, exertion at comparable depth, tissue half-time, fast/staged ascent, NDL, surface breathing, empty tank and restart.');

const logDive = await diverAt(15);
advance(logDive, 1);
const log = logDive.get('diveLog');
near(log[0], 15, .01);
assert.equal(log[3], 1);
const safety = await diverAt(5, {priorLog: log});
for (let i = 0; i < 180; i++) {
  advance(safety, 1);
  safety.set('priorLog', safety.get('diveLog'));
}
assert.equal(safety.get('priorLog')[2], 180);
const reentry = await diverAt(3, {priorLog: [15, 60, 180, 1, 0], initialDive: loaded});
advance(reentry, 1);
const newLog = reentry.get('diveLog');
near(newLog[0], 3, .01);
near(newLog[4], loaded[19], .02);
assert.deepEqual(newLog.slice(1, 4), [0, 0, 0]);


for (const direction of [-1, 1]) {
  const trim = await diverAt(30, {policyMode: 0, pilot: [1, 0, direction, 0, 0]});
  let finPitchImpulse = 0;
  for (let i = 0; i < 30; i++) {
    trim.advance(.1);
    finPitchImpulse -= .1 * trim.get('finMoment')[1];
    const target = trim.get('target');
    for (const arm of [3, 4, 8, 9]) near(target[arm], 0, 1e-8);
  }
  const reached = trim.get('state')[7], captured = trim.get('pitchCommand');
  assert(direction * reached > .15 && direction * finPitchImpulse > 1, 'Fins pitch the body in the commanded direction');
  near(captured, reached, .1);
  trim.set('pilot', [1, 0, 0, 0, 0]);
  advance(trim, 3, .1);
  near(trim.get('pitchCommand'), captured, 1e-6);
  near(trim.get('state')[7], captured, .22);
  const claimed = await diverAt(15, {policyMode: 0, initialPitchCommand: captured});
  near(claimed.get('pitchCommand'), captured, 1e-6);
}

// Compare commands at the same moving pose. The primary flutter remains active
// in the turning gait and simultaneous inputs change both ankles and hips.
const axes = [1, .55, .5, .7, .45];
const mixed = await diverAt(30, {policyMode: 0, pilot: axes});
const changed = [[1, .55, -.5, .7, .45], [1, .55, .5, .7, -.45], [1, 0, .5, .7, .45]];
const differences = changed.map(() => 0);
let sweepPeak = 0;
for (let i = 0; i < 40; i++) {
  mixed.advance(.05);
  const baseline = mixed.get('target');
  for (const angle of mixed.get('sweepTarget')) sweepPeak = Math.max(sweepPeak, Math.abs(angle));
  for (let k = 0; k < changed.length; k++) {
    mixed.set('pilot', changed[k]);
    mixed.advance(.0001);
    for (const [joint, value] of mixed.get('target').entries()) {
      differences[k] = Math.max(differences[k], Math.abs(value - baseline[joint]));
    }
    mixed.set('pilot', axes);
  }
}
assert(mixed.get('state')[13] > .35 && mixed.get('turnStrength') > .1 && mixed.get('flutterMix') > .2);
assert(sweepPeak > .04);
assert(differences.every(value => value > .05), 'Each mixed control must influence the stroke during its cycle');
console.log('Passed fin-driven nose-up and nose-down pitching, captured pitch, mixed kicks and host transfer.');

const swimmer = await diverAt(3, {policyMode: 0, pilot: [1, 0, .55, .6, 0], vestValve: 1});
advance(swimmer, 5, .1);
swimmer.set('vestValve', 0);
swimmer.set('pilot', [1, 0, 0, 0, 0]);
advance(swimmer, 18, .1);
assert(swimmer.get('computer')[0] < .55 && swimmer.get('upright') === 0);
swimmer.set('vestValve', -1);
swimmer.set('pilot', [1, 0, -.8, .8, 0]);
advance(swimmer, 12, .1);
swimmer.set('vestValve', 0);
advance(swimmer, 8, .1);
assert(swimmer.get('computer')[0] > 3 && swimmer.get('upright') < .1);

const rolling = await diverAt(7, {policyMode: 0, pilot: [1, 0, 0, .7, 1]});
let axialTravel = 0;
for (let i = 0; i < 120; i++) {
  rolling.advance(.1);
  axialTravel += .1 * rolling.get('state')[11];
}
assert(axialTravel > 2 * Math.PI);
console.log('Passed dive log, safety-stop credit, repeat dive, free-floating surface transition, resubmergence and full body roll.');

async function coast(effort) {
  const fmu = await diverAt(6, {policyMode: 0, pilot: [1, 0, 0, 1, 0], sprint: 1});
  advance(fmu, 8, .1);
  assert(fmu.get('state')[3] > .6, 'Sprint produced forward motion before release');
  fmu.set('pilot', [1, 0, 0, effort, 0]);
  advance(fmu, 9, .1);
  return fmu;
}
const neutral = await coast(0);
const reverse = await coast(-1);
const endState = neutral.get('state');
reverse.get('state').forEach((value, i) => near(value, endState[i], 1e-6));
assert(endState[3] >= 0 && endState[3] < .26 && endState[13] < .001);
neutral.set('currentVelocity', [-.2, 0, 0]);
advance(neutral, 9, .1);
advance(reverse, 9, .1);
const drift = neutral.get('state')[3], calm = reverse.get('state')[3];
assert(drift < calm && Math.abs(drift + .2) < .6 * Math.abs(endState[3] + .2),
  'Opposing current must move the swimmer aft relative to the still-water control and reduce slip');
console.log('After nine seconds of coasting', {calm, current: -.2, drift, initialEast: endState[3]});
console.log('Passed neutral coast, negative-effort equivalence and drift in opposing current.');

// In air, hydrodynamic added mass vanishes. A passive diver well away from
// both the bed and the surface accelerates under only its own weight.
const falling = await diverAt(-10);
falling.advance(.2);
near(falling.get('state')[5], -9.80665 * .2, .0001);
near(falling.get('state')[2], 10 - .5 * 9.80665 * .2 ** 2, .0001);
console.log('Passed isolated dry free fall.');
