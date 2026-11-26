import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {collisionSurface} from '../../viewer/wreck-contact.mjs';
import {compareHull, uploadHull} from "./hull.mjs";

const radius = 0.16;
const groupSize = 1536;
const tolerance = 1e-8;
const axes = [0, 1, 2];
let seed = 0x9875861;

function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function faceNormal(a, b, c) {
  const [ux, uy, uz] = b.map((x, i) => x - a[i]);
  const [vx, vy, vz] = c.map((x, i) => x - a[i]);
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function makeFixture({positions, indices}) {
  const vertex = i => positions.slice(3 * i, 3 * i + 3);
  const kept = [];
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.slice(i, i + 3);
    const normal = faceNormal(...face.map(vertex));
    // Apply the production mesh's degeneracy threshold to both implementations.
    if (normal.reduce((s, x) => s + x * x, 0) >= 1e-18) kept.push(...face);
  }
  const lower = [Infinity, Infinity, Infinity];
  const upper = [-Infinity, -Infinity, -Infinity];
  positions.forEach((x, i) => {
    const axis = i % 3;
    lower[axis] = Math.min(x, lower[axis]);
    upper[axis] = Math.max(x, upper[axis]);
  });
  const near = [];
  const far = [];
  for (let i = 0; i < groupSize; i++) {
    const start = 3 * Math.floor(random() * kept.length / 3);
    const [a, b, c] = kept.slice(start, start + 3).map(vertex);
    const normal = faceNormal(a, b, c);
    const length = Math.hypot(...normal);
    const u = Math.sqrt(random()), v = random();
    const offset = (2 * random() - 1) * 1.65 * radius;
    near.push(axes.map(k =>
      (1 - u) * a[k] + u * (1 - v) * b[k] + u * v * c[k] + offset * normal[k] / length));
  }
  for (let i = 0; i < groupSize; i++) {
    const axis = i % 3;
    const point = axes.map(k => lower[k] + (upper[k] - lower[k]) * random());
    point[axis] = i % 2 ? lower[axis] - 1 - 6 * random() : upper[axis] + 1 + 6 * random();
    far.push(point);
  }
  return {positions, indices: kept, near, far};
}

function measure(query, points) {
  const timings = [];
  let checksum = 0;
  for (let round = 0; round < 7; round++) {
    const start = process.hrtime.bigint();
    for (let rep = 0; rep < 10; rep++) {
      for (const point of points) checksum += query(point);
    }
    const elapsed = Number(process.hrtime.bigint() - start);
    if (round >= 2) timings.push(elapsed / (10 * points.length));
  }
  assert(Number.isFinite(checksum));
  return timings.sort((a, b) => a - b)[2];
}

function compareSite(id, path, binary, wasm) {
  const asset = new URL('../../viewer/assets/red-sea/' + id + '/collision.json', import.meta.url);
  const source = JSON.parse(readFileSync(asset));
  const {positions, indices, near, far} = makeFixture(source);
  const mesh = collisionSurface({positions, indices});
  const jsDistance = point => mesh.nearest(point, radius)?.distance ?? -1;
  const wasmDistance = wasm && (p => wasm.distance(p[0], p[1], p[2], radius));
  if (wasm) {
    for (let i = 0; i < positions.length; i += 3) wasm.vertex(positions[i], positions[i+1], positions[i+2]);
    for (let i = 0; i < indices.length; i += 3) wasm.triangle(indices[i], indices[i+1], indices[i+2]);
    assert(wasm.build(), 'Parry WASM rejected ' + id);
  }
  const points = [...near, ...far];
  writeFileSync(path, [positions.length / 3, indices.length / 3, points.length, radius,
    ...positions, ...indices, ...points.flat()].join(' '));
  const native = spawnSync(binary, [path], {encoding: 'utf8'});
  if (native.error) throw native.error;
  assert.equal(native.status, 0, native.stderr);
  const distances = native.stdout.trim().split(/\s+/).map(Number);
  const parryTimes = native.stderr.trim().split(/\s+/).map(Number);
  assert.equal(distances.length, points.length);
  assert.equal(parryTimes.length, 2);
  const groups = [near, far].map((queries, group) => {
    const nodeNs = measure(jsDistance, queries);
    const wasmParryNs = wasm && measure(wasmDistance, queries);
    let hits = 0, maxErrorM = 0;
    queries.forEach((point, i) => {
      const reference = distances[group * groupSize + i];
      assert(Number.isFinite(reference));
      const actual = jsDistance(point);
      const full = mesh.nearest(point, Infinity).distance;
      assert.equal(actual >= 0, full <= radius, id + ' bounded/unbounded hit mismatch at query ' + i);
      if (actual >= 0) assert(Math.abs(full-actual) <= tolerance);
      if (wasm) {
        const value = wasmDistance(point);
        assert.equal(value < 0, reference < 0, id + ' WASM hit mismatch at query ' + i);
        assert(Math.abs(value-reference) <= tolerance, id + ' WASM distance mismatch at query ' + i);
      }
      assert.equal(actual < 0, reference < 0, id + ' hit mismatch at query ' + i);
      if (actual >= 0) {
        hits++;
        maxErrorM = Math.max(maxErrorM, Math.abs(actual - reference));
        assert(maxErrorM <= tolerance, id + ' distance mismatch at query ' + i);
      }
    });
    return {group: group ? 'far' : 'hull', queries: queries.length, hits, maxErrorM,
      nodeNs, nativeParryNs: parryTimes[group], wasmParryNs};
  });
  console.log(JSON.stringify({site: id, faces: indices.length / 3,
    excludedDegenerateFaces: (source.indices.length - indices.length) / 3, radiusM: radius, groups}));
  if(wasm)compareHull(id,mesh,near,far,wasm,measure);
}

assert([3,4].includes(process.argv.length), 'Pass the native executable and optionally the Parry WASM library.');
const wasm = process.argv[3] && (await WebAssembly.instantiate(readFileSync(process.argv[3]))).instance.exports;
if(wasm)uploadHull(wasm);
const binary = resolve(process.argv[2]);
const temp = mkdtempSync(join(tmpdir(), 'bench-wreck-parry-'));
try {
  for (const id of ['yatush', 'satil']) compareSite(id, join(temp, id + '.txt'), binary, wasm);
} finally {
  rmSync(temp, {recursive: true, force: true});
}
