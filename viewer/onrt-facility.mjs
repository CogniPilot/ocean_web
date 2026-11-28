// The IIHR basin is 40 × 20 × 3 m. The bridge and hall details are reconstructed
// from facility photographs. East is +X, north is -Z and the water surface is Y=0.
import {metricSurface} from './onrt-materials.mjs';

export async function createFacility(T,scene,finishes){
  const hall=new T.Group(),bridge=new T.Group(),trolley=new T.Group();
  const trackingRig=new T.Group(),rails=new T.Group();
  trackingRig.add(rails,bridge);scene.add(hall,trackingRig);bridge.add(trolley);
  const shapes={box:new T.BoxGeometry(1,1,1),tube:new T.CylinderGeometry(.5,.5,1,16)};
  const solids=[],trackingSolids=[],wallFixtures=[];
  const frameOf=parent=>parent===bridge?1:parent===trolley?2:0;
  const solidBox=(x,y,z,l,h,w,frame=0,list=solids)=>list.push([x,y,z,l/2,h/2,w/2,1,frame,0]);
  const solidTube=(a,b,d,frame=0,list=solids)=>list.push([...a,...b,2,frame,d/2]);
  const batches=new Map(),up=new T.Vector3(0,1,0);
  const white=0xf0f1ea,steel=0x798589,iron=0x344347,gold=0xffb724,concrete=0xd7d4c8;
  function part(parent,shape,color,position,scale,rotation=new T.Quaternion()){
    if(!batches.has(parent))batches.set(parent,new Map());
    const group=batches.get(parent),key=shape+color;
    if(!group.has(key))group.set(key,{shape,color,matrices:[]});
    group.get(key).matrices.push(new T.Matrix4().compose(new T.Vector3(...position),rotation,new T.Vector3(...scale)));
  }
  const solidsFor=parent=>parent===bridge||parent===trolley||parent===rails?trackingSolids:solids;
  function box(x,y,z,l,h,w,color,parent=hall){if(Math.max(l,h,w)>.6&&color!==0xaab1b2&&color!==0xb0bab9)solidBox(x,y,z,l,h,w,frameOf(parent),solidsFor(parent));part(parent,'box',color,[x,y,z],[l,h,w]);}
  function bar(a,b,diameter,color,parent=hall){
    if(diameter>=.04)solidTube(a,b,diameter,frameOf(parent),solidsFor(parent));
    const delta=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const center=a.map((v,i)=>(v+b[i])/2),length=delta.length();
    part(parent,'tube',color,center,[diameter,length,diameter],new T.Quaternion().setFromUnitVectors(up,delta.normalize()));
  }
  // Cross-sections are drawn across the hall, then extruded along its length.
  // Use the same eave and ridge for the ceiling and the two closed gables.
  const halfWidth=13.24,eave=9.05,ridge=10.60,sheet=.14;
  function hallSection(outline,depth,eastFace,color){
    const profile=new T.Shape(outline.map(([z,y])=>new T.Vector2(z,y)));
    const geometry=new T.ExtrudeGeometry(profile,{depth,bevelEnabled:false});
    geometry.rotateY(-Math.PI/2);
    const mesh=new T.Mesh(metricSurface(T,geometry),finishes.material('panel',color));
    mesh.position.x=eastFace;hall.add(mesh);
  }
  hallSection([[-halfWidth,eave],[0,ridge],[halfWidth,eave],
    [halfWidth,eave+sheet],[0,ridge+sheet],[-halfWidth,eave+sheet]],49,39,0xe3e7e4);

  // A tilted housing directs the diffuser and light into the basin and down.
  function wallFixture(x,y,z,yaw){
    const angle=Math.PI/6;
    const rotation=new T.Quaternion().setFromEuler(new T.Euler(angle,yaw,0,'YXZ'));
    const center=new T.Vector3(x,y,z);
    const normal=new T.Vector3(0,0,1).applyQuaternion(rotation);
    const mount=center.clone().addScaledVector(new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),-.095);
    const face=center.clone().addScaledVector(normal,.024);
    const mountingRotation=new T.Quaternion().setFromAxisAngle(up,yaw);
    part(hall,'box',steel,mount.toArray(),[.84,.10,.17],mountingRotation);
    part(hall,'box',steel,center.toArray(),[1.26,.31,.044],rotation);
    part(hall,'box',0xfffae7,face.toArray(),[1.21,.26,.006],rotation);
    wallFixtures.push({position:face,normal});
    const along=Math.abs(Math.cos(yaw)),across=Math.abs(Math.sin(yaw));
    solidBox(x,y,z,along*1.26+across*.20,.31,across*1.26+along*.20);
  }
  // Ribbed steel hall, roof frames and pendant luminaires.
  const columnXs=Array.from({length:11},(_,i)=>-9+4.7*i);
  for(const side of [-1,1]){
    box(14.5,(eave-1.45)/2,side*13.15,49,eave+1.45+.03,.18,white);
    // The coping ends at |z|=10.20. Begin the deck there so its top
    // and inner face cannot coincide with the basin wall at grazing angles.
    box(14.5,.37,side*11.65,48.2,.30,2.90,concrete);
    box(14.5,-1.24,side*10.10,40,3.52,.20,0xe9ece6);
    box(14.5,.59,side*10.82,44,.12,.16,steel,rails);
    box(14.5,.72,side*10.82,44,.13,.07,iron,rails);
    for(let x=-9;x<=38;x+=1.1)box(x,5.0,side*13.02,.036,8.2,.06,0xaab1b2);
    // Each float is a moulded spool threaded on a continuous dark cable.
    const spool=shapes.float??new T.LatheGeometry([[.22,-.5],[.48,-.44],[.5,-.31],[.35,-.20],
      [.35,.20],[.5,.31],[.48,.44],[.22,.5]].map(([x,y])=>new T.Vector2(x,y)),12);
    shapes.float=spool;
    const floatAxis=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2);
    for(const z of [9.78,9.91]){
      bar([-5.45,.03,side*z],[34.45,.03,side*z],.021,iron);
      for(let n=0;n<620;n++){
        part(hall,'float',Math.floor(n/8)%2?0x222729:gold,[-5.42+n*.064,.03,side*z],
          [.115,.058,.115],floatAxis);
      }
    }
    solidBox(14.5,.03,side*9.845,40,.115,.25);
    const triangle=new T.Shape();
    triangle.moveTo(0,0);triangle.lineTo(0,-.21);triangle.lineTo(.20,0);triangle.closePath();
    const bracketGeometry=metricSurface(T,new T.ExtrudeGeometry(triangle,{depth:.035,bevelEnabled:false}));
    const brackets=new T.InstancedMesh(bracketGeometry,finishes.material('steel',0x526066),35);
    for(let i=0;i<35;i++){
      const x=-5+i*1.15, pose=new T.Matrix4().makeRotationY(side*Math.PI/2);
      if(i%3===0){
        bar([x,.23,side*9.92],[x-.10,.085,side*9.80],.007,iron);
        bar([x,.23,side*9.92],[x+.10,.085,side*9.80],.007,iron);
      }
      brackets.setMatrixAt(i,pose.setPosition(x,.43,side*9.995));
      solidBox(x,.325,side*9.89,.035,.21,.21);
    }
    hall.add(brackets);
    for(const x of columnXs){
      box(x,4.8,side*12.88,.22,8.65,.28,steel);
      bar([x,8.9,side*12.9],[x,10.4,0],.23,steel);
      bar([x,8.9,side*12.8],[x,8.9,0],.13,steel);
      for(let j=0;j<5;j++){
        const z=side*j*2.56;
        bar([x,8.92,z],[x,10.4-(j+1)*.30,z+side*2.56],.075,steel);
      }
      bar([x,9.8,side*5.6],[x,8.55,side*5.6],.035,iron);
      box(x,8.52,side*5.6,.85,.14,.52,steel);
      box(x,8.42,side*5.6,.81,.06,.48,0xfffae7);
    }
    for(let i=1;i<columnXs.length;i++){
      const x=(columnXs[i-1]+columnXs[i])/2;
      wallFixture(x,3.08,side*12.92,side<0?0:Math.PI);
    }
  }
  for(const x of [-9.6,38.6]){
    hallSection([[-halfWidth,-.45],[halfWidth,-.45],[halfWidth,eave],[0,ridge],
      [-halfWidth,eave]],.17,x+.085,white);
    solidBox(x,(eave-.45)/2,0,.17,eave+.45,2*halfWidth);
    box(x,2.3,0,.24,3.5,3.1,0x75868a);
    for(let z=-12;z<=12;z+=1.1)box(x+(x<0?.11:-.11),6,z,.05,6.4,.04,0xb0bab9);
  }
  for(const x of [-7.65,36.65])box(x,.37,0,3.9,.30,20.4,concrete);
  for(const x of [-5.6,34.6])box(x,-1.24,0,.2,3.52,20,0xaacac0);
  const beach=new T.Mesh(metricSurface(T,new T.BoxGeometry(3.45,.15,19.65)),finishes.material('rubber',0x596052));
  beach.rotation.z=-.28;beach.position.set(-3.92,-.40,0);hall.add(beach);
  for(let z=-9.7;z<10;z+=.30)bar([-5.48,.10,z],[-2.32,-.80,z],.045,0x858f74);

  // Side access gallery from the basin photographs. All dimensions are estimates
  // from the door and handrail proportions. Leave the carriage rail clear.
  const walkwayZ=-12.10, innerRail=-11.43;
  box(24.5,3.35,walkwayZ,10.0,.16,1.42,steel);
  for(let x=19.6;x<29.6;x+=1.65){
    bar([x,3.43,innerRail],[x,4.46,innerRail],.045,steel);
    bar([x,2.36,-12.86],[x,3.28,innerRail],.086,steel);
  }
  for(const y of [3.92,4.45])bar([19.51,y,innerRail],[29.47,y,innerRail],.044,steel);
  for(const x of [19.53,29.47]){
    for(const y of [3.92,4.45])bar([x,y,-12.78],[x,y,innerRail],.044,steel);
  }
  for(const x of [21.5,28]){
    for(const level of [.52,3.44]){
      box(x,level+1.02,-12.99,1.05,2.04,.10,0x63757b);
      box(x,level+1.00,-12.91,.93,1.98,.065,0xc4c7bc);
      box(x,level+1.53,-12.865,.41,.54,.026,0x50656a);
      box(x+.29,level+.99,-12.84,.15,.036,.044,steel);
    }
  }
  for(const z of [-12.45,-11.93])bar([18.25,.55,z],[19.72,4.23,z],.055,gold);
  for(let j=1;j<=11;j++){
    const t=j/12,x=18.25+1.19*t,y=.55+2.89*t;
    bar([x,y,-12.45],[x,y,-11.93],.042,gold);
  }
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
  // Pool-access ladder at the work platform, including submerged rungs.
  for(const z of [2.84,3.26]){
    bar([-3.22,-1.23,z],[-3.22,.94,z],.043,steel);
    bar([-3.22,.94,z],[-3.49,.94,z],.043,steel);
    bar([-3.49,.94,z],[-3.49,.35,z],.043,steel);
  }
  for(let i=0;i<6;i++)bar([-3.22,.25-.27*i,2.84],[-3.22,.25-.27*i,3.26],.032,steel);
  for(let j=0;j<6;j++){
    const z=(j-2.5)*3.3;
    wallFixture(38.38,4.23,z,-Math.PI/2);
  }
  finishes.bakeWallLighting(wallFixtures);
  // The transverse Warren truss sits on two rail trucks. Each mast's two
  // stays meet the paired upper chords at the same cross-braced panel point.
  const bridgeSpan=21.64,panels=18,spanStart=-bridgeSpan/2,panelWidth=bridgeSpan/panels;
  const lowerJoint=(side,panel)=>[side*.76,2.30,spanStart+panel*panelWidth];
  const upperJoint=(side,panel)=>[side*.76,3.48,spanStart+panel*panelWidth];
  const member=(from,to,diameter)=>bar(from,to,diameter,gold,bridge);
  for(const side of [-1,1]){
    member(lowerJoint(side,0),lowerJoint(side,panels),.14);
    member(upperJoint(side,0),upperJoint(side,panels),.14);
    for(let i=0;i<panels;i++){
      const peak=upperJoint(side,i+.5);
      member(lowerJoint(side,i),peak,.087);
      member(peak,lowerJoint(side,i+1),.087);
    }
  }
  // The end trucks tie the lower chords around the drive cabinets.
  for(let i=1;i<panels;i++)member(lowerJoint(-1,i),lowerJoint(1,i),.09);
  for(let i=0;i<panels;i++){
    member(upperJoint(-1,i+.5),upperJoint(1,i+.5),.09);
    if(i+1<panels)member(upperJoint(-1,i+.5),upperJoint(1,i+1.5),.075);
  }
  for(const end of [0,panels]){
    const z=lowerJoint(1,end)[2],apex=[0,5.65,z];
    const stayPanel=end===0?3.5:panels-3.5;
    box(0,.99,z,3.45,.38,.60,gold,bridge);
    member(upperJoint(-1,end),upperJoint(1,end),.13);
    for(const side of [-1,1]){
      const x=side*1.4,foot=[x,1.15,z],lower=lowerJoint(side,end),upper=upperJoint(side,end);
      const anchor=upperJoint(side,stayPanel);
      box(x,.81,z,.4,.19,.39,iron,bridge);
      member(foot,apex,.15);
      member(foot,lower,.12);
      member(lower,upper,.12);
      member(apex,anchor,.086);
      box(anchor[0],anchor[1],anchor[2],.20,.14,.18,gold,bridge);
    }
    box(apex[0],apex[1],apex[2],.22,.18,.22,gold,bridge);
    box(0,1.31,z,.73,.52,.53,0x53656a,bridge);
    box(0,2.22,z,.64,1.24,.47,0x296477,bridge);
    box(0,2.89,z,.13,.11,.13,0xa4ce7a,bridge);
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
    for(const dz of [-1.12,1.12]){
      box(35.02,1.36,z+dz,.12,1.68,.12,0x80b6ad);
      box(34.68,2.20,z+dz,.82,.10,.10,0x80b6ad);
      bar([35.02,1.74,z+dz],[34.33,2.14,z+dz],.048,steel);
    }
    box(34.33,2.24,z,.12,.12,2.36,0x80b6ad);
    box(34.53,1.90,z,.36,.32,.62,0x728884);
  }
  const finishByColor=new Map([
    [white,'panel'],[concrete,'deck'],[steel,'steel'],[iron,'steel'],[0xc6c4b7,'steel'],
    [0xe9ece6,'liner'],[0x222729,'rubber'],[0xaacac0,'liner'],[0x2a3839,'rubber'],[0xfffae7,'lamp'],[0xfaf3d9,'lamp']
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
  for(let i=0;i<6;i++)solidBox(34.18,-.11,(i-2.5)*3.3,.60,.86,3.27,3);
  solidBox(-3.92,-.35,0,3.43,.8,19.65);
  solidBox(0,.04,0,3.15,.38,.40,4);
  const collisionCount=solids.length+trackingSolids.length;
  if(collisionCount>1024)throw Error('Basin camera collision capacity exceeded: '+collisionCount);
  const cameraSolids=new Float64Array(1024*9);cameraSolids.set([...solids,...trackingSolids].flat());
  return {cameraSolids,collisionCount,staticCollisionCount:solids.length,trackingRig,bridge,trolley,stroke:0,update(x,z,stroke){
    bridge.position.x=Math.max(-4.1,Math.min(33.1,x));
    trolley.position.z=Math.max(-9.8,Math.min(9.8,z));
    this.stroke=stroke;
    for(const wedge of wedges)wedge.position.y=stroke;
  }};
}
