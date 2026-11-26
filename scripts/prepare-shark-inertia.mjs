// Integrate shark.glb in its rendered, 4.8 m rest pose. The material density is
// taken uniform and normalized to the plant's 870 kg reference animal.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const T=globalThis.THREE=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
globalThis.self=globalThis;
const {GLTFLoader}=await import('../viewer/vendor/gltf-loader.mjs');
const data=await readFile(new URL('../viewer/assets/shark.glb',import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const group=new T.Group(),aligned=new T.Group();group.add(aligned);aligned.add(scene);
scene.rotation.x=Math.PI/2;group.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(scene,true),size=box.getSize(new T.Vector3());
const position=name=>scene.getObjectByName(name).getWorldPosition(new T.Vector3());
const direction=position('Root').sub(position('Tail_end'));
aligned.rotation.z=-Math.atan2(direction.y,direction.x);
const scale=4.8/Math.max(size.x,size.y);
scene.scale.setScalar(scale);scene.position.copy(box.getCenter(new T.Vector3())).multiplyScalar(-scale);group.updateMatrixWorld(true);
const step=.022,columns=new Map();
scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const ids=mesh.geometry.index.array,points=[];
  for(let i=0;i<mesh.geometry.attributes.position.count;i++)points.push(mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3())));
  for(let i=0;i<ids.length;i+=3){
    const a=points[ids[i]],b=points[ids[i+1]],c=points[ids[i+2]];
    const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
    if(Math.abs(det)<1e-10)continue;
    for(let x=Math.ceil(Math.min(a.x,b.x,c.x)/step);x<=Math.floor(Math.max(a.x,b.x,c.x)/step);x++){
      for(let y=Math.ceil(Math.min(a.y,b.y,c.y)/step);y<=Math.floor(Math.max(a.y,b.y,c.y)/step);y++){
        const ex=x*step-a.x,ey=y*step-a.y;
        const u=(ex*(c.y-a.y)-ey*(c.x-a.x))/det,v=((b.x-a.x)*ey-(b.y-a.y)*ex)/det;
        if(u<0||v<0||u+v>1)continue;
        const key=x+','+y;
        if(!columns.has(key))columns.set(key,[]);
        columns.get(key).push(a.z+u*(b.z-a.z)+v*(c.z-a.z));
      }
    }
  }
});
const bones=['Root','Spine2','Spine3','Tail','Bone','Bone001'];
const names=['Anterior body','Posterior trunk','Caudal peduncle','Caudal fin','Port pectoral','Starboard pectoral'];
const pivots=bones.map(name=>position(name).toArray());
const sums=bones.map(()=>new Float64Array(10));
for(const [key,hits] of columns){
  const [x,y]=key.split(',').map(k=>+k*step);
  hits.sort((a,b)=>a-b);
  const surfaces=hits.filter((v,k)=>k===0||v-hits[k-1]>1e-5);
  for(let j=1;j<surfaces.length;j+=2){
    for(let k=Math.ceil(surfaces[j-1]/step);k<=Math.floor(surfaces[j]/step);k++){
      const z=k*step;
      // The two pectoral blades overlap the trunk axially. Isolate them
      // at the shoulder, then partition the remaining flesh at the joints.
      const wing=Math.abs(y)>.43&&z<-.13&&x>-.45;
      const id=wing?(y>0?4:5):x>pivots[1][0]?0:x>pivots[2][0]?1:x>pivots[3][0]?2:3;
      const terms=[1,x,y,z,y*y+z*z,x*x+z*z,x*x+y*y,-x*y,-x*z,-y*z];
      terms.forEach((value,i)=>sums[id][i]+=value);
    }
  }
}
const count=sums.reduce((total,p)=>total+p[0],0);
const rounded=x=>+x.toFixed(6);
const rows=sums.map(p=>{
  const n=p[0],mass=870*n/count,[x,y,z]=[p[1]/n,p[2]/n,p[3]/n];
  return [mass,x,y,z,mass*(p[4]/n-y*y-z*z),mass*(p[5]/n-x*x-z*z),mass*(p[6]/n-x*x-y*y),
    mass*(p[7]/n+x*y),mass*(p[8]/n+x*z),mass*(p[9]/n+y*z)].map(rounded);
});
const marker='  // BEGIN GLB MASS PROPERTIES',end='  // END GLB MASS PROPERTIES';
const url=new URL('../viewer/board/GreatWhite.mo',import.meta.url),source=await readFile(url,'utf8');
const i=source.indexOf(marker),j=source.indexOf(end);
if(i<0||j<i)throw Error('Missing generated property section');
const matrix=rows=>rows.map(r=>r.map(rounded).join(',')).join(';\n    ');
await writeFile(url,source.slice(0,i)+marker+'\n  parameter Real segments[6,10]=[\n    '+matrix(rows)+
  '] "Rest segment mass, COM XYZ, Ixx Iyy Izz Ixy Ixz Iyz (870 kg reference)";\n  parameter Real pivots[6,3]=[\n    '+matrix(pivots)+
  '] "Bone pivots in metres in the neutral hull frame";\n'+source.slice(j));
const result=bones.map((bone,i)=>({bone,label:names[i],pivot:pivots[i].map(rounded),mass:rows[i][0],center:rows[i].slice(1,4),inertia:rows[i].slice(4)}));
await writeFile(new URL('../viewer/shark-inertia.mjs',import.meta.url),'// Generated with the corresponding GreatWhite parameters by scripts/prepare-shark-inertia.mjs.\nexport const sharkSegments='+JSON.stringify(result,null,2)+';\n');
