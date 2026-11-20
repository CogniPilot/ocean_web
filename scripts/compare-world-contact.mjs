// Compare two prepared OceanWorld runtimes across changing controls and contact regimes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const outputs = [
  'boat.east', 'boat.north', 'boat.heading', 'boat.surge', 'boat.heel', 'boat.pitch',
  'boat.vertical', 'boat.sectionVolume', 'boat.hullRoll', 'boat.foilLoad', 'boat.shoreWrench',
  'boat.mainTension', 'boat.sailMoment', 'waves.waveLoad', 'race.buoyPosition',
  'race.markWrench', 'sub.position', 'drone.position', 'estimate'
];
async function open(dir, parameters) {
  const base = pathToFileURL(resolve(dir) + '/');
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
  const index = JSON.parse(await readFile(new URL(manifest.index, base)));
  const world = await openFmuSession({base, index, parameters, fetch: fileFetch});
  const names = outputs.flatMap(name =>
    scalarNames(name, index.variables.find(v => v.name === name).dimensions ?? []));
  return {world, names, binding: world.bind_outputs(JSON.stringify(names))};
}

const paths = process.argv.slice(2);
assert.equal(paths.length, 2, 'Supply baseline and candidate world runtime directories');
for (const [name, east, north] of [['offshore', -8, -7], ['pin', 26.8, -7.75], ['rocks', 18.5, 40]]) {
  const parameters = {prevailingBearing: Math.PI / 2, 'boat.launchEast': east,
    'boat.launchNorth': north, 'boat.launchHeading': 0, 'boat.launchSpeed': 2};
  const models = await Promise.all(paths.map(path => open(path, parameters)));
  const times = [[], []];
  try {
    for (let tick = 0; tick < 150; tick++) {
      const observations = [];
      for (let k = 0; k < 2; k++) {
        const index = (k + tick) % 2;
        const {world, binding} = models[index];
        if (tick % 25 === 0) {
          const controls = {sailingManual: 1, trim: Math.cos(tick * .02) * .2,
            rudder: .15 * Math.sin(tick * .035), windSpeed: 8 + tick / 50};
          world.set_inputs(JSON.stringify(Object.entries(controls)));
        }
        const start = performance.now();
        world.step(.01);
        if (tick >= 20) times[index].push(performance.now() - start);
        observations[index] = world.read_bound(binding);
      }
      for (const [i, label] of models[0].names.entries()) {
        const a = observations[0][i], b = observations[1][i];
        assert(Number.isFinite(a) && Object.is(a, b), name + ' tick ' + tick + ' ' + label);
      }
    }
    console.log(name, 150 * models[0].names.length, times.map(values => {
      values.sort((a, b) => a - b);
      return {mean: values.reduce((a, b) => a + b) / values.length, p50: values[64], p95: values[123]};
    }));
  } finally {
    for (const {world} of models) world.free();
  }
}
