// The IIHR basin is 40 × 20 × 3 m. The bridge and hall details are reconstructed
// from facility photographs. East is +X, north is -Z and the water surface is Y=0.
export async function createFacility(T,scene){
  const hall=new T.Group(),bridge=new T.Group(),trolley=new T.Group();
  scene.add(hall,bridge);bridge.add(trolley);
  const shapes={box:new T.BoxGeometry(1,1,1),tube:new T.CylinderGeometry(.5,.5,1,10)};
  const batches=new Map(),up=new T.Vector3(0,1,0);
  const white=0xd4d8d7,steel=0x798589,iron=0x344347,gold=0xf9ae16,concrete=0xa9ada7;
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
    box(14.5,.37,side*11.55,45,.30,3.1,concrete);
    box(14.5,-1.24,side*10.10,40,3.52,.20,0xb6d9cc);
    box(14.5,.59,side*10.82,44,.12,.16,steel);
    box(14.5,.72,side*10.82,44,.13,.07,iron);
    for(let x=-9;x<=38;x+=1.1)box(x,5.0,side*13.02,.036,8.2,.06,0xaab1b2);
    for(let x=-5;x<35;x+=1.15){
      box(x,.37,side*9.96,.4,.28,.23,iron);
      box(x,-.08,side*9.88,1.10,.12,.14,Math.round((x+5)/1.15)%2?0x2a3839:gold);
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
    const roof=new T.Mesh(new T.BoxGeometry(49,.14,13.3),new T.MeshStandardMaterial({color:0xcad1d3}));
    roof.position.set(14.5,9.73,side*6.53);roof.rotation.x=side*.116;hall.add(roof);
  }
  for(const x of [-9.6,38.6]){
    box(x,4.55,0,.17,10,26.4,white);
    box(x,2.3,0,.24,3.5,3.1,0x75868a);
    for(let z=-12;z<=12;z+=1.1)box(x+(x<0?.11:-.11),6,z,.05,6.4,.04,0xb0bab9);
  }
  for(const x of [-7.55,36.55])box(x,.37,0,4.1,.30,20,concrete);
  for(const x of [-5.6,34.6])box(x,-1.24,0,.2,3.52,20,0xaacac0);
  const beach=new T.Mesh(new T.BoxGeometry(3.45,.15,19.65),new T.MeshStandardMaterial({color:0x5c6653}));
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
      bar([-.76,3.48,z],[.76,3.48,z+1.2],.075,gold,bridge);
    }
  }
  for(const side of [-1,1]){
    const z=side*10.82;
    box(0,.99,z,3.45,.38,.60,gold,bridge);
    for(const x of [-1.4,1.4]){
      box(x,.81,z,.4,.19,.39,iron,bridge);
      bar([x,1.08,z],[0,4.75,z],.15,gold,bridge);
      bar([0,4.75,z],[0,3.48,z-side*2.6],.14,gold,bridge);
    }
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
  const wedgeGeometry=new T.ExtrudeGeometry(wedge,{depth:3.27,bevelEnabled:false});
  wedgeGeometry.translate(0,0,-1.635);
  const wedges=[],wedgeMaterial=new T.MeshStandardMaterial({color:0x748683,metalness:.36,roughness:.42});
  for(let j=0;j<6;j++){
    const z=(j-2.5)*3.3,actuator=new T.Group();actuator.position.set(34.48,0,z);hall.add(actuator);
    actuator.add(new T.Mesh(wedgeGeometry,wedgeMaterial));wedges.push(actuator);
    for(const dz of [-.97,.97]){
      bar([-.23,.28,dz],[-.23,1.3,dz],.065,steel,actuator);
      box(34.25,1.45,z+dz,.19,.56,.19,iron);
    }
    box(34.56,1.71,z,.81,.14,3.23,steel);
  }
  for(const [parent,batch] of batches)for(const {shape,color,matrices} of batch.values()){
    const m=new T.MeshStandardMaterial({color,roughness:.70,metalness:color===steel?.35:.08,
      emissive:color===0xfffae7||color===0xfaf3d9?0xc8c4ac:0});
    const mesh=new T.InstancedMesh(shapes[shape],m,matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));parent.add(mesh);
  }

  // Paint the supplied Tigerhawk directly on the pool bottom so its size and parallax survive orbiting.
  const image=await new T.ImageLoader().loadAsync('./assets/onrt/iowa-floor-mark.png');
  const floor=document.createElement('canvas');floor.width=2048;floor.height=1024;
  const ctx=floor.getContext('2d');ctx.fillStyle='#afdbd3';ctx.fillRect(0,0,2048,1024);
  ctx.strokeStyle='#a3cfc9';ctx.lineWidth=1;
  for(let x=0;x<40;x++){ctx.beginPath();ctx.moveTo(x*51.2,0);ctx.lineTo(x*51.2,1024);ctx.stroke();}
  for(let z=0;z<20;z++){ctx.beginPath();ctx.moveTo(0,z*51.2);ctx.lineTo(2048,z*51.2);ctx.stroke();}
  ctx.globalCompositeOperation='multiply';ctx.drawImage(image,627,223,794,794*image.height/image.width);
  const texture=new T.CanvasTexture(floor);texture.colorSpace=T.SRGBColorSpace;
  const bottom=new T.Mesh(new T.PlaneGeometry(40,20),new T.MeshStandardMaterial({map:texture,roughness:.94}));
  bottom.rotation.x=-Math.PI/2;bottom.position.set(14.5,-3,0);hall.add(bottom);
  return {update(x,z,stroke){
    bridge.position.x=Math.max(-4.1,Math.min(33.1,x));
    trolley.position.z=Math.max(-9.8,Math.min(9.8,z));
    for(const wedge of wedges)wedge.position.y=stroke;
  }};
}
