// Drive the real Plant and the navigation FMU with the same bottom-track stream as the simulator.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

async function loader(directory) {
  const base = pathToFileURL(resolve(directory) + '/');
  return (await import(new URL('instance.mjs', base))).loadInstance;
}
const plantDir = process.argv[2] ?? 'viewer/fmi3';
const navDir = process.argv[3] ?? plantDir;
const read = async url => new Response(await readFile(url));
const plant = await (await loader(plantDir))('Wreck_Plant', {
  spawnPosition: [-24, 18, -8], manual: 1, manualMode: 3, windSpeed: 6, windDirection: .3, seaState: 0
}, read);
const nav = await (await loader(navDir))('Wreck_Navigation', {}, read);

const period = .2;
let previousGyro = [0, 0, 0];
let validSamples = 0, squaredError = 0, peakError = 0;
let lastSensor;
for (let frame = 0; frame < 430; frame++) {
  const [position, orientation, velocity, yawRate, pressure, acceleration, gyro] =
    plant.getMany(['position', 'orientation', 'velocity', 'yawRate', 'pressure', 'specificForce', 'gyroAngle']);
  // The simulator uses truth only to synthesize its sensors. The filter sees Navigation's noisy observations.
  const rate = gyro.map((angle, axis) => (angle - previousGyro[axis]) / period);
  previousGyro = gyro;
  nav.set('truth', [...position, ...orientation, ...velocity, yawRate, pressure, ...acceleration, ...rate]);
  nav.set('stamp', frame * period);
  const [sensor, elevation, image, estimate, history] = nav.getMany(['sensor', 'elev', 'image', 'estimate', 'keyframes']);
  nav.set('priorImage', image);
  nav.set('prior', estimate);
  nav.set('keyHistory', history);
  plant.set('sensor', sensor);
  plant.set('elevationRanges', elevation);
  plant.set('navigationUp', estimate[2]);
  plant.set('navigationUpValid', 1);
  lastSensor = sensor;
  const forward = frame >= 180 && frame < 245 ? .25 : 0;
  const yaw = frame >= 265 && frame < 327 ? .4 : 0;
  plant.set('pilot', [forward, 0, yaw, 0]);
  for (let i = 0; i < 20; i++) plant.advance(.01);
  if (frame <= 100 || sensor[62] <= .5) continue;
  // Compare independently against local water velocity after the initial settling period.
  const [current, truth, sigma] = plant.getMany(['estimatedCurrent', 'current', 'currentEstimateSigma']);
  assert(sigma.every(value => Number.isFinite(value) && value > 0));
  const error = Math.hypot(current[0] - truth[0], current[1] - truth[1]);
  squaredError += error * error;
  peakError = Math.max(peakError, error);
  validSamples++;
}
const rms = Math.sqrt(squaredError / validSamples);
assert(validSamples > 220, 'insufficient bottom-track coverage');
assert(rms < .09, 'excessive vector RMS current error');
assert(peakError < .35, 'excessive transient current error');

lastSensor[62] = 0;
plant.set('sensor', lastSensor);
for (let i = 0; i < 40; i++) plant.advance(.01);
const [before, sigmaBefore] = plant.getMany(['estimatedCurrent', 'currentEstimateSigma']);
for (let i = 0; i < 240; i++) plant.advance(.01);
const [after, sigmaAfter] = plant.getMany(['estimatedCurrent', 'currentEstimateSigma']);
assert.deepEqual(after, before, 'current must hold across a bottom-track outage');
assert(sigmaAfter.every((value, i) => value > sigmaBefore[i]), 'uncertainty should increase without bottom track');
console.log({validSamples, rms, peakError, sigmaBefore, sigmaAfter});
