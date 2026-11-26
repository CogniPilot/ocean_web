// Replay the worker's geometry query without FMI, renderer or network timing.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {collisionSurface, loadWreckContacts} from '../viewer/wreck-contact.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import bed from '../viewer/bathymetry.js';

const fetchAsset = async url => new Response(await readFile(url));
const select = await loadWreckContacts({fetchAsset});
const orientation = [1, 0, 0, 0];
for (const site of wreckSites) {
  const url = new URL('../viewer/assets/red-sea/' + site.id + '/collision.json', import.meta.url);
  const mesh = collisionSurface(await (await fetchAsset(url)).json());
  const sample = site.id === 'yatush' ? [-2.93, -4.1, 2.36] : [-7.08, -6, 3.43];
  const hit = mesh.nearest(sample, 4);
  assert(hit && hit.normal[1] < -0.8);
  const origin = [site.east, site.north, bed.height(site.east, site.north) - site.burial];
  const tangent = [-hit.normal[1], hit.normal[0], 0];
  for (const [scenario, offset] of [['open', 100], ['scrape', 0.15]]) {
    // Slide the upright sub tangentially across the same 20 cm of surveyed hull.
    const poses = Array.from({length: 120}, (_, i) => origin.map((x, j) =>
      x + hit.point[j] + offset * hit.normal[j] + 0.1 * Math.sin(i * Math.PI / 60) * tangent[j]));
    for (const p of poses) select(p, orientation);
    let hits = 0;
    const batch = [];
    for (let n = 0; n < 11; n++) {
      const start = performance.now();
      for (const p of poses) if (select(p, orientation)) hits++;
      batch.push(1000 * (performance.now() - start) / poses.length);
    }
    assert(scenario === 'open' ? hits === 0 : hits > 0);
    batch.sort((a, b) => a - b);
    console.log(site.id, scenario, 'hits', hits + '/' + (11 * poses.length),
      'median microseconds/query', batch[5].toFixed(2));
  }
}
