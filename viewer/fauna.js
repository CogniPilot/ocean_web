// Weld the colour-split glTF vertices so light flows continuously across each swim pose.
function fishGeometry(T,asset){
 const unique=new Map(),remap=[],source=[],colors=[],counts=[];
 const rest=asset.frames[0];
 for(let i=0;i<rest.length;i+=3){
   const key=rest.slice(i,i+3).join(',');
   if(!unique.has(key)){unique.set(key,source.length);source.push(i);colors.push([0,0,0]);counts.push(0);}
   remap.push(unique.get(key));
 }
 const indices=asset.index.map(i=>remap[i]);
 indices.forEach((id,i)=>{const color=asset.colors[Math.floor(i/3)];counts[id]++;for(let c=0;c<3;c++)colors[id][c]+=color[c];});
 const poses=asset.frames.map(frame=>{
   const g=new T.BufferGeometry();
   g.setIndex(indices);g.setAttribute('position',new T.Float32BufferAttribute(source.flatMap(i=>frame.slice(i,i+3)),3));
   g.computeVertexNormals();return g;
 });
 const geo=poses[0];
 geo.morphAttributes.position=poses.map(g=>g.attributes.position);
 geo.morphAttributes.normal=poses.map(g=>g.attributes.normal);
 geo.setAttribute('color',new T.Float32BufferAttribute(colors.flatMap((rgb,i)=>rgb.map(v=>v/Math.max(1,counts[i]))),3));
 return geo;
}
// Only wing height changes. A sine and cosine morph reproduce every phase of
// the stroke, including the area-weighted normals of the indexed triangles.
function rayWingGeometry(T,side){
 const geometry=new T.PlaneGeometry(1,1,16,12);
 const rest=geometry.attributes.position;
 const morphs=[rest.clone(),rest.clone()];
 for(let i=0;i<rest.count;i++){
   const span=(i%17)/16,chord=Math.floor(i/17)/12;
   rest.setXYZ(i,.62-.89*span-chord*(1.18*(1-span)+.015),side*(.18+1.48*span),.075*Math.sin(Math.PI*chord)*(1-span));
   const amplitude=.36*span**1.4,lag=1.7*span+.45*chord;
   morphs[0].setXYZ(i,0,0,amplitude*Math.cos(lag));
   morphs[1].setXYZ(i,0,0,-amplitude*Math.sin(lag));
 }
 geometry.computeVertexNormals();
 const baseNormal=geometry.attributes.normal.clone();
 geometry.morphAttributes.normal=morphs.map(delta=>{
   const pose=rest.clone();
   for(let i=0;i<pose.count;i++)pose.setZ(i,rest.getZ(i)+delta.getZ(i));
   geometry.setAttribute('position',pose);
   geometry.computeVertexNormals();
   const normals=geometry.attributes.normal.clone();
   for(let i=0;i<normals.count;i++){
     // Each face keeps its projected XY area. Restore the common Z component
     // before blending so that normalizing in the lighting shader is exact.
     const scale=baseNormal.getZ(i)/normals.getZ(i);
     normals.setXYZ(i,scale*normals.getX(i)-baseNormal.getX(i),scale*normals.getY(i)-baseNormal.getY(i),0);
   }
   return normals;
 });
 geometry.setAttribute('position',rest);geometry.setAttribute('normal',baseNormal);
 geometry.morphTargetsRelative=true;
 // All phases lie within 0.36 m of the undeformed mesh.
 geometry.computeBoundingSphere();
 geometry.boundingSphere.radius+=.36;
 geometry.morphAttributes.position=morphs;
 return geometry;
}
function oceanVisitors(T,scene){
 const mat=(color)=>new T.MeshStandardMaterial({color,roughness:.49});
 const dark=mat(0x23414b),under=mat(0xbed5c7);
 function oval(group,color,x,y,z,l,w,h){
   const m=new T.Mesh(new T.SphereGeometry(1,28,16),color);
   m.position.set(x,y,z);m.scale.set(l,w,h);group.add(m);return m;
 }
 const ray=new T.Group();scene.add(ray);
 oval(ray,dark,0,0,0,.72,.42,.15);
 oval(ray,under,.04,0,-.055,.62,.37,.105);
 const wings=[];
 for(const side of [-1,1]){
   const geom=rayWingGeometry(T,side);
   const mesh=new T.Mesh(geom,mat(0x375561));mesh.material.side=T.DoubleSide;
   ray.add(mesh);wings.push(mesh);
   oval(ray,dark,.61,side*.19,.01,.26,.063,.064).rotation.z=side*.26;
 }
 const tailPath=new T.CatmullRomCurve3([[-.4,0,0],[-.92,0,-.03],[-1.48,.06,-.09],[-2.12,.15,-.11]].map(p=>new T.Vector3(...p)));
 ray.add(new T.Mesh(new T.TubeGeometry(tailPath,20,.024,8,false),dark));
 const swimmers=[];
 import('./vendor/gltf-loader.mjs').then(async ({GLTFLoader})=>{
   const loader=new GLTFLoader();
   await Promise.all([['shark',3.2,-10,-4,.095],['whale',9,-18,-7,.043]].map(async ([name,length,lane,depth,speed])=>{
     const {scene:model,animations}=await loader.loadAsync('assets/'+name+'.glb');
     const swimmer=new T.Group();swimmer.name=name;scene.add(swimmer);
     model.rotation.x=Math.PI/2;swimmer.add(model);swimmer.updateMatrixWorld(true);
     const bounds=new T.Box3().setFromObject(model,true);
     const size=bounds.getSize(new T.Vector3());
     const head=model.getObjectByName('Root').getWorldPosition(new T.Vector3());
     const tail=model.getObjectByName('Tail_end').getWorldPosition(new T.Vector3());
     const heading=Math.atan2(head.y-tail.y,head.x-tail.x);
     const scale=length/Math.max(size.x,size.y);model.scale.setScalar(scale);
     model.position.copy(bounds.getCenter(new T.Vector3())).multiplyScalar(-scale);
     const mixer=new T.AnimationMixer(model);mixer.clipAction(animations[0]).play();
     swimmers.push({swimmer,mixer,lane,depth,speed,heading});
   }));
 }).catch(error=>console.error('Marine animal asset',error));
 let dolphin;
 fetch('assets/dolphin.json').then(r=>r.json()).then(asset=>{
   dolphin=new T.Mesh(fishGeometry(T,asset),new T.MeshStandardMaterial({vertexColors:true,roughness:.38,side:T.DoubleSide}));
   scene.add(dolphin);
 });
 return t=>{
   for(const {swimmer,mixer,lane,depth,speed,heading} of swimmers){
     const phase=t*speed;
     swimmer.position.set(12*Math.sin(phase),lane+3*Math.cos(phase),depth+.4*Math.sin(phase*2));
     swimmer.rotation.z=Math.atan2(-3*Math.sin(phase),12*Math.cos(phase))-heading;
     mixer.setTime(t);
   }
   const a=t*.075,b=t*.055;
   ray.position.set(1+9*Math.sin(a),-5.7+1.6*Math.cos(a),-8+.44*Math.sin(.22*t));
   ray.rotation.z=Math.atan2(-1.6*Math.sin(a),9*Math.cos(a));
   if(dolphin){
     dolphin.position.set(8+6*Math.sin(b),5.4+1.5*Math.cos(b),-6.8+.32*Math.sin(.18*t));
     dolphin.rotation.z=Math.atan2(-1.5*Math.sin(b),6*Math.cos(b));
     const phase=t*5.5%8, key=Math.floor(phase);
     dolphin.morphTargetInfluences.fill(0);
     dolphin.morphTargetInfluences[key]=1-(phase-key);
     dolphin.morphTargetInfluences[(key+1)%8]=phase-key;
   }
   const sine=Math.sin(2.4*t),cosine=Math.cos(2.4*t);
   for(const wing of wings){
     wing.morphTargetInfluences[0]=sine;wing.morphTargetInfluences[1]=cosine;
   }
 };
}
