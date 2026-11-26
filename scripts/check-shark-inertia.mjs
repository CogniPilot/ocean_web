// Check that the masses drawn at each live joint are actually consumed by the
// FMI swimmer, and that an internal motor impulse induces a body reaction.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sharkSegments} from '../viewer/shark-inertia.mjs';
const dir=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',dir));
const read=async url=>new Response(await readFile(url));
const initial=Array(17).fill(0);initial[9]=-18;initial[10]=5;initial[11]=8;
const model=await loadInstance('HarborTraffic',{initialState:initial,initialFish:Array(10).fill(0),sharkDirect:1,sharkActuators:[.25,0,0,0]},read);
const raw=sharkSegments.flatMap(b=>[b.mass,...b.center,...b.inertia]);
assert.deepEqual(model.get('whiteShark.segments'),raw);
const M=sharkSegments.reduce((s,b)=>s+b.mass,0);
assert(Math.abs(M-870)<.00001);
const c=[0,1,2].map(k=>sharkSegments.reduce((sum,b)=>sum+b.center[k]*b.mass/M,0));
const moments=[0,1,2].map(k=>sharkSegments.reduce((sum,b)=>{
  const a=(k+1)%3,d=(k+2)%3;
  return sum+b.inertia[k]+b.mass*((b.center[a]-c[a])**2+(b.center[d]-c[d])**2);
},0));
model.advance(.002);
const H=model.get('whiteShark.lockedInertia');
assert(H.slice(0,3).every((v,i)=>Math.abs(moments[i]-v)<.02));
assert(H[2]*H[4]>H[3]**2&&H[3]>0);
model.advance(.008);
const fish=model.get('fish'),momentum=H[2]*fish[8]+H[3]*fish[6];
assert(fish[6]>.1&&fish[8]<0,'peduncle drive must counter-rotate the body');
assert(Math.abs(momentum)<.02,'internal yaw momentum transfer');
for(let i=0;i<20;i++)model.advance(.01);
const bent=model.get('whiteShark.lockedInertia');
assert(Math.abs(H[2]-bent[2])>.2,'a swept tail must alter the yaw moment');
console.log({segments:sharkSegments.length,mass:M,neutral:H,swept:bent,angularMomentum:momentum});
