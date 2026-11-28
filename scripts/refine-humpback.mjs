// Add the feeding cavity, baleen fringe and eyes to the existing humpback rig.
// Usage: node scripts/refine-humpback.mjs input.glb output.glb
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

const [source,destination]=process.argv.slice(2);
assert(source&&destination&&source!==destination,'Supply separate input and output GLB files');
const input=await readFile(source),jsonLength=input.readUInt32LE(12);
assert.equal(input.readUInt32LE(0),0x46546c67);
const gltf=JSON.parse(input.subarray(20,20+jsonLength)),bin=input.subarray(28+jsonLength);
const mesh=gltf.meshes.find(mesh=>mesh.name==='Humpback');
assert.deepEqual(mesh?.extras?.targetNames,['Feed']);
assert.equal(mesh.primitives.length,2,'Expected the original humpback body and flukes');
const body=mesh.primitives[0],positions=gltf.accessors[body.attributes.POSITION];
assert.equal(positions.count,19666,'The feeding seams and plate ranges refer to this source topology');
const headJoint=gltf.skins[0].joints.findIndex(index=>gltf.nodes[index].name==='Head');
assert(headJoint>=0);

function view(id){return gltf.bufferViews[id].byteOffset??0;}
function point(accessor,i){
  const offset=view(gltf.accessors[accessor].bufferView)+12*i;
  return [0,4,8].map(axis=>bin.readFloatLE(offset+axis));
}
const rest=Array.from({length:positions.count},(_,i)=>point(body.attributes.POSITION,i));
const gape=rest.map(p=>p.slice()),sparse=gltf.accessors[body.targets[0].POSITION].sparse;
for(let row=0;row<sparse.count;row++){
  const i=bin.readUInt16LE(view(sparse.indices.bufferView)+2*row);
  for(let axis=0;axis<3;axis++)gape[i][axis]+=bin.readFloatLE(view(sparse.values.bufferView)+12*row+4*axis);
}
const difference=(a,b)=>a.map((x,i)=>x-b[i]);
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const phase=(u,v)=>Math.sin(u*37+v*13)*Math.sin(u*9-v*29);

const chunks=[bin];
let length=bin.length;
function accessor(array,componentType,type,target){
  const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
  const padding=(4-length%4)%4;
  if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,...(target&&{target})})-1;
  chunks.push(bytes);length+=bytes.length;
  const columns=type==='SCALAR'?1:Number(type.at(-1));
  return gltf.accessors.push({bufferView,componentType,count:array.length/columns,type})-1;
}

function normals(vertices,faces){
  const sums=vertices.map(()=>[0,0,0]);
  for(let i=0;i<faces.length;i+=3){
    const ids=faces.slice(i,i+3),[a,b,c]=ids.map(j=>vertices[j]);
    const normal=cross(difference(b,a),difference(c,a));
    for(const id of ids)for(let axis=0;axis<3;axis++)sums[id][axis]+=normal[axis];
  }
  return sums.map(v=>{const n=Math.hypot(...v);return n>1e-10?v.map(x=>x/n):[0,1,0];});
}
function surface(){
  return {rest:[],gape:[],colours:[],faces:[],add(rows,columns,make,reverse=false){
    const first=this.rest.length;
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
      const {base,opened=base,colour}=make(i/columns,j/rows);
      this.rest.push(base);this.gape.push(opened);this.colours.push(colour);
      if(i<columns&&j<rows){
        const a=first+j*(columns+1)+i,b=a+1,c=b+columns,d=c+1;
        this.faces.push(...(reverse?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
      }
    }
  }};
}
function attach(surface,name,roughness,doubleSided=false){
  const {rest,gape,colours,faces}=surface;
  const normal=normals(rest,faces),targetNormal=normals(gape,faces),bounds=[[],[]];
  for(let axis=0;axis<3;axis++){
    bounds[0].push(Math.min(...rest.map(p=>p[axis])));
    bounds[1].push(Math.max(...rest.map(p=>p[axis])));
  }
  const vector=(list,type='VEC3',target=34962)=>accessor(Float32Array.from(list.flat()),5126,type,target);
  const POSITION=vector(rest);
  [gltf.accessors[POSITION].min,gltf.accessors[POSITION].max]=bounds;
  const NORMAL=vector(normal),COLOR_0=vector(colours);
  const JOINTS_0=accessor(Uint8Array.from(rest.flatMap(()=>[headJoint,0,0,0])),5121,'VEC4',34962);
  const WEIGHTS_0=vector(rest.map(()=>[1,0,0,0]),'VEC4');
  const delta=gape.map((p,i)=>difference(p,rest[i]));
  const movement=vector(delta);
  const normalChange=vector(targetNormal.map((p,i)=>difference(p,normal[i])));
  for(const [key,fn] of [['min',Math.min],['max',Math.max]])
    gltf.accessors[movement][key]=[0,1,2].map(axis=>fn(...delta.map(p=>p[axis])));
  const material=gltf.materials.push({name,doubleSided,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:roughness}})-1;
  mesh.primitives.push({attributes:{POSITION,NORMAL,COLOR_0,JOINTS_0,WEIGHTS_0},material,
    indices:accessor(Uint16Array.from(faces),5123,'SCALAR',34963),targets:[{POSITION:movement,NORMAL:normalChange}]});
}

