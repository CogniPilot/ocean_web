// Convert the official CC0 Standard glTF with its adjacent .bin into the game rig.
// node scripts/prepare-scuba-diver.mjs /path/to/Superhero_Male_FullBody.gltf
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const src=process.argv[2];
if(!src)throw Error('Pass the glTF from Universal Base Characters[Standard]/Base Characters/Godot - UE');
const data=JSON.parse(fs.readFileSync(src)),bin=fs.readFileSync(path.join(path.dirname(src),data.buffers[0].uri));
const v=(...p)=>new T.Vector3(...p),quat=()=>new T.Quaternion(),matrix=()=>new T.Matrix4();
const nodes=data.nodes.map(n=>{
  const o=new T.Object3D();o.name=n.name;
  if(n.translation)o.position.fromArray(n.translation);
  if(n.rotation)o.quaternion.fromArray(n.rotation);
  if(n.scale)o.scale.fromArray(n.scale);
  return o;
});
for(const [i,n] of data.nodes.entries())for(const c of n.children??[])nodes[i].add(nodes[c]);
const rig=nodes[data.scenes[0].nodes[0]],frame=new T.Group();frame.add(rig);
// Standing source X/Y/Z are port, up, and anterior. Prone game axes are FLU.
frame.quaternion.setFromRotationMatrix(matrix().makeBasis(v(0,1,0),v(1,0,0),v(0,0,-1)));
frame.position.x=-1.18;frame.updateMatrixWorld(true);
const skin=data.skins[0],jointNodes=skin.joints.map(i=>nodes[i]);
const byName=name=>rig.getObjectByName(name);
const world=o=>o.getWorldPosition(v());
const standingLeg=new Map();
for(const o of jointNodes)if(/^(?:thigh|calf|foot)_[lr]$/.test(o.name)){
  standingLeg.set(o.name,{rotation:o.quaternion.toArray(),axis:v(0,1,0).applyQuaternion(o.getWorldQuaternion(quat()).invert()).toArray()});
}
const rest=jointNodes.map(o=>matrix().copy(frame.matrixWorld).invert().multiply(o.matrixWorld));
function rotateInWorld(o,rotation){
  const parent=o.parent.getWorldQuaternion(quat());
  o.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
  frame.updateMatrixWorld(true);
}
function aim(bone,child,direction){
  const o=byName(bone),from=world(byName(child)).sub(world(o)).normalize();
  rotateInWorld(o,quat().setFromUnitVectors(from,v(...direction).normalize()));
}
const head=byName('Head'),headIndex=jointNodes.indexOf(head);
const faceInHead=head.matrixWorld.clone().invert().multiply(frame.matrixWorld)
  .multiply(matrix().makeTranslation(0,1.699,.09))
  .multiply(matrix().makeBasis(v(0,0,1),v(1,0,0),v(0,1,0)));
