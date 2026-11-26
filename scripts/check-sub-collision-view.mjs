import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadWreckContacts} from '../viewer/wreck-contact.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import terrain from '../viewer/bathymetry.js';
import {piccardParts,piccardWireframe,viewport} from '../viewer/piccard-geometry.mjs';
import {subCollisionShapes} from '../viewer/sub-collision-view.mjs';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const contactSource=await readFile(new URL('../Wreck/PiccardSolids.mo',import.meta.url),'utf8');
function geometryRows(source){
  const table=source.match(/constant Real primitives\[count,7\]=\[([^\]]+)\]/);
  assert(table,'Missing collision geometry table');
  return table[1].split(';').map(row=>row.trim().split(',').map(Number));
}
const asset=await readFile(new URL('../viewer/assets/survey-pressure-housing.glb',import.meta.url));
globalThis.THREE=T;
const {GLTFLoader}=await import('../viewer/vendor/gltf-loader.mjs');
const {scene:housing}=await new GLTFLoader().parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
housing.rotation.x=Math.PI/2;
const source=async name=>readFile(new URL('../viewer/'+name,import.meta.url),'utf8');
// Texture loading is browser-only; these probes exercise only the assembled geometry.
const vehicle=Function('subseaFinish',await source('propulsion.js')+'\n'+await source('vehicle.js')+'\nreturn surveyVehicle;')((T,material)=>material);
const assembled=vehicle(T,housing);
const {mounts,axes}=JSON.parse(housing.getObjectByName('PiccardFrame').userData.thrusterLayout);
const geometry=piccardParts(mounts,axes);
const rows=geometryRows(contactSource);
assert.equal(geometry.parts.length,rows.length);
assert.deepEqual(geometry,piccardParts());
assert.equal(geometry.parts.filter(part=>part.kind==='cylinder').length,7);
assert.equal(geometry.parts.filter(part=>part.kind==='plate').length,6);
for(const [i,{center,half,kind,axis}] of geometry.parts.entries()){
  const expected=[...center,...half,kind==='plate'?0:axis+1];
  assert(expected.every((v,j)=>Math.abs(rows[i][j]-v)<1e-9));
}
const wire=piccardWireframe(geometry);
const sub=new T.Group();
sub.add(assembled);
sub.position.set(-3,1,-10);
sub.rotation.set(.30,-.15,.80,'ZYX');
const shapes=subCollisionShapes();
let sphere=0;
const painter={
  lines(frame,points){
    assert.equal(frame,sub);assert.deepEqual(points,wire);
  },
  sphere(frame,at,radius){
    assert.equal(frame,sub);
    assert.equal(radius,viewport.radius);
    assert.deepEqual(at,viewport.center);sphere++;
  }
};
shapes.draw(painter,sub);
assert.equal(sphere,1);

// Use the actual shell, barrel, rotating propellers and lens geometry.
sub.position.set(0,0,0);sub.quaternion.identity();sub.updateMatrixWorld(true);
const rendered=new T.Box3().setFromObject(assembled,true).getSize(new T.Vector3());
// Box3 transforms the axis-aligned bounds of instanced meshes conservatively.
assert(rendered.x>.64&&rendered.x<.68);
assert(rendered.y>.42&&rendered.y<.44);
// The magnet mates at +0.150 m above the body origin. The keel is at −0.09325 m.
assert(Math.abs(rendered.z-(.150+.09325))<.0005);
for(const name of ['Survey lamp','Starboard survey lamp']){
  const lamp=assembled.getObjectByName(name),lens=assembled.getObjectByName(name+' lens');
  const direction=lamp.target.position.clone().sub(lens.position).normalize();
  const ray=new T.Raycaster();
  for(let i=-1;i<8;i++){
    const a=i*Math.PI/4,p=new T.Vector3(i<0?0:.010*Math.cos(a),i<0?0:.010*Math.sin(a),0);
    lens.localToWorld(p);
    ray.set(p.clone().addScaledVector(direction,1),direction.clone().negate());
    const hit=ray.intersectObject(assembled,true)[0]?.object;
    assert(hit===lens,name+' occluded at probe '+i+' by '+(hit?.name||hit?.type));
  }
}

// The old stern and bridge sit in free water in the live harbor.
const constraints=await loadWreckContacts({sites:wreckSites,bed:terrain,fetchAsset:async url=>new Response(await readFile(url))});
for(const p of [[0,0,-9.8],[18,0,-10]]){
  assert.equal(constraints(p,[1,0,0,0]),null,'Unexpected scan contact at '+p);
}
console.log('Matched '+rows.length+' Piccard convex pieces, viewport and 18 lamp sightlines. Cleared the former wreck site.');
