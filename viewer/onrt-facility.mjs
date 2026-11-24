// The IIHR basin is 40 × 20 × 3 m. The bridge and hall details are reconstructed
// from facility photographs. East is +X, north is -Z and the water surface is Y=0.
import {metricSurface} from './onrt-materials.mjs';

export async function createFacility(T,scene,finishes){
  const hall=new T.Group(),bridge=new T.Group(),trolley=new T.Group();
  scene.add(hall,bridge);bridge.add(trolley);
  const shapes={box:new T.BoxGeometry(1,1,1),tube:new T.CylinderGeometry(.5,.5,1,16)};
  const batches=new Map(),up=new T.Vector3(0,1,0);
  const white=0xf0f1ea,steel=0x798589,iron=0x344347,gold=0xffb724,concrete=0xd7d4c8;
  function part(parent,shape,color,position,scale,rotation=new T.Quaternion()){
    if(!batches.has(parent))batches.set(parent,new Map());
    const group=batches.get(parent),key=shape+color;
    if(!group.has(key))group.set(key,{shape,color,matrices:[]});
    group.get(key).matrices.push(new T.Matrix4().compose(new T.Vector3(...position),rotation,new T.Vector3(...scale)));
  }
  function box(x,y,z,l,h,w,color,parent=hall){part(parent,'box',color,[x,y,z],[l,h,w]);}
  function bar(a,b,diameter,color,parent=hall){
    const delta=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const center=a.map((v,i)=>(v+b[i])/2),length=delta.length();
    part(parent,'tube',color,center,[diameter,length,diameter],new T.Quaternion().setFromUnitVectors(up,delta.normalize()));
  }
  // Ribbed steel hall, roof frames and pendant luminaires.
  for(const side of [-1,1]){
    box(14.5,4.05,side*13.15,49,11,.18,white);
    // The coping ends at |z|=10.20. Begin the deck there so its top
    // and inner face cannot coincide with the basin wall at grazing angles.
    box(14.5,.37,side*11.65,48.2,.30,2.90,concrete);
    box(14.5,-1.24,side*10.10,40,3.52,.20,0xb6d9cc);
    box(14.5,.59,side*10.82,44,.12,.16,steel);
    box(14.5,.72,side*10.82,44,.13,.07,iron);
    for(let x=-9;x<=38;x+=1.1)box(x,5.0,side*13.02,.036,8.2,.06,0xaab1b2);
    for(let x=-5;x<35;x+=1.15){
      bar([x,.38,side*9.99],[x,.24,side*9.87],.065,steel);
      bar([x-.55,.012,side*9.88],[x+.55,.012,side*9.88],.10,Math.round((x+5)/1.15)%2?0x2a3839:gold);
    }
    for(let x=-9;x<=38;x+=4.7){
      box(x,4.8,side*12.88,.22,8.65,.28,steel);
      bar([x,8.9,side*12.9],[x,10.4,0],.23,steel);
      bar([x,8.9,side*12.8],[x,8.9,0],.13,steel);
      for(let j=0;j<5;j++){
        const z=side*j*2.56;
        bar([x,8.92,z],[x,10.4-(j+1)*.30,z+side*2.56],.075,steel);
      }
      box(x,4.6,side*12.78,1.25,.18,.18,0xfaf3d9);
      bar([x,9.8,side*5.6],[x,8.55,side*5.6],.035,iron);
      box(x,8.52,side*5.6,.85,.14,.52,steel);
      box(x,8.42,side*5.6,.81,.06,.48,0xfffae7);
    }
    const roof=new T.Mesh(metricSurface(T,new T.BoxGeometry(49,.14,13.3)),finishes.material('panel',0xe3e7e4));
    roof.position.set(14.5,9.73,side*6.53);roof.rotation.x=side*.116;hall.add(roof);
  }
  for(const x of [-9.6,38.6]){
    box(x,4.55,0,.17,10,26.4,white);
    box(x,2.3,0,.24,3.5,3.1,0x75868a);
    for(let z=-12;z<=12;z+=1.1)box(x+(x<0?.11:-.11),6,z,.05,6.4,.04,0xb0bab9);
  }
  for(const x of [-7.65,36.65])box(x,.37,0,3.9,.30,20.4,concrete);
  for(const x of [-5.6,34.6])box(x,-1.24,0,.2,3.52,20,0xaacac0);
  const beach=new T.Mesh(metricSurface(T,new T.BoxGeometry(3.45,.15,19.65)),finishes.material('rubber',0x596052));
  beach.rotation.z=-.28;beach.position.set(-3.92,-.40,0);hall.add(beach);
  for(let z=-9.7;z<10;z+=.30)bar([-5.48,.10,z],[-2.32,-.80,z],.045,0x858f74);

  // Release platform on the beach end, and the safety rail at its landward edge.
  for(const z of [-4.25,4.25]){
    box(-4.55,.22,z,2.45,.18,3.65,gold);
    box(-4.55,.33,z,2.44,.045,3.64,0xc6c4b7);
    for(const dz of [-1.5,1.5])box(-4.2,-.35,z+dz,.20,1.05,.20,iron);
  }
  box(-5.12,.24,0,1.30,.18,5.1,gold);
  box(-5.12,.35,0,1.30,.045,5.1,0xc6c4b7);
  for(const dz of [-5.8,5.8]){
    bar([-5.61,.4,dz],[-5.61,1.4,dz],.07,gold);
    bar([-5.61,1.4,dz],[-6.91,1.4,dz],.07,gold);
  }
  // A yellow triangular space truss with wheeled end trucks and a transverse measuring carriage.
  for(const offset of [-.76,.76]){
    bar([offset,2.30,-10.8],[offset,2.30,10.8],.14,gold,bridge);
    bar([offset,3.48,-10.8],[offset,3.48,10.8],.14,gold,bridge);
    for(let i=0;i<18;i++){
      const z=-10.8+1.2*i;
      bar([offset,2.30,z],[offset,3.48,z+.60],.087,gold,bridge);
      bar([offset,3.48,z+.60],[offset,2.30,z+1.2],.087,gold,bridge);
      if(offset<0)bar([-.76,3.48,z],[.76,3.48,z+1.2],.075,gold,bridge);
    }
  }
  for(const side of [-1,1]){
    const z=side*10.82;
    box(0,.99,z,3.45,.38,.60,gold,bridge);
    for(const x of [-1.4,1.4]){
      box(x,.81,z,.4,.19,.39,iron,bridge);
      bar([x,1.08,z],[0,4.75,z],.15,gold,bridge);
    }
    bar([0,4.75,z],[0,3.48,z-side*2.6],.14,gold,bridge);
    box(0,1.31,z,.73,.52,.53,0x53656a,bridge);
    box(0,2.22,z,.64,1.24,.47,0x296477,bridge);
    box(0,2.89,z,.13,.11,.13,0xa4ce7a,bridge);
    bar([-.76,2.30,z],[.76,2.30,z],.13,gold,bridge);
  }
  box(0,2.16,0,1.85,.20,1.26,steel,trolley);
  for(const x of [-.6,.6]){
    bar([x,2.15,-.4],[x,1.50,-.4],.055,steel,trolley);
    bar([x,2.15,.4],[x,1.50,.4],.055,steel,trolley);
    box(x,1.47,0,.15,.14,.91,steel,trolley);
    box(x,1.34,0,.13,.14,.16,iron,trolley);
  }
  for(const z of [-.4,.4]){
    bar([-.60,1.50,z],[.60,2.15,z],.06,steel,trolley);
    bar([.60,1.50,z],[-.60,2.15,z],.06,steel,trolley);
    box(0,1.46,z,1.70,.10,.10,steel,trolley);
  }
  // Six independent wedge bodies at 3.3 m pitch share a synchronous command for head seas.
  const wedge=new T.Shape();wedge.moveTo(0,-.54);wedge.lineTo(0,.32);
  wedge.lineTo(-.60,.32);wedge.closePath();
  const wedgeGeometry=metricSurface(T,new T.ExtrudeGeometry(wedge,{depth:3.27,bevelEnabled:false}));
  wedgeGeometry.translate(0,0,-1.635);
  const wedges=[],wedgeMaterial=finishes.material('steel',0xa9bbb7);
  for(let j=0;j<6;j++){
    const z=(j-2.5)*3.3,actuator=new T.Group();actuator.position.set(34.48,0,z);hall.add(actuator);
    actuator.add(new T.Mesh(wedgeGeometry,wedgeMaterial));wedges.push(actuator);
    for(const dz of [-.97,.97]){
      bar([-.23,.28,dz],[-.23,1.3,dz],.065,steel,actuator);
      box(34.25,1.45,z+dz,.19,.56,.19,iron);
    }
    box(34.56,1.71,z,.81,.14,3.23,steel);
  }
  const finishByColor=new Map([
    [white,'panel'],[concrete,'concrete'],[steel,'steel'],[iron,'steel'],[0xc6c4b7,'steel'],
    [0xb6d9cc,'liner'],[0xaacac0,'liner'],[0x2a3839,'rubber'],[0xfffae7,'lamp'],[0xfaf3d9,'lamp']
  ]);
  for(const [parent,batch] of batches)for(const {shape,color,matrices} of batch.values()){
    const m=finishes.material(finishByColor.get(color)??'paint',color,shape);
    const mesh=new T.InstancedMesh(shapes[shape],m,matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));parent.add(mesh);
  }

  // Paint the light-background Rumoca emblem into the floor albedo at its original aspect.
  const image=await new T.ImageLoader().loadAsync('./assets/onrt/rumoca-logo-color.svg');
  const floor=document.createElement('canvas');floor.width=1024;floor.height=2048;
  const ctx=floor.getContext('2d');ctx.fillStyle='#c7e3df';ctx.fillRect(0,0,floor.width,floor.height);
  const logoWidth=590,logoHeight=logoWidth*image.height/image.width;
  ctx.drawImage(image,(floor.width-logoWidth)/2,(floor.height-logoHeight)/2,logoWidth,logoHeight);
  const texture=new T.CanvasTexture(floor);texture.colorSpace=T.SRGBColorSpace;
  const [,floorNormal,floorRough]=finishes.maps.get('concrete');
  const detail=map=>{const t=map.clone();t.repeat.set(20/2.4,40/2.4);return t;};
  const bottom=new T.Mesh(new T.PlaneGeometry(20,40),new T.MeshStandardMaterial({
    map:texture,normalMap:detail(floorNormal),normalScale:new T.Vector2(.2,.2),roughnessMap:detail(floorRough),roughness:.63
  }));
  bottom.rotation.set(-Math.PI/2,Math.PI/2,0,'YXZ');bottom.position.set(14.5,-3,0);hall.add(bottom);
  return {update(x,z,stroke){
    bridge.position.x=Math.max(-4.1,Math.min(33.1,x));
    trolley.position.z=Math.max(-9.8,Math.min(9.8,z));
    for(const wedge of wedges)wedge.position.y=stroke;
  }};
}