function mouthSample(vertices,station,across){
  const index=Math.min(13,Math.floor(across*14));
  const first=7314+144*station+2*index,t=across*14-index;
  return [mix(vertices[first],vertices[first+2],t),mix(vertices[first+1],vertices[first+3],t)];
}
function cavity(vertices,station,u,v,bulge){
  const [roof,floor]=mouthSample(vertices,station,u),p=mix(roof,floor,v);
  p[2]-=bulge*Math.sin(Math.PI*v)*Math.sin(Math.PI*u);
  return p;
}

const mouth=surface();
mouth.add(16,30,(u,v)=>{
  const folds=.83+.13*Math.sin(u*51+v*4)+.08*phase(u,v);
  return {base:cavity(rest,0,u,v,.035),opened:cavity(gape,0,u,v,.25),
    colour:[.081,.048,.058].map(c=>c*folds*(.66+.34*Math.abs(2*u-1)))};
},true);
for(const side of [0,1]){
  const cheek=(vertices,u,v)=>{
    const f=u*8,i=Math.min(7,Math.floor(f)),t=f-i;
    // Wrap the deep cavity into both lip corners and taper its visible edge.
    const across=side?1:0,a=cavity(vertices,i,across,v,0),b=cavity(vertices,i+1,across,v,0);
    const p=mix(a,b,t);
    const swing=vertices===gape?1:.24;
    p[0]+=(side?1:-1)*swing*(.027+.044*Math.sin(Math.PI*v)*Math.sin(Math.PI*u));
    p[2]-=.19*Math.pow(u,4)*Math.sin(Math.PI*v);
    return p;
  };
  mouth.add(12,24,(u,v)=>{
    const fold=.83+.16*Math.sin(36*u+3*v)+.08*phase(u,v);
    return {base:cheek(rest,u,v),opened:cheek(gape,u,v),colour:[.080,.051,.060].map(c=>c*fold)};
  },side===1);
}
function tongue(vertices,u,v,full){
  const z=2.4+19*u,i=Math.min(21,Math.floor(z)),band=z-i;
  const rounded=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.43);
  const across=.5+(v-.5)*.84*rounded;
  const point=mix(mouthSample(vertices,i,across)[1],mouthSample(vertices,i+1,across)[1],band);
  const circular=Math.sin(Math.PI*v)*rounded,crease=Math.exp(-(((v-.5)*15)**2));
  point[1]+=.012+(full?.19:.052)*circular*(1-.29*crease);
  return point;
}
mouth.add(22,28,(u,v)=>{
  const mottling=.90+.10*phase(u,v)+.055*Math.sin(v*105+u*13);
  return {base:tongue(rest,u,v,false),opened:tongue(gape,u,v,true),
    colour:[.22,.135,.155].map(c=>c*mottling*(.65+.35*Math.sin(Math.PI*v)))};
},true);
attach(mouth,'Humpback oral folds and tongue',.52,true);

