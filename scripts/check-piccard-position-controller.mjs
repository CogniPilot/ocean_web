// Replay calibrated bottom-track, pressure, actuator feedback and gyro through the standalone Modelica block.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base = pathToFileURL(resolve(process.argv[2] ?? 'viewer/fmi3') + '/');
const {loadInstance} = await import(new URL('instance.mjs', base));
const rho = 1025, gravity = 9.80665, depth = 5, current = .3;
const tank = (.0184 - 18 / rho) / 2;
const opposingForce = -(1.5 + 2 * current) * current;
const device = await loadInstance('Wreck_PiccardPositionHold', {
  initialPosition: [0, 0, -depth], gaugePressure: rho * gravity * depth,
  specificForce: [0, 0, gravity], bodyRate: [0, 0, 0],
  dvlRange: [6, 6, 6, 6], dvlVelocity: [0, 0, 0, 0],
  measuredTankVolume: [tank, tank], estimatedMotorThrust: [opposingForce / 2, opposingForce / 2, 0, 0, 0, 0]
}, async url => new Response(await readFile(url)));
function advance(count) {
  for (let i = 0; i < count; i++) device.advance(.02);
}
assert.deepEqual(device.get('motorCommand'), [0, 0, 0, 0, 0, 0]);
assert.deepEqual(device.get('tankTarget'), [tank, tank]);
device.set('enable', 1);
advance(2500);
const [estimated, sigma, control, nav] = device.getMany(['currentENU', 'currentSigma', 'motorCommand', 'state']);
assert(Math.hypot(estimated[0] - current, estimated[1]) < .035, 'estimate the prescribed flow from measured motor load');
assert(sigma.every(value => value > 0 && value < .30));
assert(Math.abs(nav[2] + depth) < .02, 'pressure measurement recovers surveyed height');
assert(control[0] < -.1 && Math.abs(control[0] - control[1]) < 1e-6, 'command matched axial thrust against the current');
device.set('pilot', [0, 0, .3, 0]);
advance(2);
const yawCommand = device.get('motorCommand');
assert(yawCommand[1] - yawCommand[0] > 2, 'positive pilot yaw produces the correct motor pair');
device.set('bodyRate', [0, 0, .6]);
advance(2);
const gyroCommand = device.get('motorCommand');
assert(gyroCommand[1] < gyroCommand[0], '50 Hz gyro feedback reverses thrust within one 5 Hz navigation interval');
device.set('pilot', [0, 0, 0, 0]);
device.set('bodyRate', [0, 0, 0]);
device.set('dvlRange', [0, 0, 0, 0]);
advance(24);
const [lost, before] = device.getMany(['currentENU', 'currentSigma']);
advance(70);
const [held, after] = device.getMany(['currentENU', 'currentSigma']);
assert.deepEqual(held, lost);
assert(after.every((value, k) => value > before[k]), 'lost bottom lock raises uncertainty');
device.set('secured', 1);
advance(12);
assert.deepEqual(device.get('motorCommand'), [0, 0, 0, 0, 0, 0]);
assert.deepEqual(device.get('tankTarget'), [tank, tank]);
assert.deepEqual(device.get('currentENU'), [0, 0]);
console.log({estimated, sigma, control, yawCommand, gyroCommand, dropoutSigma: after});
