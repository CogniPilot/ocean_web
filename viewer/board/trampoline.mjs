let materials;

function trampolineMaterials(T){
  if(materials)return materials;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const cx=canvas.getContext('2d');
  cx.fillStyle='#262d32';cx.fillRect(0,0,64,64);
  for(let j=0;j<64;j+=4){
    cx.fillStyle=j%8?'#313a40':'#424b50';
    cx.fillRect(0,j,64,2);
    cx.fillStyle=j%8?'#384047':'#2c3439';
    cx.fillRect(j,0,2,64);
  }
  const weave=new T.CanvasTexture(canvas);
  weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.colorSpace=T.SRGBColorSpace;
  weave.anisotropy=4;
  materials={
    cloth:new T.MeshStandardMaterial({map:weave,side:T.DoubleSide,roughness:.95}),
    webbing:new T.MeshStandardMaterial({color:0x282d30,roughness:.93,side:T.DoubleSide}),
    lace:new T.MeshStandardMaterial({color:0x5b5d5c,roughness:.94}),
    eyes:new T.MeshStandardMaterial({color:0xa8a295,metalness:.55,roughness:.43})
  };
  return materials;
}

export function hobieTrampoline(T){
  const deck=new T.Group();
  deck.name='Laced Hobie 16 trampoline';
  const cloth=trampolineMaterials(T);
  const rear=-1.30,front=.52,edge=.923,seam=.036,surface=.414;
  const eyelets=[],laces=[];
  function mesh(position,index,material,uv){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(position,3));
    if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(index);g.computeVertexNormals();
    deck.add(new T.Mesh(g,material));
  }
  function sheet(position,index,nu,nv,point){
    const first=position.length/3;
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      position.push(...point(i/nu,j/nv));
      const a=first+i*(nv+1)+j,b=a+nv+1;
      if(i<nu&&j<nv)index.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const vertices=[],triangles=[],uv=[],straps=[],strapTriangles=[];
  for(const side of [-1,1]){
    const inner=side===1?seam:-edge,outer=side===1?edge:-seam;
    sheet(vertices,triangles,14,8,(u,v)=>{
      uv.push(u*19,v*9);
      const sag=.014*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
      return [rear+(front-rear)*u,inner+(outer-inner)*v,surface-sag];
    });
    sheet(straps,strapTriangles,20,1,(u,v)=>[
      -1.21+1.62*u,side*.40+(v-.5)*.058,surface+.004+.036*Math.sin(Math.PI*u)
    ]);
  }
  mesh(vertices,triangles,cloth.cloth,uv);
  mesh(straps,strapTriangles,cloth.webbing);

  const innerEye=seam+.012,rearEye=rear+.018;
  for(let j=0;j<16;j++){
    const x=-1.24+j*.110;
    const p=[x,-innerEye,surface+.003],q=[x,innerEye,surface+.003];
    eyelets.push(p,q);
    if(j<15){
      laces.push([p,[x+.110,innerEye,surface+.004]]);
      laces.push([q,[x+.110,-innerEye,surface+.009]]);
    }
  }
  for(const side of [-1,1]){
    for(let j=0;j<9;j++){
      const y=side*(.115+j*.092),p=[rearEye,y,surface+.004];
      eyelets.push(p);
      laces.push([p,[-1.414,y-side*.030,.470]]);
      laces.push([p,[-1.414,y+side*.030,.470]]);
    }
  }
  const ring=new T.TorusGeometry(.010,.002,4,9);
  const eyes=new T.InstancedMesh(ring,cloth.eyes,eyelets.length);
  const transform=new T.Matrix4();
  eyelets.forEach(([x,y,z],i)=>eyes.setMatrixAt(i,transform.makeTranslation(x,y,z)));
  eyes.instanceMatrix.needsUpdate=true;deck.add(eyes);
  const laceShape=new T.CylinderGeometry(.0035,.0035,1,5,1);
  const ropes=new T.InstancedMesh(laceShape,cloth.lace,laces.length);
  const direction=new T.Vector3(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
  const up=new T.Vector3(0,1,0);
  laces.forEach(([a,b],i)=>{
    direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    scale.set(1,direction.length(),1);
    rotation.setFromUnitVectors(up,direction.normalize());
    position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
    ropes.setMatrixAt(i,transform.compose(position,rotation,scale));
  });
  ropes.instanceMatrix.needsUpdate=true;deck.add(ropes);
  return deck;
}
