import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {piccardParts,piccardWireframe,viewport} from '../viewer/piccard-geometry.mjs';
import {subCollisionShapes} from '../viewer/sub-collision-view.mjs';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const wreck=require('../viewer/wreck.js')(T,{});
const boxesSource=await readFile(new URL('../Wreck/WreckSolids.mo',import.meta.url),'utf8');
const contactSource=await readFile(new URL('../Wreck/PiccardSolids.mo',import.meta.url),'utf8');
const boxes=Array.from(boxesSource.matchAll(/box:=\{([^}]+)\}/g),m=>m[1].split(',').map(Number));
const asset=await readFile(new URL('../viewer/assets/survey-pressure-housing.glb',import.meta.url));
globalThis.THREE=T;
const {GLTFLoader}=await import('../viewer/vendor/gltf-loader.mjs');
const {scene:housing}=await new GLTFLoader().parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
housing.rotation.x=Math.PI/2;
const source=async name=>readFile(new URL('../viewer/'+name,import.meta.url),'utf8');
const vehicle=Function(await source('propulsion.js')+'\n'+await source('vehicle.js')+'\nreturn surveyVehicle;')();
const assembled=vehicle(T,housing);
const {mounts,axes}=JSON.parse(housing.getObjectByName('PiccardFrame').userData.thrusterLayout);
const geometry=piccardParts(mounts,axes);
const rows=Array.from(contactSource.matchAll(/row:=\{([^}]+)\}/g),m=>m[1].split(',').map(Number));
assert.equal(geometry.parts.length,rows.length);
for(const [i,{center,half,basis}] of geometry.parts.entries()){
  const expected=[...center,...half,...basis.flat()];
  assert(expected.every((v,j)=>Math.abs(rows[i][j]-v)<1e-9));
}
const wire=piccardWireframe(geometry);
const sub=new T.Group();
sub.add(assembled);
sub.position.set(-3,1,-10);
sub.rotation.set(.30,-.15,.80,'ZYX');
const shapes=subCollisionShapes(T,wreck);
let box=0,sphere=0;
const painter={
  box(frame,at,half){
    const expected=boxes[box++];
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
      const signs=[sx,sy,sz];
      const corner=new T.Vector3(...at).add(new T.Vector3(...half.map((d,i)=>d*signs[i])));
      corner.applyMatrix4(frame.matrixWorld);
      const actual=expected.slice(0,3).map((x,axis)=>x+signs.reduce(
        (displacement,sign,i)=>displacement+sign*expected[3+i]*expected[6+3*i+axis],0));
      assert(corner.distanceTo(new T.Vector3(...actual))<1e-6);
    }
  },
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
assert.equal(box,165);assert.equal(sphere,1);

// Use the actual shell, barrel, rotating propellers and lens geometry.
sub.position.set(0,0,0);sub.quaternion.identity();sub.updateMatrixWorld(true);
const lamp=assembled.getObjectByName('Survey lamp'),lens=assembled.getObjectByName('Survey lamp lens');
const direction=lamp.target.position.clone().sub(lens.position).normalize();
const ray=new T.Raycaster();
for(let i=-1;i<8;i++){
  const a=i*Math.PI/4,p=new T.Vector3(i<0?0:.017*Math.cos(a),i<0?0:.017*Math.sin(a),0);
  lens.localToWorld(p);
  ray.set(p.clone().addScaledVector(direction,1),direction.clone().negate());
  assert.equal(ray.intersectObject(assembled,true)[0]?.object,lens);
}

// Press flush against measured wreck faces, using the Modelica plant in
// its supported level launch orientation. Compare the onset of contact of
// the viewport, skids, housing or ducts against each face normal.
const read=async url=>new Response(await readFile(url));
let contacts=0;
for(const index of [0,1,2,3,4,7,8,11,12,14,15,18,19,20,21,...Array.from({length:100},(_,i)=>i+35)]){
  const plate=boxes[index];
  const dimensions=plate.slice(3,6);
  const axis=dimensions.indexOf(Math.min(...dimensions));
  if(dimensions.filter(v=>v>.45).length<2)continue;
  for(const sign of [1,-1]){
    const n=new T.Vector3(...plate.slice(6+3*axis,9+3*axis)).multiplyScalar(sign);
    let low=new T.Vector3(...viewport.center).dot(n)-viewport.radius;
    for(const {center,half,basis} of geometry.parts)
      low=Math.min(low,new T.Vector3(...center).dot(n)-basis.reduce((sum,v,i)=>sum+Math.abs(new T.Vector3(...v).dot(n))*half[i],0));
    const start=index===0?new T.Vector3(45,0,plate[2]):new T.Vector3(...plate.slice(0,3));
    const probe=async gap=>{
      const center=start.clone().addScaledVector(n,dimensions[axis]-low+gap);
      const plant=await loadInstance('Wreck_Plant',{'body.r_0':center.toArray()},read);
      return new T.Vector3(...plant.get('contactTarget'));
    };
    if((await probe(.01)).length()>.001)continue; // Adjoining plate occupies this side.
    const compressed=await probe(-.004);
    assert(compressed.dot(n)>8,`Plate ${index} side ${sign}, normal load ${compressed.dot(n)}`);
    contacts++;
    break;
  }
  if(contacts>=6)break;
}
assert.equal(contacts,6);
console.log(`Matched ${rows.length} convex pieces and the viewport to the solver. Six measured contact onsets and nine lamp sightlines passed.`);
