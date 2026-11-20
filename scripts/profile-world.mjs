// Run against the packaged world/ directory. No renderer or browser scheduling.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {Session} from 'node:inspector/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base = pathToFileURL(resolve(process.argv[2] ?? 'build/world-runtime') + '/');
const ticks = Number(process.argv[3] ?? 300);
assert(Number.isSafeInteger(ticks) && ticks >= 20);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const scenario = process.argv[4] ?? 'default';
const starts = {offshore: [-8, -7], beach: [11, 40], rocks: [18.5, 40], pin: [26.8, -7.75], miss: [26.8, -15.75]};
assert(scenario === 'default' || Object.hasOwn(starts, scenario), 'Unknown benchmark scenario');
const parameters = {};
if (scenario !== 'default') {
  const [east, north] = starts[scenario];
  Object.assign(parameters, {'boat.launchEast': east, 'boat.launchNorth': north,
    'boat.launchSpeed': 2, 'boat.launchHeading': 0});
  if (scenario === 'pin' || scenario === 'miss') parameters.prevailingBearing = Math.PI / 2;
}
const world = await openFmuSession({index, base, fetch: fileFetch, parameters});
const profilePath = process.env.OCEAN_CPU_PROFILE;
const profiler = profilePath ? new Session() : undefined;
const binding = world.bind_outputs(JSON.stringify(['boat.east', 'sub.position[1]', 'drone.position[3]']));
const groups = {all: [], ordinary: [], tenthSecond: [], fifthSecond: [], readPose: []};
const ms = n => Number(n.toFixed(3));
function summarize(values) {
  const sorted = [...values].sort((a,b) => a-b);
  const percentile = p => ms(sorted[Math.ceil(p * sorted.length) - 1]);
  return {count: values.length, mean: ms(values.reduce((a,b) => a+b, 0) / values.length),
    p50: percentile(.5), p95: percentile(.95), p99: percentile(.99)};
}
try {
  world.set_inputs(JSON.stringify(Object.entries({subManual: 1, sailingManual: 1, flightManual: 1,
    windSpeed: scenario === 'pin' || scenario === 'miss' ? 0 : 11, windBearing: .45})));
  // Include the approach and impact in the timed window of positional trials.
  const warmup = scenario === 'default' ? 100 : 0;
  if (profiler) {
    profiler.connect();
    await profiler.post('Profiler.enable');
  }
  for (let tick = 1; tick <= ticks + warmup; tick++) {
    if (profiler && tick === warmup + 1) await profiler.post('Profiler.start');
    const before = performance.now();
    world.step(.01);
    const after = performance.now();
    const pose = world.read_bound(binding);
    const read = performance.now() - after;
    assert(pose.every(Number.isFinite));
    if (tick <= warmup) continue;
    const duration = after - before;
    groups.all.push(duration);
    groups[tick % 20 === 0 ? 'fifthSecond' : tick % 10 === 0 ? 'tenthSecond' : 'ordinary'].push(duration);
    groups.readPose.push(read);
  }
  if (profiler) {
    const {profile} = await profiler.post('Profiler.stop');
    await writeFile(profilePath, JSON.stringify(profile));
  }
  console.log(JSON.stringify({index: manifest.index, scenario, stepMs: 10, warmupTicks: warmup,
    simulationSecondsPerWallSecond: ms(ticks * 10 / groups.all.reduce((a,b) => a+b)),
    milliseconds: Object.fromEntries(Object.entries(groups).map(([k,v]) => [k,summarize(v)]))}, null, 2));
} finally {
  profiler?.disconnect();
  world.free();
}
