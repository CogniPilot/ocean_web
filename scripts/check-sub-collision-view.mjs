import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {subCollisionShapes} from '../viewer/sub-collision-view.mjs';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const wreck=require('../viewer/wreck.js')(T,{});
const boxesSource=await readFile(new URL('../Wreck/WreckSolids.mo',import.meta.url),'utf8');
const contactSource=await readFile(new URL('../Wreck/structureContact.mo',import.meta.url),'utf8');
const boxes=Array.from(boxesSource.matchAll(/box:=\{([^}]+)\}/g),m=>m[1].split(',').map(Number));
const centers=contactSource.match(/centre\[6,3\]=\[([^\]]+)\]/)[1].split(';').map(row=>row.split(',').map(Number));
const radii=contactSource.match(/radius\[6\]=\{([^}]+)\}/)[1].split(',').map(Number);
const sub=new T.Group();
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
  sphere(frame,at,radius){
    assert.equal(frame,sub);
    assert.equal(radius,radii[sphere]);
    assert.deepEqual(at,centers[sphere++]);
    const world=new T.Vector3(...at).applyMatrix4(frame.matrixWorld);
    const expected=new T.Vector3(...at).applyQuaternion(sub.quaternion).add(sub.position);
    assert(world.distanceTo(expected)<1e-9);
  }
};
shapes.draw(painter,sub);
assert.equal(box,165);
assert.equal(sphere,6);
console.log('Collision overlay matches all 165 solver boxes and six rotated Piccard spheres.');
