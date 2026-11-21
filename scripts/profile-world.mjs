// Run against the packaged world/ directory. No renderer or browser scheduling.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {sailingStart,windBearing,windSpeed} from '../viewer/sailing-start.mjs';

const base = pathToFileURL(resolve(process.argv[2] ?? 'build/world-runtime') + '/');
const ticks = Number(process.argv[3] ?? 300);
assert(Number.isSafeInteger(ticks) && ticks >= 20);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const sailing = index.modelName === 'OceanSailing';
const low = process.argv.includes('--low'), camera = process.argv.includes('--camera');
const parameters = {prevailingBearing: windBearing};
for (const [name,value] of Object.entries(sailingStart(true))) parameters['boat.' + name] = value;
const world = await openFmuSession({index, base, fetch: fileFetch, parameters});
const binding = world.bind_outputs(JSON.stringify(['boat.east', 'boat.north', 'boat.heel', 'race.stage']));
const groups = {all: [], ordinary: [], tenthSecond: [], fifthSecond: [], wind: [], overlap: [], readPose: []};
const ms = n => Number(n.toFixed(3));
function summarize(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const percentile = p => ms(sorted[Math.ceil(p * sorted.length) - 1]);
  return {count: values.length, mean: ms(values.reduce((a,b) => a+b, 0) / values.length),
    p50: percentile(.5), p95: percentile(.95), p99: percentile(.99)};
}
try {
  world.set_inputs(JSON.stringify(Object.entries({sailingManual: 1, windSpeed, windBearing, downhaul: .5,
    epoch: 100, omitWake: Number(low), ...(!sailing && {subManual: 1, flightManual: 1, idleCamera: camera ? -1 : 1})})));
  const warmupTicks = 200;
  for (let tick = 1; tick <= ticks + warmupTicks; tick++) {
    const before = performance.now();
    world.step(.01);
    const after = performance.now();
    const pose = world.read_bound(binding);
    const read = performance.now() - after;
    assert(pose.every(Number.isFinite));
    if (tick <= warmupTicks) continue;
    const duration = after - before;
    groups.all.push(duration);
    groups[tick % 50 === 0 ? 'overlap' : tick % 25 === 0 ? 'wind' : tick % 20 === 0 ? 'fifthSecond' : tick % 10 === 0 ? 'tenthSecond' : 'ordinary'].push(duration);
    groups.readPose.push(read);
  }
  console.log(JSON.stringify({index: manifest.index, stepMs: 10, warmupTicks, low, camera,
    simulationSecondsPerWallSecond: ms(ticks * 10 / [...groups.all, ...groups.readPose].reduce((a,b) => a+b)),
    milliseconds: Object.fromEntries(Object.entries(groups).map(([k,v]) => [k,summarize(v)]))}, null, 2));
} finally {
  world.free();
}
