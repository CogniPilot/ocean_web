// All NPC instances share the skin, textures and eight authored swim poses.
const skins=new WeakMap();

function mantaAsset(name){
  const url=new URL('./assets/subsea/'+name,import.meta.url);
  url.search=new URL(import.meta.url).search;
  return url;
}

function unpack(text,Type){
  const binary=atob(text),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Type(bytes.buffer);
}

function geometryFromPoses(T,data){
  const index=new T.Uint16BufferAttribute(unpack(data.triangles,Uint16Array),1);
  const positions=[],normals=[],seams=[];
  // Atlas halves and the throat have distinct UVs along physically shared edges.
  // Keep those edges smooth for the entire stroke.
  const rest=unpack(data.poses[0],Int16Array),copies=new Map();
  for(let i=0;i<rest.length/3;i++){
    const key=rest[3*i]+','+rest[3*i+1]+','+rest[3*i+2];
    let group=copies.get(key);if(!group){group=[];copies.set(key,group);}
    group.push(i);if(group.length===2)seams.push(group);
  }
  for(const pose of data.poses){
    const packed=unpack(pose,Int16Array),geometry=new T.BufferGeometry();
    const points=Float32Array.from(packed,v=>v*data.positionUnit);
    const position=new T.BufferAttribute(points,3);
    geometry.setIndex(index);geometry.setAttribute('position',position);
    geometry.computeVertexNormals();
    const normal=geometry.getAttribute('normal');
    for(const group of seams){
      let x=0,y=0,z=0;
      for(const i of group){x+=normal.getX(i);y+=normal.getY(i);z+=normal.getZ(i);}
      const length=Math.hypot(x,y,z)||1;
      for(const i of group)normal.setXYZ(i,x/length,y/length,z/length);
    }
    positions.push(position);normals.push(normal);
  }
  const geometry=new T.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position',positions[0]);geometry.setAttribute('normal',normals[0]);
  geometry.setAttribute('uv',new T.Uint16BufferAttribute(unpack(data.texcoords,Uint16Array),2,true));
  geometry.setAttribute('color',new T.Uint8BufferAttribute(unpack(data.colors,Uint8Array),3,true));
  geometry.morphAttributes.position=positions;geometry.morphAttributes.normal=normals;
  // The two wing hinges share vertices with the central disc. Blend skin
  // weights only within the shoulder so the outside foil follows its hinge.
  const n=positions[0].count,indices=new Uint16Array(4*n),weights=new Float32Array(4*n);
  for(let i=0;i<n;i++){
    const y=positions[0].getY(i),t=Math.min(1,Math.max(0,(Math.abs(y)-.46)/.15));
    indices[4*i+1]=y>=0?1:2;weights[4*i]=1-t;weights[4*i+1]=t;
  }
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  geometry.computeBoundingSphere();
  return geometry;
}

async function loadSkin(T,assetUrl){
  const response=await fetch(assetUrl('manta.json'));
  if(!response.ok)throw Error('Manta mesh HTTP '+response.status);
  const data=await response.json(),geometry=geometryFromPoses(T,data);
  const loader=new T.TextureLoader(),maps=[];
  try{
    const textures=await Promise.allSettled(['manta-anatomy-albedo.webp','manta-anatomy-surface.webp']
      .map(name=>loader.loadAsync(String(assetUrl(name)))));
    for(const result of textures)if(result.status==='fulfilled')maps.push(result.value);
    const failure=textures.find(result=>result.status==='rejected');
    if(failure)throw failure.reason;
    const [albedo,surface]=maps;
    albedo.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshStandardMaterial({map:albedo,bumpMap:surface,bumpScale:.0007,
      roughnessMap:surface,roughness:.95,vertexColors:true});
    return {geometry,material,cycle:data.cycle,contactCapsules:data.contactCapsules,dispose(){
      geometry.dispose();material.dispose();for(const map of maps)map.dispose();
    }};
  }catch(error){geometry.dispose();for(const map of maps)map.dispose();throw error;}
}

export async function loadMantaModel(T,{signal,assetUrl=mantaAsset}={}){
  signal?.throwIfAborted();
  let cache=skins.get(T);if(!cache){cache=new Map();skins.set(T,cache);}
  const key=String(assetUrl('manta.json'));
  let entry=cache.get(key);
  if(!entry){entry={asset:loadSkin(T,assetUrl),users:0};cache.set(key,entry);}
  entry.users++;
  let active=true,mesh;
  function dispose(){
    if(!active)return;active=false;
    signal?.removeEventListener('abort',dispose);mesh?.removeFromParent();mesh?.skeleton.dispose();
    if(--entry.users===0){
      cache.delete(key);entry.asset.then(skin=>skin.dispose(),()=>{});
    }
  }
  signal?.addEventListener('abort',dispose,{once:true});
  let skin;
  try{skin=await entry.asset;signal?.throwIfAborted();}catch(error){dispose();throw error;}
  mesh=new T.SkinnedMesh(skin.geometry,skin.material);mesh.name='Reef manta ray';
  const trunk=new T.Bone(),port=new T.Bone(),starboard=new T.Bone();
  trunk.name='Manta trunk';port.name='Port pectoral joint';starboard.name='Starboard pectoral joint';
  port.position.y=.48;starboard.position.y=-.48;
  port.userData.physicsJoint={axis:[1,0,0],label:port.name};
  starboard.userData.physicsJoint={axis:[-1,0,0],label:starboard.name};
  mesh.add(trunk);trunk.add(port,starboard);mesh.bind(new T.Skeleton([trunk,port,starboard]));
  mesh.frustumCulled=false;
  const weights=mesh.morphTargetInfluences;
  function setSwim(phase,stroke=1){
    port.rotation.x=0;starboard.rotation.x=0;
    if(!Number.isFinite(phase)||!Number.isFinite(stroke))return;
    const t=(phase-Math.floor(phase))*weights.length,k=Math.floor(t),blend=t-k;
    const gain=Math.min(1.25,Math.max(0,stroke));
    weights.fill(0);weights[0]=1-gain;weights[k]+=gain*(1-blend);
    weights[(k+1)%weights.length]+=gain*blend;
  }
  function setWing(angle,rate,other=angle){
    if(!Number.isFinite(angle)||!Number.isFinite(other))return;
    weights.fill(0);
    port.rotation.x=angle;starboard.rotation.x=-other;
  }
  setSwim(0);
  return {mesh,frames:[trunk,port,starboard],setSwim,setWing,dispose,cycle:skin.cycle,contactCapsules:skin.contactCapsules};
}
