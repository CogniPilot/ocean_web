// Fit convex contact pieces to the two checked-in skinned assets in viewer metres.
// node tools/build-swimmer-hulls.mjs replaces the Modelica plane tables and their debug wires.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
globalThis.THREE=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const {GLTFLoader}=await import('../viewer/vendor/gltf-loader.mjs');
const T=globalThis.THREE;
const vec=(x,y,z)=>new T.Vector3(x,y,z);
const digits=x=>Number(x.toFixed(5));

function partition(name,p,material,bones){
  const {x,y,z}=p,side=y>0?'port':'starboard';
  if(name==='whale'){
    if(material==='Ventral flukes'||x<-4.15&&Math.abs(y)>.32)return [side+' fluke',3];
    if(bones.some(b=>b.includes('Flipper'))||Math.abs(y)>1.11)return [side+' flipper',y>0?4:5];
    if(x< -1.7&&x> -3.1&&z>.72)return ['dorsal',1];
    if(x< -3.15)return ['peduncle',2];
    if(x< -1.55)return ['aft torso',1];
    if(x>2.15)return ['rostrum',0];
    return ['torso',0];
  }
  if(x< -1.65&&(z>.0||z<-.29)){
    const upper=z>0;
    return [(upper?'upper':'lower')+' caudal '+(Math.abs(z+.15)>.47?'tip':'root'),3];
  }
  if(z>.30&&x>-.62&&x<.74)return ['dorsal '+(z>.58?'tip':'root'),0];
  if((bones.some(b=>b==='Bone'||b.startsWith('Bone.'))&&Math.abs(y)>.28)||(Math.abs(y)>.47&&z<-.25)){
    return [side+' pectoral '+(Math.abs(y)>.75?'tip':'root'),y>0?4:5];
  }
  // Axial stations follow the changing girth and taper of the snout and peduncle.
  if(x< -1.56)return ['caudal base',2];
  if(x< -1.04)return ['peduncle',2];
  if(x< -.64)return ['rear flank',1];
  if(x< -.18)return ['aft torso',1];
  if(x<.48)return ['mid torso',0];
  if(x<1.04)return ['shoulders',0];
  if(x<1.54)return ['gill region',0];
  if(x<1.98)return ['jaw',0];
  return ['snout',0];
}

