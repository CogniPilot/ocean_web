import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadWreckCurrent, prepareWreckCurrent} from '../../../viewer/wreck-current.mjs';

const tag = 'fixture';
const grid = {
  format: 'wreck-current-v1', converged: true, geometrySha256: tag,
  axes: [[1,0,0], [0,1,0], [0,0,1]], firstCenter: [0,0,0], dimensions: [2,2,2],
  spacingM: 1, velocityScale: 0.1,
};
const velocities = new Int16Array(8*3);
const walls = new Uint8Array(8);
for (let i=0; i<8; i++) {
  const east = (i & 1) !== 0;
  velocities[3*i] = east ? 10 : -10;
  walls[i] = east ? 1 : 2;
}
const flow = prepareWreckCurrent(grid, velocities, walls, tag);
const out = [0,0,0];
assert(flow([0.49, 0.5, 0.5], out));
assert(Math.abs(out[0] + 1) < 1e-12);
assert(flow([0.51, 0.5, 0.5], out));
assert(Math.abs(out[0] - 1) < 1e-12);
assert.equal(flow([1.01, 0, 0], out), false);
assert.throws(() => prepareWreckCurrent({...grid, converged:false}, velocities, walls, tag));
assert.throws(() => prepareWreckCurrent(grid, velocities, walls, 'other'));
const free = prepareWreckCurrent(grid, velocities, new Uint8Array(8), tag);
assert(free([0.75, 0.5, 0.5], out));
assert.equal(out[0], 0.5);

if (process.argv[2]) {
  const url = pathToFileURL(resolve(process.argv[2], 'field.json'));
  const record = JSON.parse(await readFile(url, 'utf8'));
  const digest = a => createHash('sha256').update(new Uint8Array(a)).digest('hex');
  const fetchFile = async url => new Response(await readFile(url));
  const sampler = await loadWreckCurrent(url, record.geometrySha256, digest, fetchFile);
  assert(sampler([0,0,-3], out));
  assert(out[0] > 0.1 && out[0] < 0.5, 'Open passage must carry incident current');
  console.log('Recorded open passage velocity ENU (m/s)', out);
  assert(sampler([0,2,-3], out));
  assert(Math.hypot(...out) < 0.0001, 'Sealed chamber must remain still');
  await assert.rejects(() => loadWreckCurrent(url, record.geometrySha256, () => 'wrong', fetchFile), /checksum/);
}
console.log('Passed free interpolation, thin wall, bounds and recording checks.');
