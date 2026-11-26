// Exercise the room's 200-ms triangle lookahead against the 5-ms articulated
// contact solve. Replaying one predicted penetration for a whole host window
// used to send the fin through a large recoil and terminate the FMI plant.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import T from '../viewer/vendor/three.min.js';
import {diverContactRig} from '../viewer/scuba-diver.mjs';
import {appendDiverRig} from '../viewer/diver-frame.mjs';

const runtime=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',runtime));
const read=async url=>new Response(await readFile(url));
const zero=[0,0,0],bed=()=>-100;
async function model(velocity,pilot) {
  const f=await loadInstance('ScubaDiver',{initialState:[0,0,-12,...velocity,0,0,0,0,0,0,0,0,0,0],
    meshCollision:1,bedHeight:-100,currentVelocity:zero,pilot},read);
  f.logSample=f.get('priorLog');return f;
}
async function drive(label,velocity,pilot,triangle,ground) {
  const f=await model(velocity,pilot),rig=diverContactRig(T),world=()=>null;
  world.triangles=(box,time,span,visit)=>visit(triangle,zero,ground);
  const normalForce=[],hits=new Set();
  let maxStep=0,previous=f.get('state'),peak=0;
  for(let k=0;k<12;k++) {
    const [state,activity]=f.getMany(['state','activity']);
    const packet=[state[14],...state,...activity];
    appendDiverRig(packet,f);
    const contact=rig.sample(packet,0,bed,world,.2);
    for(const input of ['contact','contactMomentArm','contactRelativeVelocity','contactLink','meshSelfContact','meshCollision']) f.set(input,contact[input]);
    f.set('contactWitness',contact.contactWitness??Array(9).fill(0));
    if(contact.contactWitness)hits.add(contact.part);
    for(let j=0;j<20;j++){
      f.advance(.01);
      const [next,force]=f.getMany(['state','contactForce']);
      assert(Number.isFinite(force)&&next.every(Number.isFinite),label);
      maxStep=Math.max(maxStep,Math.hypot(...next.slice(0,3).map((v,i)=>v-previous[i])));
      normalForce.push(force);peak=Math.max(peak,force);previous=next;
    }
  }
  assert(peak>10&&maxStep<.018,label+' contact must carry load without a centre-of-mass jump');
  console.log(label,{peak,maxStep,hits:[...hits]});
  return {normalForce,hits};
}
const head=await drive('Wreck plate',[1.25,0,0],[1,0,0,0,0],[[.73,-3,-19],[.73,3,-19],[.73,0,-8]],false);
assert(head.hits.has('head'));
assert(head.normalForce.slice(0,4).every(f=>f===0),'Lookahead must not apply a future collision before impact');
const fin=await drive('Kicking fin on plating',zero,[1,0,0,.9,0],[[.5,-3,-12.2],[-2.3,-3,-12.2],[-.5,3,-12.2]],false);
assert(fin.hits.has('fin'));
await drive('Descent to sand',[0,0,-.55],[1,0,0,0,0],[[10,-10,-12.3],[-10,-10,-12.3],[0,10,-12.3]],true);

// At the same initial compression a departing plane must release the witness.
// This directly exercises relative obstacle speed and time anchoring.
const probe=await model(zero,[1,0,0,0,0]);
probe.set('contact',[0,0,1,.03]);probe.set('contactLink',1);
probe.set('contactWitness',[1,0,0,0,-11.97,0,0,0,0]);
probe.advance(.01); assert(probe.get('contactForce')>5);
probe.set('contactWitness',[1,0,0,0,-11.97,0,0,-1,.01]);probe.advance(.1);
assert.equal(probe.get('contactForce'),0);