function fit(points,triangulate=false){
  const box=new T.Box3().setFromPoints(points),size=box.getSize(vec());
  const planes=[];
  for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
    if(x===0&&y===0&&z===0)continue;
    const n=vec(x/Math.max(.04,size.x),y/Math.max(.04,size.y),z/Math.max(.04,size.z)).normalize();
    let h=-Infinity;
    for(const p of points)h=Math.max(h,n.dot(p));
    planes.push({n,h});
  }
  const wire=[];
  for(let i=0;i<planes.length;i++)for(let j=0;j<i;j++){
    const a=planes[i],b=planes[j],axis=vec().crossVectors(a.n,b.n);
    const den=axis.lengthSq();if(den<1e-8)continue;
    const start=vec().crossVectors(b.n,axis).multiplyScalar(a.h)
      .addScaledVector(vec().crossVectors(axis,a.n),b.h).divideScalar(den);
    let lo=-Infinity,hi=Infinity;
    for(const {n,h} of planes){
      const slope=n.dot(axis),limit=h-n.dot(start);
      if(slope>1e-7)hi=Math.min(hi,limit/slope);
      else if(slope< -1e-7)lo=Math.max(lo,limit/slope);
      else if(limit< -1e-6){hi=-Infinity;break;}
    }
    if((hi-lo)*Math.sqrt(den)>.001){
      for(const t of [lo,hi])wire.push(...start.clone().addScaledVector(axis,t).toArray().map(digits));
    }
  }
  const vertices=[],faces=[];
  if(triangulate){
    const unique=new Map();
    for(let i=0;i<wire.length;i+=3){
      const p=wire.slice(i,i+3),key=p.join(',');
      if(!unique.has(key)){unique.set(key,vertices.length);vertices.push(p);}
    }
    for(const {n,h} of planes){
      const ids=vertices.map((p,i)=>Math.abs(n.dot(vec(...p))-h)<.000018?i:-1).filter(i=>i>=0);
      if(ids.length<3)continue;
      const center=ids.reduce((c,i)=>c.add(vec(...vertices[i])),vec()).divideScalar(ids.length);
      const u=vec(...vertices[ids[0]]).sub(center).normalize(),v=vec().crossVectors(n,u);
      const angle=i=>{const d=vec(...vertices[i]).sub(center);return Math.atan2(d.dot(v),d.dot(u));};
      ids.sort((a,b)=>angle(a)-angle(b));
      for(let j=1;j+1<ids.length;j++)faces.push([ids[0],ids[j],ids[j+1]]);
    }
  }
  return {vertices,faces,planes:planes.map(({n,h})=>[...n.toArray(),h].map(digits)),wire,
    bounds:[...box.min.toArray(),...box.max.toArray()].map(digits)};
}
const sharkMesh=[],rows=[],bounds=[],joints=[],pivots=[],visuals={},counts=[],probes={};
const probeTargets={
  whale:[[-2,0,-.84],[.5,0,-1.23],[4.35,0,-.3],[-.55,3.42,-1.9],[-.55,-3.42,-1.9],[-6,2.16,.25],[-6,-2.16,.25]],
  shark:[[2.32,0,-.19],[1.22,0,-.53],[0,0,-.68],[-1.12,0,-.40],[-2.24,0,-.8],
    [-.22,1.16,-.73],[-.23,-1.16,-.73],[-.01,0,.8],[1.02,0,.2]]
};
for(const name of ['whale','shark']){
  const bytes=await readFile(new URL('../viewer/assets/'+name+'.glb',import.meta.url));
  const {scene:model}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const group=new T.Group(),aligned=new T.Group();group.add(aligned);aligned.add(model);
  model.rotation.x=Math.PI/2;group.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(model,true),size=box.getSize(vec());
  const bone=name=>model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));
  const point=name=>bone(name).getWorldPosition(vec());
  const head=point('Root'),tail=point('Tail_end');
  aligned.rotation.z=-Math.atan2(head.y-tail.y,head.x-tail.x);
  const scale=(name==='whale'?10:4.8)/Math.max(size.x,size.y);
  model.scale.setScalar(scale);
  if(name==='shark')model.position.copy(box.getCenter(vec())).multiplyScalar(-scale);
  group.updateMatrixWorld(true);
  const names=name==='whale'?['Spine3','Spine4','Tail','TopFlipper.L','TopFlipper.R']:['Spine2','Spine3','Tail','Bone','Bone001'];
  const pivot=names.map(n=>point(n).toArray().map(digits));
  while(pivot.length<5)pivot.push([0,0,0]);pivots.push(...pivot);
  const parts=new Map();
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const feed=mesh.morphTargetDictionary?.Feed;
    if(feed!=null)mesh.morphTargetInfluences[feed]=0;
    const weights=mesh.geometry.attributes.skinWeight,ids=mesh.geometry.attributes.skinIndex;
    const samples=[];
    for(let i=0;i<weights.count;i++){
      const p=mesh.localToWorld(mesh.getVertexPosition(i,vec())),bones=[];
      for(let k=0;k<4;k++)if(weights.getComponent(i,k)>.04)bones.push(mesh.skeleton.bones[ids.getComponent(i,k)].name);
      samples.push({p,bones});
      if(name==='whale'){
        const [part,joint]=partition(name,p,mesh.material.name,bones);
        if(!parts.has(part))parts.set(part,{joint,points:[]});
        parts.get(part).points.push(p);
      }
    }
    if(name==='shark'){
      const indices=mesh.geometry.index?.array??samples.map((_,i)=>i);
      for(let i=0;i<indices.length;i+=3){
        const tri=[samples[indices[i]],samples[indices[i+1]],samples[indices[i+2]]];
        const center=tri.reduce((v,sample)=>v.add(sample.p),vec()).divideScalar(3);
        const [part,joint]=partition(name,center,mesh.material.name,tri.flatMap(s=>s.bones));
        if(!parts.has(part))parts.set(part,{joint,points:[]});
        parts.get(part).points.push(...tri.map(s=>s.p));
      }
    }
  });
  visuals[name]=[];
  for(const [part,{points,joint}] of parts){
    const {planes,wire,vertices,faces,bounds:extents}=fit(points,name==='shark');
    if(name==='shark')sharkMesh.push({part,joint,bounds:extents,vertices,faces,planes});
    rows.push(...planes);bounds.push(extents);joints.push(joint);
    visuals[name].push({part,bone:joint?names[joint-1]:null,wire});
    console.log(name,part,extents);
  }
  const vertices=[...parts.values()].flatMap(part=>part.points);
  probes[name]=probeTargets[name].map(target=>{
    const desired=vec(...target);
    let best=vertices[0],dist=Infinity;
    for(const p of vertices){
      const d=desired.distanceToSquared(p);
      if(d<dist){dist=d;best=p;}
    }
    return best.toArray().map(digits);
  });
  counts.push(parts.size);
}
const matrix=data=>'[\n    '+data.map(row=>row.join(',')).join(';\n    ')+']';
const content='within Wreck;\npackage SwimmerHulls "Convex supports in the neutral rig frame, generated by tools/build-swimmer-hulls.mjs"\n'+
  '  constant Integer count[2]={'+counts.join(',')+'};\n  constant Integer joint['+joints.length+']={'+joints.join(',')+'};\n'+
  '  constant Real pivots[10,3]='+matrix(pivots)+';\n  constant Real bounds['+bounds.length+',6]='+matrix(bounds)+';\n'+
  '  constant Real whaleSkin[7,3]='+matrix(probes.whale)+';\n  constant Real sharkSkin[9,3]='+matrix(probes.shark)+';\n'+
  '  constant Real planes['+rows.length+',4]='+matrix(rows)+';\nend SwimmerHulls;\n';
for(const [file,data] of [
  ['../Wreck/SwimmerHulls.mo',content],
  ['../viewer/shark-contact-data.mjs','// Generated by tools/build-swimmer-hulls.mjs in the neutral body frame (metres).\nexport const pivots='+JSON.stringify(pivots.slice(5))+';\nexport const pieces='+JSON.stringify(sharkMesh)+';\n'],['../viewer/assets/swimmer-hulls.json',JSON.stringify({...visuals,probes})+'\n']
]){
  const url=new URL(file,import.meta.url);
  if(process.argv.includes('--check'))assert.equal(await readFile(url,'utf8'),data,file+' is stale');
  else await writeFile(url,data);
}
