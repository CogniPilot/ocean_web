// Run against a compiled scripts/fixtures/shark-surface/SharkFacetProbe.mo.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=pathToFileURL(resolve(process.argv[2]??'build/shark-surface','instance.mjs'));
const {loadInstance}=await import(runtime);
const model=await loadInstance('SharkFacetProbe',{},async url=>new Response(await readFile(url)));
const hit=model.get('hit');
assert(Math.abs(hit[0]-.02)<1e-9);
assert.deepEqual(hit.slice(1,4),[0,0,1]);
assert(hit[7]>.029&&hit[7]<.031);
assert.deepEqual(hit.slice(8,11),[0,0,-1]);
model.set('offset',2);
assert.deepEqual(model.get('hit'),Array(14).fill(0));
console.log('Interior triangle contacts matched a 20 mm terrain overlap, a 30 mm voxel overlap and clear water.');
