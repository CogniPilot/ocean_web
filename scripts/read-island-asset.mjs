import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

export async function readIslandAsset(){
  const require=createRequire(import.meta.url);
  globalThis.THREE??=require('../viewer/vendor/three.min.js');
  const {GLTFLoader}=await import('../viewer/vendor/gltf-loader.mjs');
  const bytes=await readFile(new URL('../viewer/assets/island/harbor-island.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.rotation.x=Math.PI/2;
  scene.updateMatrixWorld(true);
  return scene;
}