const fringe=surface();
for(let plate=11088;plate<11504;plate+=4){
  const [a,b,c,d]=rest.slice(plate,plate+4);
  for(let strand=0;strand<5;strand++){
    const reach=.024+.062*(.5+.5*Math.sin((plate+strand*13)*.712));
    fringe.add(3,1,(u,v)=>{
      const foot=mix(d,c,(strand+.4+.16*(u-.5))/5),root=mix(a,b,(strand+.4)/5);
      const opened=[foot[0]+Math.sign(foot[0])*(-.026*v),foot[1]-reach*v,
        foot[2]+(foot[2]-root[2])*.33*v+.010*v*v];
      const base=[opened[0]-.020*Math.sign(foot[0]),foot[1]+.07-(reach*.19)*v,opened[2]];
      return {base,opened,colour:mix([.225,.177,.137],[.48,.365,.238],v)};
    });
  }
}
attach(fringe,'Fringed baleen',.65,true);

// Replace the two protruding spheres with recessed corneas and sculpted lids.
const oldEyes=i=>i>=11800&&i<12088||i>=15125&&i<15413;
const indexAccessor=gltf.accessors[body.indices],indices=[];
for(let i=0;i<indexAccessor.count;i+=3){
  const offset=view(indexAccessor.bufferView)+2*i,face=[0,2,4].map(k=>bin.readUInt16LE(offset+k));
  if(!face.some(oldEyes))indices.push(...face);
}
assert(indices.length<indexAccessor.count);
body.indices=accessor(Uint16Array.from(indices),5123,'SCALAR',34963);
const lids=surface(),corneas=surface(),tau=2*Math.PI;
for(const side of [-1,1]){
  function eyeCoordinates(u,r,depth){
    const a=tau*u,h=Math.cos(a)*r,vertical=Math.sin(a)*r*(1-.24*Math.abs(Math.cos(a)));
    return [side*depth,.004+.058*vertical+.016*h,1.572+.111*h];
  }
  lids.add(9,64,(u,t)=>{
    const r=.96+.75*t,a=tau*u;
    const depth=1.134+.024*Math.sin(Math.PI*t)-.088*t*t+.006*Math.sin(a)*Math.sin(Math.PI*t);
    const folds=.83+.17*Math.sin(6*Math.PI*t+2*Math.sin(a)+.42*Math.cos(3*a))+.095*phase(u,t*1.7);
    return {base:eyeCoordinates(u,r,depth),
      colour:mix([.023,.032,.034],[.052,.067,.070],t).map(c=>c*folds)};
  },side<0);
  corneas.add(15,64,(u,v)=>{
    const r=Math.max(.001,v),a=tau*u;
    const pupil=[.003,.007,.009],iris=[.020,.035,.039],rim=[.013,.019,.021];
    let colour=r<.55?mix(pupil,iris,(r/.55)**4):mix(iris,rim,(r-.55)/.45);
    colour=colour.map(c=>c*(.94+.08*Math.cos(21*a)+.03*Math.sin(59*a)));
    return {base:eyeCoordinates(u,r,1.136+.037*(1-r*r)),colour};
  },side<0);
}
attach(lids,'Humpback eyelid folds',.54,true);
attach(corneas,'Humpback cornea and iris',.19,true);

const binary=Buffer.concat(chunks);
gltf.buffers[0].byteLength=binary.length;
const json=Buffer.from(JSON.stringify(gltf)),jsonPad=(4-json.length%4)%4,binPad=(4-binary.length%4)%4;
const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad+binary.length+binPad,8);
jsonHeader.writeUInt32LE(json.length+jsonPad);jsonHeader.writeUInt32LE(0x4e4f534a,4);
binHeader.writeUInt32LE(binary.length+binPad);binHeader.writeUInt32LE(0x004e4942,4);
await writeFile(destination,Buffer.concat([header,jsonHeader,json,Buffer.alloc(jsonPad,0x20),binHeader,binary,Buffer.alloc(binPad)]));
