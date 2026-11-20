// Exercise the integrated guest with its onboard estimator and survey controller.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base = new URL('../build/world-runtime/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const world = await openFmuSession({index, base, fetch: fileFetch, instanceName: 'wreck-survey'});

try {
  const controls = {subManual: 0, sailingManual: 1, flightManual: 1, windSpeed: 11, windBearing: .45};
  world.set_inputs(JSON.stringify(Object.entries(controls)));
  const outputs = ['sub.waypoint', 'sub.surveyDone', 'sub.position[1]', 'sub.position[2]',
    'sub.position[3]', 'estimate[1]', 'estimate[2]', 'estimate[3]'];
  const binding = world.bind_outputs(JSON.stringify(outputs));
  let lastStation = 0, frames = 0, squaredError = 0, stepMs = 0, readMs = 0, finished = false;

  while (world.time() < 240) {
    const start = performance.now();
    world.step(.2);
    const stepped = performance.now();
    const [station, done, x, y, z, east, north, up] = world.read_bound(binding);
    stepMs += stepped - start;
    readMs += performance.now() - stepped;
    assert([x, y, z, east, north, up].every(Number.isFinite), 'Non-finite survey pose');
    frames++;
    squaredError += (x - east) ** 2 + (y - north) ** 2 + (z - up) ** 2;

    if (station !== lastStation) {
      assert.equal(station, lastStation + 1, 'Stations must be visited in order');
      lastStation = station;
      console.log('Waypoint', station, 'at', world.time().toFixed(1), 's');
    }
    if (done) {
      assert(Math.hypot(x + 1.5, y, z + 9.8) < 1, 'Vehicle finished outside the final station');
      finished = true;
      break;
    }
  }

  const rms = Math.sqrt(squaredError / frames);
  console.log({finished, lastStation, rms, seconds: world.time(), stepMs, readMs});
  assert(finished, 'The survey timed out');
  assert.equal(lastStation, 12);
  assert(rms < 1, 'Pose estimate exceeded 1 m RMS error');
} finally {
  world.free();
}
