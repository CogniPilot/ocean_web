// Convert the geometry-only collision GLB into the ENU triangle soup indexed by the physics worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const T=require('../../../viewer/vendor/three.min.js');
globalThis.THREE=T;
globalThis.self=globalThis;
const {GLTFLoader}=await import('../../../viewer/vendor/gltf-loader.mjs');

const [source,destination]=process.argv.slice(2);
assert(source&&destination,'Usage: node export-collision.mjs input.glb output.json');
const file=await readFile(source);
const {scene,parser}=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
assert(!parser.json.images?.length,'A physics mesh must have no textures');
scene.updateMatrixWorld(true);
const positions=[],indices=[],byPosition=new Map(),triangles=new Set();
const point=new T.Vector3();
scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry,vertices=geometry.getAttribute('position');
  const remap=new Array(vertices.count);
  for(let i=0;i<vertices.count;i++){
    point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
    // glTF +Y is up. Keep hundredths of a millimetre when welding export seams.
    const xyz=[point.x,-point.z,point.y].map(x=>Math.round(x*100000)/100000);
    assert(xyz.every(Number.isFinite),'Invalid collision vertex');
    const key=xyz.join(',');
    if(!byPosition.has(key)){
      byPosition.set(key,positions.length/3);
      positions.push(...xyz);
    }
    remap[i]=byPosition.get(key);
  }
  const faces=geometry.index?.array??Array.from(remap.keys());
  assert.equal(faces.length%3,0);
  for(let i=0;i<faces.length;i+=3){
    const face=[remap[faces[i]],remap[faces[i+1]],remap[faces[i+2]]];
    if(new Set(face).size<3)continue;
    const key=[...face].sort((a,b)=>a-b).join(',');
    if(triangles.has(key))continue;
    triangles.add(key);indices.push(...face);
  }
});
assert(indices.length>0,'Empty collision mesh');
await writeFile(destination+'.tmp',JSON.stringify({positions,indices})+'\n');
await rename(destination+'.tmp',destination);
console.log(source,positions.length/3,'vertices,',indices.length/3,'triangles');
