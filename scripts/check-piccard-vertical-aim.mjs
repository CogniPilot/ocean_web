// Physical camera attitude through both poles, using the same 100 Hz vehicle and
// 5 Hz navigation feedback as the split simulator. Angles below are in degrees.
import assert from 'node:assert/strict';
import {subHarness} from './sub-harness.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = pathToFileURL(resolve(process.argv[2] ?? 'viewer/fmi3') + '/');
const {loadInstance} = await import(new URL('instance.mjs', root));
const deg = 180 / Math.PI;
const difference = (a, b) => Math.atan2(Math.sin((a-b)/deg), Math.cos((a-b)/deg))*deg;

for (const mode of [0, 1]) {
  const {plant,sample,step} = await subHarness({
    manual: 1, manualMode: mode, spawnPosition: [-15, 15, -8], spawnHeading: .32,
    windSpeed: 0, seaState: 0, 'ocean.tidalSpeed': 0
  }, loadInstance);
  assert.equal(plant.get('pilotPitchLimit'), Math.PI / 2);
  function run(pitch, yaw, seconds) {
    plant.set('attitudePilot', [0, pitch]);
    plant.set('pilot', [0, 0, yaw, 0]);
    for (let i = 0; i < seconds * 5; i++) {
      sample();
      step(20);
    }
    const [w, x, y, z] = plant.get('orientation');
    // The forward axis has no azimuth when vertical. The port axis still does.
    const nose = deg * Math.asin(Math.max(-1, Math.min(1, 2*(x*z-w*y))));
    const heading = deg * Math.atan2(-2*(x*y-w*z), 1-2*(x*x+z*z));
    return {nose, heading};
  }
  run(0, 0, 2);
  for (const sign of [-1, 1]) {
    const vertical = run(sign, 0, 14);
    assert.ok(-sign * vertical.nose > 88.5, 'physical nose reaches the vertical target');
    run(sign, .36, 3);
    const yawed = run(sign, 0, 5);
    const rotation = difference(yawed.heading, vertical.heading);
    assert.ok(rotation > 45 && rotation < 75, 'yaw acts about the vertical in both directions of view');
    assert.ok(-sign * yawed.nose > 88, 'yaw preserves the elevation');
    const level = run(0, 0, 12);
    const recoveryDrift = difference(level.heading, yawed.heading);
    console.log({mode, sign, vertical, yawed, level, rotation, recoveryDrift});
    assert.ok(Math.abs(level.nose) < 1.5, 'returns to level');
    assert.ok(Math.abs(recoveryDrift) < 8, 'retains the selected heading through recovery');
  }
}
