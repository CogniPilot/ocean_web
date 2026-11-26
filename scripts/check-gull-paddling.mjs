// Exercise the shipped foot forces and the mesh a spectator actually sees.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {birdMesh,GullTrack} from '../viewer/gull.mjs';

const runtime=process.argv[2]?pathToFileURL(resolve(process.argv[2],'instance.mjs')):new URL('../viewer/fmi3/instance.mjs',import.meta.url);
const {loadInstance}=await import(runtime.href);
const three=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const T={...three,TextureLoader:class{load(){return new three.Texture();}}};
const defaults={startWaterMode:2,startState:[0,0,.043,0,0,0,0,0],startMemory:[0,0,.23,0,0,0,0]};
const open=inputs=>loadInstance('HerringGull',inputs,async url=>new Response(await readFile(url)));
const telemetry=['x','wings','memory','surfaceMotion','joints','flowMemory','lateralSpeed','paddleState','webSpread'];
const model=await open({...defaults,pilot:[1,0,0,1]});
const mesh=birdMesh(T),remote=birdMesh(T),track=new GullTrack();
const properties=model.getMany(['bodyProperties','tailProperties']).flat();
mesh.setBodyProperties(properties);
const bodies=mesh.group.userData.physicsBodies;
assert.equal(bodies.length,8);assert(Math.abs(bodies.reduce((m,b)=>m+b.mass,0)-model.get('mass'))<1e-10);
assert(bodies.every(b=>b.moments.length===3&&b.moments.every(i=>i>0)));
const position=o=>o.getWorldPosition(new T.Vector3());
let minHip=Infinity,maxHip=-Infinity,minSpread=Infinity,maxSpread=0,minAnkle=Infinity,maxAnkle=-Infinity;
let measuredTravel=0,last;
for(let step=0;step<220;step++){
  model.advance(.01);
  const row=model.getMany(telemetry).flat();
  mesh.draw(row,step*.01,0);
  track.receive(row,step*10);
  remote.draw(track.at(step*10,0),step*.01,0);
  for(let k=0;k<2;k++){
    const hip=mesh.feet[k].parent.parent.parent;
    assert.equal(hip.rotation.y,row[30-k]);
    const ankle=mesh.feet[k].parent.parent;
    assert.equal(ankle.rotation.y,row[88-k]);
    assert.equal(ankle.scale.y,row[90-k]);
    assert(position(remote.feet[k]).distanceTo(position(mesh.feet[k]))<1e-8);
  }
  assert.equal(bodies[1].frame.rotation.x,row[25]);
  assert.equal(bodies[3].frame.rotation.x,-row[27]);
  assert.equal(bodies[5].frame.rotation.y,row[29]);
  const left=position(mesh.feet[0]);
  if(last)measuredTravel+=left.distanceTo(last);
  last=left;
  minHip=Math.min(minHip,row[29]);maxHip=Math.max(maxHip,row[29]);
  minAnkle=Math.min(minAnkle,row[87]);maxAnkle=Math.max(maxAnkle,row[87]);
  minSpread=Math.min(minSpread,row[89]);maxSpread=Math.max(maxSpread,row[89]);
}
assert(maxHip-minHip>1.5&&maxAnkle-minAnkle>.9&&maxSpread-minSpread>.45&&measuredTravel>1.0);
assert(model.get('x')[0]>.20,'joint-driven strokes propel the bird');
for(const direction of [-1,1]){
  const bird=await open({...defaults,pilot:[1,0,direction,0]});
  const impulse=[0,0];
  for(let step=0;step<260;step++){
    bird.advance(.01);
    const loads=bird.get('footLoads');
    if(step>=30){impulse[0]+=.01*loads[0];impulse[1]+=.01*loads[8];}
  }
  assert(direction*impulse[0]<0&&direction*impulse[1]>0,'opposing web impulses steer a stationary bird');
  assert(direction*bird.get('x')[3]>.12);
}
const air=await open({startState:[0,0,15,0,12,0,0,0],pilot:[1,0,1,1]});
air.advance(.01);
assert(air.get('footLoads').every(v=>v===0),'dry feet supply zero water force');
console.log({hipTravelRad:maxHip-minHip,ankleTravelRad:maxAnkle-minAnkle,webWidthRange:[minSpread,maxSpread],measuredTravel});
const launch=await open({...defaults,pilot:[1,0,0,0]});
for(let step=0;step<35;step++)launch.advance(.01);
launch.set('pilot',[1,1,0,1]);
let peakFootForce=0,upwardImpulse=0;
for(let step=0;step<100;step++){
  launch.advance(.01);
  const f=launch.get('footLoads');
  peakFootForce=Math.max(peakFootForce,f[2]+f[10]);
  upwardImpulse+=.01*(f[2]+f[10]);
}
assert(peakFootForce>launch.get('mass')*9.81&&upwardImpulse>.1,'a jump includes positive upward impulse from immersed feet');
console.log({peakFootForce,upwardImpulse});
