// Compare two directories of Rumoca-generated browser modules on a turning tow.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const directories = process.argv.slice(2);
assert.equal(directories.length, 2, 'Usage: node scripts/compare-wake.mjs BASELINE_DIR CANDIDATE_DIR');
const read = async url => new Response(await readFile(url));
const hull = {
  beamHalf: [.09, .156, .185, .184, .155, .093, .009],
  stations: [-2.55, -1.9, -.9, .15, 1.12, 1.95, 2.55], separation: 1.02,
  currentEast: .2, currentNorth: -.08, windEast: 7, windNorth: 4, seaAmplitude: 1
};
const models = await Promise.all(directories.map(async dir => {
  const {loadInstance} = await import(pathToFileURL(resolve(dir, 'instance.mjs')));
  return loadInstance('WakeSpectrum', hull, read);
}));
const timings = [[], []];
const fields = ['height', 'waveLoad', 'sectionHeight', 'incident', 'displacementR', 'displacementI'];
let comparisons = 0;
let maximumError = 0;
for (let tick = 0; tick < 160; tick++) {
  const time = tick * .1;
  const angle = time * .17;
  const inputs = {
    east: 6 * time, north: 3 * Math.sin(angle), heel: .35 * Math.sin(angle * .4),
    pitch: .17 * Math.sin(time), heading: angle,
    volume: Array.from({length: 12}, (_, k) => .013 * (1 + Math.sin(.9 * k + .8 * time)))
  };
  for (const index of tick % 2 ? [1, 0] : [0, 1]) {
    const model = models[index];
    for (const [key, value] of Object.entries(inputs)) model.set(key, value);
    const start = performance.now();
    model.advance(.1);
    if (tick >= 30) timings[index].push(performance.now() - start);
  }
  if (tick % 5 !== 0) continue;
  for (const field of fields) {
    const [baseline, candidate] = models.map(model => model.get(field));
    assert.equal(baseline.length, candidate.length);
    for (let k = 0; k < baseline.length; k++) {
      const error = Math.abs(baseline[k] - candidate[k]);
      assert(error < 1e-8, 'Mismatch at tick ' + tick + ' in ' + field + '[' + k + ']: ' + error);
      maximumError = Math.max(maximumError, error);
      comparisons++;
    }
  }
}
console.log({comparisons, maximumError});
for (const [index, times] of timings.entries()) {
  times.sort((a, b) => a - b);
  const percentile = p => times[Math.ceil(times.length * p) - 1].toFixed(2);
  console.log(directories[index], {p50Ms: percentile(.5), p95Ms: percentile(.95)});
}
