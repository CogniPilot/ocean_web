// Exercise tail loading, kinematics, and the multiplayer presentation pose.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {birdMesh,GullTrack} from '../viewer/gull.mjs';

const runtime=process.argv[2]?pathToFileURL(resolve(process.argv[2],'instance.mjs')):new URL('../viewer/fmi3/instance.mjs',import.meta.url);
const {loadInstance}=await import(runtime.href);
const open=inputs=>loadInstance('HerringGull',inputs,async url=>new Response(await readFile(url)));
const three=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const T={...three,TextureLoader:class{load(){return new three.Texture();}}};
const telemetry=['x','wings','memory','surfaceMotion','joints','flowMemory','lateralSpeed','paddleState','webSpread','launchWakePower','tailState'];

const torque=[];
for(const cant of [-.12,0,.12]){
  const m=await open({startMemory:[0,0,.015,0,0,.19,0],startTail:[cant,0,0,.30,0]});
  torque.push(m.get('tailTurnMoment'));
}
assert(torque[2]>.012&&Math.abs(torque[1])<1e-10&&Math.abs(torque[0]+torque[2])<1e-10);
const still=await open({wind:[13.4,0],startMemory:[0,0,.015,0,0,.19,0],startTail:[.12,0,0,.89,0]});
assert.equal(Math.abs(still.get('tailTurnMoment')),0);
assert.equal(Math.abs(still.get('tailLift')),0);

const slow=await open({startState:[0,0,3,0,6,-.3,0,0],pilot:[1,0,0,-1]});
const fast=await open({startState:[0,0,100,0,14,0,0,0],pilot:[1,0,1,-1]});
for(let j=0;j<45;j++){fast.advance(.01);slow.advance(.01);}
const fastState=fast.get('tailState'),slowState=slow.get('tailState');
assert(slowState[4]>.73&&fastState[4]<.37,'Slow flight opens the fan');
assert(fastState[1]>.01&&fastState[1]<.13,'Cant gives modest assistance in a banked turn');
const [area,arm]=slow.get('tailGeometry'),[narrow,cruiseArm]=fast.get('tailGeometry');
assert(area>1.5*narrow&&arm<cruiseArm,'Opening the fan changes its flow area and pressure centre');

const mesh=birdMesh(T),track=new GullTrack();
mesh.setBodyProperties(fast.getMany(['bodyProperties','tailProperties']).flat(),fast.get('wingProducts'));
const fan=mesh.group.getObjectByName('Gull rectrices'),cant=mesh.group.getObjectByName('Gull tail cant');
const narrowVertices=fan.geometry.attributes.position,wideVertices=fan.geometry.morphAttributes.position[0];
const width=v=>{let lo=Infinity,hi=-Infinity;for(let i=0;i<v.count;i++){lo=Math.min(lo,v.getY(i));hi=Math.max(hi,v.getY(i));}return hi-lo;};
assert(width(wideVertices)>1.8*width(narrowVertices),'The wide state must visibly fan the rectrices');
const row=fast.getMany(telemetry).flat();track.receive(row,100);mesh.draw(track.at(100,0));
assert.equal(row.length,98);assert.equal(cant.rotation.x,fastState[1]);
assert.equal(cant.parent.rotation.y,-fastState[0]);
const body=mesh.group.userData.physicsBodies.at(-1),properties=fast.get('tailProperties');
assert.equal(body.frame,cant);
for(const [i,v] of [body.mass,...body.center,...body.moments].entries())assert(Math.abs(properties[i]-v)<1e-10);
track.clear();track.receive(row.slice(0,92),110);mesh.draw(track.at(110,0));
assert.equal(cant.rotation.x,0);assert.equal(fan.morphTargetInfluences[0],0);
console.log({opposedTailTorquesNm:torque,slowAreaM2:area,cruiseAreaM2:narrow,cruiseCantRad:fastState[1],
  tuckedWidthM:width(narrowVertices),spreadWidthM:width(wideVertices)});
