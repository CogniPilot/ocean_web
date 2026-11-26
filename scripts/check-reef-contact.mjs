import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {reefObstacles} from '../viewer/coral-reef.mjs';
import {protectWater} from '../viewer/fish-schools.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {loadWreckContacts,contactStepper} from '../viewer/wreck-contact.mjs';
import bed from '../viewer/bathymetry.js';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const ray=new T.Raycaster(),sand=new T.PlaneGeometry(58,46,74,62),points=sand.attributes.position;
for(let i=0;i<points.count;i++)points.setZ(i,bed.shelf.vertex(points.getX(i),points.getY(i)));
const mesh=new T.Mesh(sand);mesh.position.set(...bed.shelf.center,0);mesh.updateMatrixWorld();
for(let i=1;i<180;i++){
  const east=7+(i*13.7341)%58,north=17+(i*17.1831)%46,face=bed.shelf.plane(east,north);
  ray.set(new T.Vector3(east,north,20),new T.Vector3(0,0,-1));
  const hit=ray.intersectObject(mesh)[0];
  assert(Math.abs(face.height-hit.point.z)<.00001,'Raycast and collision depth disagree');
  assert(hit.face.normal.dot(new T.Vector3(...face.normal))>.999999);
}

const pose=new T.Object3D();pose.position.set(10,23,-4);pose.rotation.set(.1,.3,.55);pose.scale.set(1.2,.7,.9);pose.updateMatrix();
const bounds=[new T.Box3(new T.Vector3(-.45,-.20,-.04),new T.Vector3(.45,.20,.6))];
const reef=reefObstacles(T,[{form:0,matrix:pose.matrix}],bounds);
const start=new Float64Array([8,23,-3.8,2,0,0]),end=new Float64Array([12,23,-3.8,2,0,0]);
const hit=reef.sweep(...start.slice(0,3),...end.slice(0,3),.09);
assert(hit.fraction>0&&hit.fraction<.6&&hit.nx<0);
assert.equal(protectWater(start,end,1,reef.sweep,new Float64Array([0,.10,.09]),[1]),1);
assert.equal(reef.sweep(...end.slice(0,3),...end.slice(0,3),.09),null);
assert(reef.sweep(10,23,-3.8,10,23,-3.8,.06).penetration>0);
assert.equal(reef.sweep(8,23,-2,12,23,-2,.12),null);

const select=await loadWreckContacts({fetchAsset:async u=>new Response(await readFile(u))});
assert.equal(select([13,40,-2],[1,0,0,0]),null);
assert(select([13,40,-5.5],[1,0,0,0])[5]>0,'Buried hull needs an upward contact normal');
const plant=await loadInstance('Wreck_Plant',{spawnPosition:[10.3,40,-9.6],spawnVelocity:[1.4,0,0],
  spawnHeading:0,manual:1,manualMode:2,pilot:[0,1,0,0]},async u=>new Response(await readFile(u)));
const update=contactStepper(select,()=>plant.getMany(['position','orientation']),r=>plant.set('scanConstraints',r));
let peak=0,min=Infinity;
for(let i=0;i<250;i++){
  update();plant.advance(.01);
  const [x,y,z]=plant.get('position');min=Math.min(min,z-bed.surfaceHeight(x,y));
  peak=Math.max(peak,plant.get('contactForce')[2]);
}
assert(peak>2&&min>0,'Piccard crossed the island shelf');
console.log('Island surface matched 179 rendered triangles. Fish swept/overlap/clearance checks passed.',{peakVerticalForce:peak,minHullCenterAboveSand:min});