rotateInWorld(byName('neck_01'),quat().setFromAxisAngle(v(0,1,0),-.49));
rotateInWorld(head,quat().setFromAxisAngle(v(0,1,0),-.56));
for(const [s,side] of [[1,'l'],[-1,'r']]){
  aim('upperarm_'+side,'lowerarm_'+side,[-.98,s*.16,-.11]);
  aim('lowerarm_'+side,'hand_'+side,[-.94,-s*.045,-.33]);
  aim('hand_'+side,'middle_01_'+side,[-.95,-s*.035,-.28]);
  aim('thigh_'+side,'calf_'+side,[-1,s*.065,-.1]);
  aim('calf_'+side,'foot_'+side,[-.87,s*.045,.5]);
  aim('foot_'+side,'ball_'+side,[-1,s*.045,.08]);
}
const bindFor=jointNodes.map((o,i)=>rest[i].clone().multiply(o.matrixWorld.clone().invert()));
const type={5121:[Uint8Array,1],5123:[Uint16Array,2],5125:[Uint32Array,4],5126:[Float32Array,4]};
const lanes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(id){
  const a=data.accessors[id],b=data.bufferViews[a.bufferView],[ArrayType,bytes]=type[a.componentType],n=lanes[a.type];
  if(b.byteStride&&b.byteStride!==bytes*n)throw Error('Unexpected interleaved source');
  const raw=bin.subarray((b.byteOffset??0)+(a.byteOffset??0),(b.byteOffset??0)+(a.byteOffset??0)+a.count*n*bytes);
  const values=new ArrayType(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  return a.normalized?Float32Array.from(values,x=>x/(256**bytes-1)):values;
}
const positions=[],normals=[],colors=[],weights=[],joints=[],indices=[[],[],[]];
const palette=new Map();
function color(hex){
  if(!palette.has(hex))palette.set(hex,new T.Color(hex).toArray().map(x=>Math.round(255*x)));
  colors.push(...palette.get(hex),255);
}
const mesh=data.meshes[data.nodes.find(n=>n.name==='SuperHero_Male').mesh].primitives[0],attr=mesh.attributes;
const body=read(attr.POSITION),bodyN=read(attr.NORMAL),jointData=read(attr.JOINTS_0),weightData=read(attr.WEIGHTS_0);
for(let i=0;i<body.length;i+=3){
 const [x,y,z]=body.slice(i,i+3);
 positions.push(x,y,z);normals.push(...bodyN.slice(i,i+3));
 // Hood aperture keeps the exposed nose, cheeks and chin within the mask seal.
 const aperture=((y-1.668)/.093)**2+(x/.086)**2;
 const skinTone=y>1.565 && aperture<1.13 && z>.012;
 // Contrast-cut long-sleeve neoprene, padded knees, ankle boots and separate glove cuffs.
 const across=Math.abs(x),sleeve=y>1.26&&across>.18,boot=y<.19,hood=y>1.53&&across<.13;
 let cloth=0x27353e;
 if(sleeve&&across<.66||y>.60&&y<1.36&&across>.105||y>.22&&y<.49&&across>.117)cloth=0x316a88;
 if(sleeve&&across>.22&&across<.39&&y>1.44||y>.65&&y<.93&&across>.15)cloth=0x548d9c;
 if(y>.43&&y<.60&&z>-.03)cloth=0x445159;
 if(boot||hood||across>.69)cloth=0x202d36;
 if(sleeve&&across>.65&&across<.70||y>.165&&y<.19)cloth=0x657781;
 color(skinTone?0xb88b71:cloth);
 const offset=i/3*4;
 const w=Array.from(weightData.slice(offset,offset+4),x=>Math.round(255*x));w[w.indexOf(Math.max(...w))]+=255-w.reduce((a,b)=>a+b,0);
 weights.push(...w);joints.push(...w.map((weight,k)=>weight?jointData[offset+k]:0));
}
// Keep the hood and neck transition on the removable side of the first-person cut.
const faceIndices=[[],[],[]];
const neckIndex=jointNodes.indexOf(byName('neck_01'));
function movesWithHead(i){
  for(let j=4*i;j<4*i+4;j++)
    if(weights[j]>0&&(joints[j]===headIndex||joints[j]===neckIndex))return true;
  return false;
}
const skinIndices=read(mesh.indices);
for(let i=0;i<skinIndices.length;i+=3){
  const a=skinIndices[i],b=skinIndices[i+1],c=skinIndices[i+2];
  const part=movesWithHead(a)||movesWithHead(b)||movesWithHead(c)?faceIndices:indices;
  part[0].push(a,b,c);
}
const attach=(bone)=>typeof bone==='string'?jointNodes.indexOf(byName(bone)):bone;
const root=attach('spine_02');
function add(g,point,scales,hex,{bone=root,orientation=quat(),mat=0}={}){
  const id=attach(bone),i0=positions.length/3;
  g.applyMatrix4(matrix().compose(point,orientation,scales).premultiply(bindFor[id]));
  const pos=g.attributes.position,nor=g.attributes.normal;
  for(let i=0;i<pos.count;i++){
    positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));normals.push(nor.getX(i),nor.getY(i),nor.getZ(i));
    if(g.attributes.color){
      const col=g.attributes.color;colors.push(Math.round(255*col.getX(i)),Math.round(255*col.getY(i)),Math.round(255*col.getZ(i)),255);
    }else color(hex);
    weights.push(255,0,0,0);joints.push(id,0,0,0);
  }
  const ids=g.index?g.index.array:Array.from({length:pos.count},(_,i)=>i);
  for(const index of ids)indices[mat].push(i0+index);
}
const one=v(1,1,1);
function oval(p,scale,hex,opt){add(new T.SphereGeometry(1,16,10),v(...p),v(...scale),hex,opt);}
function tube(points,r,hex,opt={},steps=16){
 const curve=new T.CatmullRomCurve3(points.map(p=>v(...p)));
 add(new T.TubeGeometry(curve,steps,r,8,false),v(),one,hex,opt);
}
function barrel(a,b,r1,r2,hex,opt={}){
 const start=v(...a),end=v(...b),axis=end.clone().sub(start);
 const q=quat().setFromUnitVectors(v(0,1,0),axis.clone().normalize());
 add(new T.CylinderGeometry(r2,r1,axis.length(),20),start.lerp(end,.5),one,hex,{...opt,orientation:q});
}
function disc(a,b,r,c,opt){barrel(a,b,r,r,c,opt);}
const rubber=0x20292d,web=0x333f43,band=0x465053,silver=0xadb4b1,yellow=0xf2c83e,gold=0xba9c41;
// The cylinder sits in a backplate cradle between the buoyancy cells.
const tankZ=.240;
oval([.005,0,.128],[.265,.112,.074],0x374145);
for(const x of [-.135,.138]){
  oval([x,0,.147],[.035,.098,.054],rubber);
  for(const side of [-1,1])tube([[x,side*.054,.158],[x,side*.102,.156],[x,side*.118,.107]],.014,band);
}
disc([-.225,0,tankZ],[.241,0,tankZ],.091,silver,{mat:1});
oval([.241,0,tankZ],[.064,.091,.091],silver,{mat:1});
oval([-.225,0,tankZ],[.051,.091,.091],silver,{mat:1});
disc([-.263,0,tankZ],[-.220,0,tankZ],.091,web);
for(const x of [-.135,.138])disc([x-.016,0,tankZ],[x+.016,0,tankZ],.094,rubber);
disc([.281,0,tankZ],[.339,0,tankZ],.029,0x9d9f94,{mat:1});
barrel([.33,0,tankZ],[.33,-.063,tankZ+.007],.019,.018,0xb7b8b1,{mat:1});
disc([.33,-.049,tankZ],[.33,-.078,tankZ],.024,rubber);
for(const side of [-1,1]){
  // A low-profile back-inflate bladder stays behind the shoulders, clear of the ribs.
  tube([[-.21,side*.073,.153],[-.12,side*.115,.168],[.12,side*.112,.169],[.21,side*.075,.15]],.025,web);

}
const torsoGeometry=new T.BufferGeometry();
torsoGeometry.setAttribute('position',new T.BufferAttribute(body,3));torsoGeometry.setIndex(Array.from(read(mesh.indices)));
const torsoMesh=new T.Mesh(torsoGeometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
function fittedBand(bone,center,axisU,axisV,width,hex){
  const id=attach(bone),toPose=jointNodes[id].matrixWorld.clone().multiply(rest[id].clone().invert());
  const axis=axisU.clone().cross(axisV).normalize(),cast=new T.Raycaster(),verts=[],tris=[];
  for(const edge of [-1,1])for(let j=0;j<48;j++){
    const angle=j*Math.PI/24,d=axisU.clone().multiplyScalar(Math.cos(angle)).addScaledVector(axisV,Math.sin(angle));
    const mid=center.clone().addScaledVector(axis,edge*width/2);
    cast.set(mid.clone().addScaledVector(d,.30),d.clone().negate());
    const hit=cast.intersectObject(torsoMesh,false)[0];
    const point=hit?hit.point.clone().addScaledVector(d,.004):mid.clone().addScaledVector(d,.060);
    verts.push(...point.applyMatrix4(toPose).toArray());
  }
  for(let i=0;i<48;i++){const j=(i+1)%48;tris.push(i,j,48+j,i,48+j,48+i);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(tris);g.computeVertexNormals();
  add(g,v(),one,hex,{bone});
}
// Fit the BCD panels to the torso using the original skinned body in its bind pose.
// Angles around a horizontal section run from the sternum toward the left side.
const trunkToPose=bindFor[root].clone().invert(),tailorRay=new T.Raycaster();
function fabricPoint(origin,direction,offset){
  tailorRay.set(origin.clone().addScaledVector(direction,.48),direction.clone().negate());
  const hit=tailorRay.intersectObject(torsoMesh,false)[0];
  return hit.point.clone().addScaledVector(direction,offset).applyMatrix4(trunkToPose);
}
function chestPoint(angle,height,offset){
  const dir=v(Math.sin(angle),0,Math.cos(angle));
  return fabricPoint(v(0,height,-.017),dir,offset);
}
function panel(across,along,point,hex){
  const pos=[],idx=[];
  for(let side=0;side<2;side++)for(let j=0;j<=along;j++)for(let i=0;i<=across;i++)
    pos.push(...point(i/across,j/along,side*.0045).toArray());
  const width=across+1,n=width*(along+1);
  const quad=(a,b,c,d)=>idx.push(a,b,c,a,c,d);
  for(let j=0;j<along;j++)for(let i=0;i<across;i++){
    const a=i+j*width,b=a+1,c=b+width,d=a+width;
    quad(a,d,c,b);quad(n+a,n+b,n+c,n+d);
    if(i===0)quad(a,n+a,n+d,d);if(i===across-1)quad(b,c,n+c,n+b);
    if(j===0)quad(a,b,n+b,n+a);if(j===along-1)quad(d,n+d,n+c,c);
  }
  // Orient the outer face toward the water, on both mirrored panels.
  const vert=k=>v().fromArray(pos,3*k);
  const norm=vert(n+1).sub(vert(n)).cross(vert(n+width+1).sub(vert(n)));
  if(norm.dot(vert(n).sub(vert(0)))<0)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();add(g,v(),one,hex);
}
function shoulderPoint(side,u,t,offset){
  const arc=-.94+3.70*t,dir=v(0,Math.cos(arc),Math.sin(arc));
  const x=side*(.095+.044*u+.016*Math.sin(Math.PI*t));
  return fabricPoint(v(x,1.377,-.012),dir,offset);
}
for(const side of [-1,1]){
  panel(6,22,(u,t,h)=>shoulderPoint(side,u,t,.007+h),0x32404a);
  panel(2,22,(u,t,h)=>shoulderPoint(side,.25+.50*u,t,.014+h),0x434f55);
  panel(14,8,(u,t,h)=>{
    const a=side*(.40+1.91*u),bottom=1.00+.048*Math.cos(2*u);
    return chestPoint(a,bottom+t*(.26-.055*Math.sin(Math.PI*u)),.010+h+.018*Math.sin(Math.PI*u));
  },0x2d3942);
  panel(9,5,(u,t,h)=>chestPoint(side*(.82+1.18*u),1.05+.133*t,.036+h+.010*Math.sin(Math.PI*u)),0x465058);
  panel(8,2,(u,t,h)=>chestPoint(side*(.83+1.15*u),1.15+.021*t,.046+h),0x627178);
  const ring=shoulderPoint(side,.50,.79,.021);
  const ringPts=[[-.015,.014],[.015,.014],[.015,-.010],[.008,-.019],[-.008,-.019],[-.015,-.010],[-.015,.014]];
  tube(ringPts.map(([y,x])=>ring.clone().add(v(x,y,-.003)).toArray()),.0026,silver,{mat:1},18);
}
panel(48,2,(u,t,h)=>chestPoint((u-.5)*2*Math.PI,1.067+.045*t,.048+h),0x293237);
panel(18,2,(u,t,h)=>chestPoint((u-.5)*1.95,1.358+.023*t,.015+h),0x42505a);
for(const [height,width] of [[1.091,.065],[1.370,.039]]){
  const at=chestPoint(0,height,.030+(height<1.2?.035:0));
  add(new T.BoxGeometry(width*.65,width,.013),at,one,0x222b2e);
  add(new T.BoxGeometry(width*.30,width*.55,.006),at.clone().add(v(0,0,-.008)),one,0x67747b);
}
fittedBand('lowerarm_l',v(.656,1.458,-.064),v(0,1,0),v(0,0,1),.034,0x202c30);
const wrist=world(byName('hand_l')).lerp(world(byName('lowerarm_l')),.18);
add(new T.BoxGeometry(.049,.046,.022),wrist.clone().add(v(0,.01,.034)),one,0x344248,{bone:'lowerarm_l'});
add(new T.BoxGeometry(.036,.034,.006),wrist.clone().add(v(0,.01,.047)),one,0x81abaa,{bone:'lowerarm_l'});
// Corrugated power inflator clipped over the left shoulder, with a two-button control.
const inflatorPath=new T.CatmullRomCurve3([v(.28,.080,.187),...[.36,.49,.62,.76,.89,1].map(t=>shoulderPoint(1,.67,t,.025)),
  chestPoint(.75,1.29,.034)]);
const inf=inflatorPath.getPoints(44);
tube(inf.map(p=>p.toArray()),.0125,0x272e30,{},44);
for(let i=1;i<=27;i++){
  const t=i/29,c=inflatorPath.getPointAt(t),axis=inflatorPath.getTangentAt(t);
  disc(c.clone().addScaledVector(axis,-.0024).toArray(),c.clone().addScaledVector(axis,.0024).toArray(),.0148,0x40484a);
}
const control=inf.at(-1);
oval(control.toArray(),[.032,.017,.018],rubber);
oval(control.clone().add(v(.006,0,-.016)).toArray(),[.010,.009,.004],0xa55742);
const hmat=head.matrixWorld.clone().multiply(faceInHead),hq=quat().setFromRotationMatrix(matrix().extractRotation(hmat));
const hp=(x,y,z)=>v(x,y,z).applyMatrix4(hmat).toArray();
const headOpt={bone:headIndex,orientation:hq};
const equipmentStart=indices.map(list=>list.length);
// Single-window dive mask. Open rings leave the face and the eyes visible through the glass.
// Coordinates are (lateral, vertical) across the face, measured from the eye line.
const outline=[[0,.037],[.047,.036],[.066,.026],[.074,.010],[.072,-.010],[.060,-.024],
  [.031,-.027],[.017,-.024],[0,-.029],[-.017,-.024],[-.031,-.027],[-.060,-.024],
  [-.072,-.010],[-.074,.010],[-.066,.026],[-.047,.036]];
const glassEdge=outline.map(([y,z])=>[y*.935,z<-.02?z*.86+.001+.022*Math.max(0,1-Math.abs(y)/.033):z*.86+.001]);
const faceRay=new T.Raycaster();
function faceDepth(y,z){
  // Map the mask rim back to the forehead, cheeks and temples in the source bind pose.
  faceRay.set(v(y,1.699+z,.30),v(0,0,-1));
  return faceRay.intersectObject(torsoMesh,false)[0].point.z-.090;
}
function ringMesh(rings,hex){
  const verts=rings.flat(2),tris=[],n=rings[0].length;
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){
    const a=j*n+i,b=j*n+(i+1)%n;
    tris.push(a,a+n,b,b,a+n,b+n);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
  g.setIndex(tris);g.computeVertexNormals();add(g,v(),one,hex,{bone:headIndex});
}
const lip=outline.map(([y,z])=>hp(faceDepth(y,z)-.001,y,z));
const outer=outline.map(([y,z])=>hp(.018-.009*(y/.074)**2,y,z));
const rim=outline.map(([y,z])=>hp(.024,y,z));
const inner=glassEdge.map(([y,z])=>hp(.024,y,z));
ringMesh([lip,outer],0x2e4245);
ringMesh([outer,rim,inner],0x457b80);
const glass=new T.ShapeGeometry(new T.Shape(glassEdge.map(([y,z])=>new T.Vector2(y,z))));
glass.applyMatrix4(matrix().makeBasis(v(0,1,0),v(0,0,1),v(1,0,0)));
add(glass,v(...hp(.0235,0,0)),one,0xe1eded,{...headOpt,mat:2});
// A tapered silicone pocket covers the tip and sides of the nose below the window.
const nose=[];
for(const [z,r,w,x] of [[-.021,.009,.011,.011],[-.035,.014,.017,.012],[-.045,.015,.022,.012],[-.052,.009,.017,.008]]){
  nose.push(Array.from({length:24},(_,j)=>{const t=j*Math.PI/12;return hp(x+r*Math.cos(t),w*Math.sin(t),z);}));
}
ringMesh(nose,0x3c4c50);
for(const side of [-1,1]){
  // Fit a single curved eye opening to the underlying cheek and brow mesh.
  // A clipped circular iris shares the surface with the sclera, including along the lids.
  const eye=.032*side;
  const atEye=(y,z)=>{
    const rim=.5*(faceDepth(y,.011)+faceDepth(y,-.012));
    const bulge=.0030*Math.max(0,1-((y-eye)/.013)**2-(z/.0055)**2);
    return hp(Math.max(rim,faceDepth(y,z))+.0015+bulge,y,z);
  };
  const edge=(u,upper)=>.001*u+(upper?.0047:-.0033)*(1-u*u);
  const vertices=[],rgb=[],faces=[];
  for(let i=0;i<=32;i++)for(let j=0;j<=12;j++){
    const u=i/16-1,y=eye+side*.013*u,z=edge(u,false)+(edge(u,true)-edge(u,false))*j/12;
    const iris=Math.hypot(y-eye,z-.0007),shadow=.86+.14*(1-j/12);
    const pigment=iris<.00235?0x302b29:iris<.00525?0x665849:iris<.00585?0x49423b:0xa89a8e;
    vertices.push(...atEye(y,z));rgb.push(...new T.Color(pigment).multiplyScalar(shadow).toArray());
    if(i&&j){const n=13*i+j;faces.push(...(side>0?[n-14,n-1,n,n-14,n,n-13]:[n-14,n,n-1,n-14,n-13,n]));}
  }
  const eyeGeo=new T.BufferGeometry();
  eyeGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  eyeGeo.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  eyeGeo.setIndex(faces);eyeGeo.computeVertexNormals();add(eyeGeo,v(),one,0xffffff,{bone:headIndex});
  for(const upper of [false,true]){
    const points=Array.from({length:13},(_,i)=>{const u=i/6-1;return atEye(eye+side*.013*u,edge(u,upper));});
    tube(points,upper?.00095:.00065,upper?0x705447:0x97755f,{bone:headIndex},6);
  }
  add(new T.BoxGeometry(.019,.006,.014),v(...hp(-.021,side*.075,.006)),one,0x627276,headOpt);
}
// A flat split strap runs from the temple buckles around the back of the hood.
for(const rise of [-.008,.011]){
  const strapRows=[[],[]],tris=[];
  for(let j=0;j<=42;j++){
    const t=Math.PI*j/42,sin=Math.sin(t),y=.078*Math.cos(t);
    for(const [k,edge] of [-.0038,.0038].entries())strapRows[k].push(...hp(-.020-.146*sin,y,.006+rise*sin+edge));
    if(j<42)tris.push(j,j+1,43+j,j+1,44+j,43+j);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(strapRows.flat(),3));
  g.setIndex(tris);g.computeVertexNormals();add(g,v(),one,rubber,{bone:headIndex});
}
const mouth=hp(.018,0,-.070);
oval(mouth,[.031,.045,.031],rubber,headOpt);
oval(hp(.045,0,-.069),[.008,.029,.023],0x828d89,{...headOpt,mat:1});
for(const dz of [-.010,0,.010])tube([hp(.052,-.013,-.069+dz),hp(.053,.015,-.069+dz)],.0022,rubber,{bone:headIndex},2);
// Two short exhaust deflectors vent air sideways from the second stage.
const outlets=[];
for(const side of [-1,1]){
  const start=hp(.018,side*.029,-.080),end=hp(.009,side*.055,-.086);
  barrel(start,end,.013,.011,0x364349,{bone:headIndex});
  outlets.push(end);
}
const mouthSide=hp(.016,-.045,-.071);
// The primary hose comes over the right shoulder and turns down ahead of the
// deltoid. The tank fitting follows the chest and the regulator follows the head.
const primaryRoute=new T.CatmullRomCurve3([[.326,-.041,.257],[.323,-.103,.232],
  [.370,-.138,.177],[.412,-.141,.111],[.464,-.124,.059],[.515,-.093,.028],mouthSide].map(p=>v(...p)));
const hoseSteps=32,hoseSides=8,primary=new T.TubeGeometry(primaryRoute,hoseSteps,.0068,hoseSides,false);
const hoseStart=positions.length/3;
const chestPose=bindFor[root].clone().invert(),headPose=bindFor[headIndex].clone().invert();
for(let ring=0;ring<=hoseSteps;ring++){
  const t=ring/hoseSteps;
  const headWeight=Math.round(255*T.MathUtils.smoothstep(t,.50,.94)),blend=headWeight/255;
  // Invert the same linear-blend transform the vertex shader will use. This
  // preserves the fitted hose in the authored prone pose after re-skinning.
  const unpose=matrix();
  for(let i=0;i<16;i++)unpose.elements[i]=(1-blend)*chestPose.elements[i]+blend*headPose.elements[i];
  unpose.invert();
  for(let j=0;j<=hoseSides;j++){
    const index=ring*(hoseSides+1)+j;
    positions.push(...v().fromBufferAttribute(primary.attributes.position,index).applyMatrix4(unpose).toArray());
    normals.push(...v().fromBufferAttribute(primary.attributes.normal,index).transformDirection(unpose).toArray());
    color(0x353c3d);joints.push(headWeight<255?root:0,headWeight>0?headIndex:0,0,0);
    weights.push(255-headWeight,headWeight,0,0);
  }
}
for(const index of primary.index.array)indices[0].push(hoseStart+index);
// Route the alternate over the left shoulder and clip the second stage to the chest.
const backup=chestPoint(-.69,1.267,.041);
const alternateRoute=[v(.319,-.029,.249),v(.323,-.074,.221),v(.366,-.100,.165),v(.391,-.108,.082),
  v(.377,-.110,.010),...[.32,.47,.62,.77,.92].map(t=>shoulderPoint(-1,.21,t,.024)),
  backup.clone().add(v(-.040,-.009,-.008)),backup];
tube(alternateRoute.map(p=>p.toArray()),.007,0xc4a43d,{},28);
// Both shoulder hoses can cross the eye when free-looking beside the mask.
indices.forEach((list,i)=>{
  for(const index of list.splice(equipmentStart[i]))faceIndices[i].push(index);
});
tube([backup.clone().add(v(.023,0,.010)).toArray(),backup.toArray()],.005,web);
oval(backup.toArray(),[.025,.026,.015],rubber);
oval(backup.clone().add(v(0,0,-.011)).toArray(),[.020,.022,.008],gold);
disc(backup.clone().add(v(0,0,-.019)).toArray(),backup.clone().add(v(0,0,-.021)).toArray(),.008,web);
// Fit the fin to the actual boot in the source rig's bind space. The ankle-to-ball
// vector is diagonal through the foot; it is not the shoe's longitudinal sole axis.
for(const [s,side] of [[1,'l'],[-1,'r']]){
 const bone='foot_'+side,id=attach(bone),ankle=v().setFromMatrixPosition(rest[id]);
 const posed=bindFor[id].clone().invert(),bodyIndices=read(mesh.indices),skinTriangles=[];
 const native=(along,across,height)=>v(ankle.x+across,ankle.y+height,ankle.z+along);
 for(let i=0;i<bodyIndices.length;i+=3){
   const ids=Array.from(bodyIndices.slice(i,i+3)),p=ids.map(j=>v().fromArray(body,j*3));
   if(p.every(k=>k.x*s>.01 && k.y<ankle.y+.16))skinTriangles.push({ids,triangle:new T.Triangle(...p)});
 }
 function section(axis,value){
   const points=[];
   for(const {triangle:{a,b,c}} of skinTriangles)for(const [p,q] of [[a,b],[b,c],[c,a]]){
     if((p[axis]>value)===(q[axis]>value))continue;
     points.push(p.clone().lerp(q,(value-p[axis])/(q[axis]-p[axis])));
   }
   return points;
 }
 // A convex support polygon encloses the irregular toes without modelling
 // five individual toe lobes on the outside of the molded rubber.
 const slices=24;
 function pocketRing(along,clearance){
   const cut=section('z',ankle.z+along);
   if(along>.14){
     // Preserve the oblique toe line between adjacent sections.
     cut.push(...section('z',ankle.z+along-.004),...section('z',ankle.z+along+.004));
   }
   if(!cut.length)throw Error('Fin station does not intersect the foot');
   const supports=Array.from({length:slices},(_,i)=>{
     const a=i*2*Math.PI/slices;
     return Math.max(...cut.map(p=>(p.x-ankle.x)*Math.cos(a)+(p.y-ankle.y)*Math.sin(a)))+clearance;
   });
   return supports.map((d,i)=>{
     const a=i*2*Math.PI/slices,b=(i+1)*2*Math.PI/slices,e=supports[(i+1)%slices],det=Math.sin(b-a);
     return native(along,(d*Math.sin(b)-e*Math.sin(a))/det,(e*Math.cos(a)-d*Math.cos(b))/det);
   });
 }
 function dress(first){
   const nearest=v(),bary=v();
   for(let i=first;i<positions.length/3;i++){
     const p=v().fromArray(positions,i*3);
     let best=Infinity,match;
     for(const entry of skinTriangles){
       entry.triangle.closestPointToPoint(p,nearest);
       const d=p.distanceToSquared(nearest);
       if(d<best){best=d;match=entry;}
     }
     match.triangle.closestPointToPoint(p,nearest);match.triangle.getBarycoord(nearest,bary);
     const summed=new Map();
     for(const [k,source] of match.ids.entries())for(let j=0;j<4;j++){
       const w=bary.getComponent(k)*weightData[source*4+j],joint=jointData[source*4+j];
       if(w>0)summed.set(joint,(summed.get(joint)??0)+w);
     }
     const parts=[...summed].sort((a,b)=>b[1]-a[1]).slice(0,4);
     const total=parts.reduce((n,p)=>n+p[1],0);
     const w=parts.map(p=>Math.round(255*p[1]/total));w[0]+=255-w.reduce((a,b)=>a+b,0);
     for(let j=0;j<4;j++){weights[i*4+j]=w[j]??0;joints[i*4+j]=w[j]?parts[j][0]:0;}
   }
 }
 function loft(rings,hex,{cap=false,follow=false}={}){
   const g=new T.BufferGeometry(),flat=rings.flat(),n=rings[0].length,faces=[];
   const centers=rings.map(r=>r.reduce((sum,p)=>sum.add(p),v()).divideScalar(n));
   const face=(a,b,c,out)=>{
     const normal=flat[b].clone().sub(flat[a]).cross(flat[c].clone().sub(flat[a]));
     faces.push(a,...(normal.dot(out)<0?[c,b]:[b,c]));
   };
   for(let j=0;j+1<rings.length;j++)for(let i=0;i<n;i++){
     const a=j*n+i,b=j*n+(i+1)%n,c=b+n,d=a+n;
     const out=flat[a].clone().add(flat[b]).add(flat[c]).add(flat[d]).multiplyScalar(.25)
       .sub(centers[j].clone().lerp(centers[j+1],.5));
     face(a,b,c,out);face(a,c,d,out);
   }
   if(cap){
     const last=rings.length-1,k=flat.length;flat.push(centers[last]);
     const out=centers[last].clone().sub(centers[last-1]);
     for(let i=0;i<n;i++)face(last*n+i,last*n+(i+1)%n,k,out);
   }
   g.setAttribute('position',new T.Float32BufferAttribute(flat.flatMap(p=>p.toArray()),3));g.setIndex(faces);g.computeVertexNormals();
   const first=positions.length/3;
   add(g.applyMatrix4(posed),v(),one,hex,{bone});
   if(follow)dress(first);
 }
 const forefoot=[.064,.075,.09,.11,.13,.145,.158,.172,.185,.197,.206,.212];
 const pocket=forefoot.map(a=>pocketRing(a,a>.145&&a<.19?.006:.004));
 const toe=pocket[pocket.length-1],center=toe.reduce((sum,p)=>sum.add(p),v()).divideScalar(toe.length);
 for(const [a,scale] of [[.219,.92],[.225,.38]])pocket.push(toe.map(p=>{
   const q=center.clone().lerp(p,scale);q.z=ankle.z+a;return q;
 }));
 loft(pocket,0x303e43,{follow:true,cap:true});
 loft([pocketRing(.062,.004),pocketRing(.065,.007),pocketRing(.073,.007),pocketRing(.076,.004)],0x263034,{follow:true});
 // The spring strap follows a horizontal section of the *heel* on each
 // level of the band. Interpolate the boot's skin weights so the heel and
 // band stay together as the ankle turns and the lower leg flexes.
 function strapPoint(along,angle,h,pad){
   const cut=section('y',ankle.y+h),cx=ankle.x+s*.008,cz=ankle.z+along;
   const dx=Math.cos(angle),dz=Math.sin(angle);
   // Intersect this radial ray with the skin's horizontal triangle segments.
   let distance=-Infinity;
   for(let i=0;i+1<cut.length;i+=2){
     const a=cut[i],b=cut[i+1],ex=b.x-a.x,ez=b.z-a.z,det=dx*ez-dz*ex;
     if(Math.abs(det)<1e-9)continue;
     const t=((a.x-cx)*ez-(a.z-cz)*ex)/det,u=((a.x-cx)*dz-(a.z-cz)*dx)/det;
     if(t>=0&&u>=-1e-6&&u<=1.000001)distance=Math.max(distance,t);
   }
   if(!Number.isFinite(distance))throw Error('Heel strap misses boot contour');
   return v(cx+(distance+pad)*dx,ankle.y+h,cz+(distance+pad)*dz);
 }
 const route=[];
 for(const a of [.09,.078,.063,.047,.028,.014])route.push([a,0]);
 for(let k=1;k<=22;k++)route.push([.014,-Math.PI*k/22]);
 for(const a of [.028,.047,.063,.078,.09])route.push([a,-Math.PI]);
 const strap=route.map(([along,angle])=>{
   const height=-.047+.003*Math.max(0,(along-.014)/.076),half=.016+.003*Math.max(0,-Math.sin(angle));
   return [[-half,.002],[-half,.006],[half,.006],[half,.002]].map(([dh,pad])=>strapPoint(along,angle,height+dh,pad));
 });
 loft(strap,0x1d272b,{follow:true});
 // Buckles bind both ends to the pocket, leaving the heel and Achilles open.
 for(const dir of [0,-Math.PI]){
   const dirSign=dir===0?1:-1;
   const button=strapPoint(.077,dir,-.044,.006);
   const buckle=(a,h,width,height,depth,clearance,hex)=>{
     const p=button.clone().add(v(dirSign*(depth*.5+clearance),h,a));
     const g=new T.BoxGeometry(depth,height,width);
     add(g.translate(p.x,p.y,p.z).applyMatrix4(posed),v(),one,hex,{bone});
   };
   // A low rectangular quick-adjust buckle, its open slot and three molded teeth.
   buckle(0,0,.033,.026,.005,0,0x384146);
   buckle(-.003,0,.017,.014,.002,.005,0x181e21);
   for(const a of [-.008,0,.008])buckle(a,.001,.002,.017,.002,.007,0x525b5e);
 }
 // The blade grows from underneath the sole, clear of the toes. The shallow
 // downward blade angle meets the ankle's swimming angle during the kick.
 const bladePoint=(a,b,h)=>native(a,b+s*.012,-.093-.19*Math.max(0,a-.16)+h);
 standingLeg.get(bone).sole=[native(.004,0,-.090),bladePoint(.595,-.085,-.008),bladePoint(.595,.085,-.008)]
   .map(p=>p.applyMatrix4(rest[id].clone().invert()).toArray());
 const outline=[[.128,-.055],[.20,-.064],[.515,-.096],[.595,-.085],[.574,-.038],[.563,0],[.574,.038],[.595,.085],[.515,.096],[.20,.064],[.128,.055]];
 // Concave tip remains between the two raised side rails.
 const bladeShape=new T.Shape();outline.forEach(([a,b],i)=>i?bladeShape.lineTo(b,a):bladeShape.moveTo(b,a));bladeShape.closePath();
 const blade=new T.ExtrudeGeometry(bladeShape,{depth:.008,bevelEnabled:false}),attrBlade=blade.attributes.position;
 for(let i=0;i<attrBlade.count;i++){
   const p=bladePoint(attrBlade.getY(i),attrBlade.getX(i),-attrBlade.getZ(i));attrBlade.setXYZ(i,p.x,p.y,p.z);
 }
 blade.computeVertexNormals();add(blade.applyMatrix4(posed),v(),one,0x303a39,{bone});
 for(const sign of [-1,1]){
   const rail=(a,b,h)=>bladePoint(a,sign*b,h).applyMatrix4(posed).toArray();
   tube([rail(.14,.050,.002),rail(.264,.063,.005),rail(.455,.083,.005),rail(.584,.080,.005)],.009,yellow,{bone},18);
   tube([rail(.246,.030,.003),rail(.379,.041,.003),rail(.516,.045,.003)],.0045,gold,{bone},12);
 }
}
const doc={asset:{version:'2.0',generator:'Ocean Web scuba rig adaptation',copyright:'Quaternius Universal Base Characters, CC0 1.0; dive equipment by Ocean Web'},scene:0,scenes:[{nodes:[0]}],nodes:[],skins:[],meshes:[],materials:[],bufferViews:[],accessors:[],buffers:[{}]};
const chunks=[];let byteLength=0;
function accessor(array,kind,tuple,target){
 const item=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=doc.bufferViews.length;
 doc.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:item.length,...target&&{target}});
 const pad=(4-item.length%4)%4;chunks.push(item,Buffer.alloc(pad));byteLength+=item.length+pad;
 let dims=lanes[tuple];const a={bufferView:view,componentType:kind,count:array.length/dims,type:tuple};doc.accessors.push(a);return doc.accessors.length-1;
}
const geomAttr={POSITION:accessor(new Float32Array(positions),5126,'VEC3',34962),NORMAL:accessor(new Float32Array(normals),5126,'VEC3',34962),
 COLOR_0:accessor(new Uint8Array(colors),5121,'VEC4',34962),WEIGHTS_0:accessor(new Uint8Array(weights),5121,'VEC4',34962),JOINTS_0:accessor(new Uint8Array(joints),5121,'VEC4',34962)};
