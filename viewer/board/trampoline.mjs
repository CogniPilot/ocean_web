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

// Same crowned extrusion as the baked forward crossbeam, in hull coordinates.
export function forwardBeam(y){
  const crown=Math.max(0,1-(y/1.02)**2);
  return {x:.405+.035*crown,z:.410+.033*crown};
}

export function hobieTrampoline(T){
  const deck=new T.Group();
  deck.name='Laced Hobie 16 trampoline';
  const cloth=trampolineMaterials(T);
  const rear=-1.225,edge=.910,seam=.040,surface=.414;
  // Canvas slides into the sidebars and the curved front beam. It is tensioned
  // aft and at the centre seam. The corners are cut back around the castings.
  function clothPoint(u,y){
    const corner=Math.max(0,(Math.abs(y)-(edge-.12))/.12);
    const relief=.105*(1-Math.sqrt(Math.max(0,1-corner*corner)));
    const bow=forwardBeam(y),aft=rear+relief,fore=bow.x-.047-relief;
    const span=(Math.abs(y)-seam)/(edge-seam);
    const sag=.024*Math.sin(Math.PI*u)*Math.sin(Math.PI*span);
    return [aft+(fore-aft)*u,y,surface+u**3*(bow.z-.41)-sag];
  }
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
    sheet(vertices,triangles,18,18,(u,v)=>{
      uv.push(u*19,v*9);
      return clothPoint(u,inner+(outer-inner)*v);
    });
    sheet(straps,strapTriangles,20,1,(u,v)=>{
      const point=clothPoint(.035+.93*u,side*.40+(v-.5)*.058);
      point[2]+=.007+.039*Math.sin(Math.PI*u);
      return point;
    });
  }
  mesh(vertices,triangles,cloth.cloth,uv);
  mesh(straps,strapTriangles,cloth.webbing);

  const innerEye=seam+.014;
  const centres=[];
  for(let j=0;j<16;j++){
    const u=.022+.95*j/15;
    const pair=[-innerEye,innerEye].map(y=>{
      const p=clothPoint(u,y);p[2]+=.004;return p;
    });
    eyelets.push(...pair);
    if(j){laces.push([centres[j-1][0],pair[1]],[centres[j-1][1],pair[0]]);}
    centres.push(pair);
  }
  for(const side of [-1,1]){
    for(let j=0;j<9;j++){
      const y=side*(.115+j*.092),p=clothPoint(.011,y);p[2]+=.004;
      eyelets.push(p);
      laces.push([p,[-1.414,y-side*.030,.458]],[p,[-1.414,y+side*.030,.458]]);
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
