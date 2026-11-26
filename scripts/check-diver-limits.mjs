// Exercise the physical stops with initially overextended, unloaded joints.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',runtime));
const input={initialState:[0,0,-8,0,0,0,0,0,0,0,0,0,0,0,0,0],bedHeight:-90,policyMode:1,meshCollision:1};
const read=url=>readFile(url).then(data=>new Response(data));
const m=await loadInstance('ScubaDiver',{...input,initialJoints:[.4,-.12,0,0,0,.4,-.12,0,0,0,...Array(10).fill(0)],
  initialLateral:[-.35,.67,.35,-.67,0,0,0,0]},read);
const stops=m.get('stopMoment');
for(const i of [0,5])assert(stops[i]<-50&&stops[i+1]>50);
m.set('jointAction',[1,-1,0,0,0,1,-1,0,0,0]);
m.set('lateralAction',[-1,1,1,-1]);
const targets=m.get('target');
for(const i of [0,5])assert(targets[i]===.32&&targets[i+1]===-.05);
for(let i=0;i<60;i++)m.advance(.01);
const q=m.get('jointAngles'),lat=m.get('lateralAngles');
for(const i of [0,5])assert(q[i]<.36&&q[i+1]>-.09);
assert(lat[0]>-.29&&lat[1]<.59&&lat[2]<.29&&lat[3]>-.59);
console.log('Bilateral extension, hyperextension, adduction and fin cant returned to the stop envelope.');