const bounds=new T.Box3().setFromBufferAttribute(new T.Float32BufferAttribute(positions,3));
Object.assign(doc.accessors[geomAttr.POSITION],{min:bounds.min.toArray(),max:bounds.max.toArray()});doc.accessors[geomAttr.COLOR_0].normalized=doc.accessors[geomAttr.WEIGHTS_0].normalized=true;
if(positions.length/3>=65536)throw Error('GLB needs 32-bit indices');
doc.meshes=[indices,faceIndices].map((parts,k)=>({
 name:k?'Diver head and regulator':'Diver body and equipment',
 primitives:parts.flatMap((list,i)=>list.length?[{attributes:geomAttr,indices:accessor(new Uint16Array(list),5123,'SCALAR',34963),material:i}]:[])
}));
doc.materials=[['Neoprene, skin and equipment',.76,.04],['Aluminum and nickel-plated brass',.43,.46],['Clear tempered mask lens',.075,0]].map(([name,roughnessFactor,metallicFactor])=>({name,pbrMetallicRoughness:{roughnessFactor,metallicFactor,...(name.includes('lens')?{baseColorFactor:[1,1,1,.11]}:{})},...(name.includes('lens')?{alphaMode:'BLEND',doubleSided:true}:{})}));
const ordered=[rig,...nodes.filter(o=>jointNodes.includes(o))],ids=new Map(ordered.map((o,i)=>[o,i]));
const qAxis=new T.Vector3(0,1,0);
for(const o of ordered){
 const children=o.children.filter(n=>ids.has(n)).map(n=>ids.get(n));
 const def={name:o.name,translation:o.position.toArray(),rotation:o.quaternion.toArray(),...(children.length?{children}:{}),scale:o.scale.toArray()};
 if(/^(?:thigh|calf|foot)_[lr]$/.test(o.name))def.extras={standing:standingLeg.get(o.name),kickAxis:qAxis.clone().applyQuaternion(o.getWorldQuaternion(quat()).invert()).toArray()};
 doc.nodes.push(def);
}
for(const [i,m] of doc.meshes.entries()){
 doc.nodes.push({name:m.name,mesh:i,skin:0,...(i===1?{extras:{exteriorOnly:true}}:{})});
 doc.scenes[0].nodes.push(doc.nodes.length-1);
}
doc.skins=[{joints:jointNodes.map(o=>ids.get(o)),inverseBindMatrices:accessor(new Float32Array(read(skin.inverseBindMatrices)),5126,'MAT4')}];
const wristBone=byName('lowerarm_l');
const screenPose=wristBone.matrixWorld.clone().invert().multiply(matrix().makeTranslation(...wrist.clone().add(v(0,.01,.0505)).toArray()));
const maskView=head.matrixWorld.clone().invert().multiply(hmat).multiply(matrix().makeTranslation(.029,0,0));
// Export the dry masses and principal moments used by the articulated solver.
const diverTree=fs.readFileSync(new URL('../viewer/board/DiverTree.mo',import.meta.url),'utf8');
const values=text=>text.split(',').map(Number);
const mass=values(diverTree.match(/constant Real mass\[15\]=\{([^}]+)\}/)[1]);
const moments=diverTree.match(/constant Real principal\[15,3\]=\[([^\]]+)\]/)[1].split(';').map(values);
if(mass.length!==15||moments.length!==15||moments.some(row=>row.length!==3||!row.every(Number.isFinite)))throw Error('Invalid diver body inertia table');
doc.scenes[0].extras={bodyInertia:{mass,moments},mouth,outlets,maskView:maskView.toArray(),screenPose:screenPose.toArray(),offset:frame.position.toArray(),orientation:frame.quaternion.toArray()};
doc.buffers[0].byteLength=byteLength;
const json=Buffer.from(JSON.stringify(doc)),padding=(4-json.length%4)%4,j=Buffer.concat([json,Buffer.alloc(padding,32)]);
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const output=new URL('../viewer/assets/subsea/scuba-diver.glb',import.meta.url);
fs.writeFileSync(output,Buffer.concat([Buffer.from('glTF'),u32(2),u32(28+j.length+byteLength),u32(j.length),Buffer.from('JSON'),j,u32(byteLength),Buffer.from('BIN\0'),...chunks]));
await import('./prepare-scuba-contacts.mjs');
await import('./prepare-diver-triangles.mjs');
console.log({vertices:positions.length/3,triangles:[...indices,...faceIndices].reduce((a,b)=>a+b.length/3,0),mouth,asset:output.pathname});
