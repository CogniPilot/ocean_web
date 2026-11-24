// Run from a configured build tree after compiling the probe with the same Rumoca used for HarborTraffic.
// "$RUMOCA" compile scripts/fixtures/swimmer-skin/SkinProbe.mo -m SkinProbe --source-root build/world-libs --source-root viewer/board/SwimmerCollision.mo --target fmi3 -o build/swimmer-skin-probe
// python scripts/browser-fmi3.py build/swimmer-skin-probe/SkinProbe build/swimmer-skin-probe
// cp viewer/fmi3/instance.mjs build/swimmer-skin-probe/ && node scripts/check-swimmer-skin.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const {loadInstance}=await import(new URL('build/swimmer-skin-probe/instance.mjs',root));
const read=async u=>new Response(await readFile(u));
const T=globalThis.THREE=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const {GLTFLoader}=await import(new URL('viewer/vendor/gltf-loader.mjs',root));
for(const name of ['whale','shark']){
 const whale=name==='whale';
 const m=await loadInstance('SkinProbe',{whale:Number(whale),radius:.001},read);
 const bytes=await readFile(new URL('viewer/assets/'+name+'.glb',root)),{scene:model}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const g=new T.Group(),a=new T.Group();g.add(a);a.add(model);
 model.rotation.x=Math.PI/2;g.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(model,true),size=box.getSize(new T.Vector3()),bone=n=>model.getObjectByName(T.PropertyBinding.sanitizeNodeName(n));
 const point=n=>bone(n).getWorldPosition(new T.Vector3()),head=point('Root'),tail=point('Tail_end');
 a.rotation.z=-Math.atan2(head.y-tail.y,head.x-tail.x);const scale=(whale?10:4.8)/Math.max(size.x,size.y);
 model.scale.setScalar(scale);if(!whale)model.position.copy(box.getCenter(new T.Vector3())).multiplyScalar(-scale);g.updateMatrixWorld(true);
 const names=whale?['Spine3','Spine4','Tail','TopFlipper.L','TopFlipper.R']:['Spine2','Spine3','Tail'];
 const joints=names.map(n=>{const b=bone(n);return {b,axis:(whale?new T.Vector3(0,-1,0):new T.Vector3(0,0,1)).applyQuaternion(b.getWorldQuaternion(new T.Quaternion()).invert()),rest:b.quaternion.clone()};});
 for(const active of [false,true]){
  const angles=whale?[.28,-.12,.22,-.30]:[.1,.33,.45,0];
  m.set('joints',active?angles:[0,0,0,0]);
  if(active){
   const amount=whale?[.6*angles[0],.4*angles[0],...angles.slice(1)]:[angles[0],angles[1]-angles[0],angles[2]-angles[1]];
   joints.forEach(({b,axis,rest},i)=>b.quaternion.copy(rest).multiply(new T.Quaternion().setFromAxisAngle(axis,amount[i])));
   g.updateMatrixWorld(true);
  }
  let hits=0,total=0;
  const bounds=new T.Box3();
  g.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const feed=mesh.morphTargetDictionary?.Feed;if(feed!=null)mesh.morphTargetInfluences[feed]=0;
   for(let i=0;i<mesh.geometry.attributes.position.count;i+=4){
    const p=mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3()));m.set('p',p.toArray());bounds.expandByPoint(p);
    if(m.get('hit')[3]<=0)hits++;total++;
   }
  });
  console.log(name,active,{hits,total,coverage:hits/total,bounds:[bounds.min.toArray(),bounds.max.toArray()]});
  assert(hits/total>(active?.95:.999));
  for(const point of [[8,0,0],[-8,0,0],[0,4,0],[0,-4,0],[0,0,4],[0,0,-4]]){
    m.set('p',point);
    assert(m.get('hit')[3]>0);
  }
 }
}
