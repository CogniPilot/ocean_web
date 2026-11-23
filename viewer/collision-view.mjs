const boxEdges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
const ringSteps=24;
const ring=Array.from({length:ringSteps},(_,i)=>{
  const angle=2*Math.PI*i/ringSteps;
  return [Math.cos(angle),Math.sin(angle)];
});

export function collisionOverlay(T,name='Collision shapes',segmentCapacity=32768){
  const scene=new T.Scene(),colors=new Map(),point=new T.Vector3();
  scene.name=name;
  function batch(make,material,capacity){
    const geometry=new T.BufferGeometry();
    const mesh=make(geometry,material);
    mesh.frustumCulled=false;
    mesh.renderOrder=scene.children.length;
    scene.add(mesh);
    let size=0,position,rgb;
    function allocate(capacity){
      const oldPosition=position,oldColor=rgb;
      position=new T.BufferAttribute(new Float32Array(3*capacity),3).setUsage(T.DynamicDrawUsage);
      rgb=new T.BufferAttribute(new Float32Array(3*capacity),3).setUsage(T.DynamicDrawUsage);
      if(oldPosition){
        position.array.set(oldPosition.array);
        rgb.array.set(oldColor.array);
        geometry.dispose();
      }
      geometry.setAttribute('position',position);
      geometry.setAttribute('color',rgb);
    }
    allocate(capacity);
    geometry.setDrawRange(0,0);
    return {
      clear(){size=0;},
      add(frame,x,y,z,color){
        if(size===position.count)allocate(size*2);
        point.set(x,y,z);
        if(frame)point.applyMatrix4(frame.matrixWorld);
        position.setXYZ(size,point.x,point.y,point.z);
        rgb.setXYZ(size,color.r,color.g,color.b);
        size++;
      },
      update(){
        geometry.setDrawRange(0,size);
        if(size){position.needsUpdate=true;rgb.needsUpdate=true;}
      }
    };
  }
  const style={vertexColors:true,depthTest:false,depthWrite:false,transparent:true,toneMapped:false};
  const lineBatch=capacity=>batch((g,m)=>new T.LineSegments(g,m),
    new T.LineBasicMaterial({...style,opacity:.64}),capacity);
  const fixed=lineBatch(segmentCapacity),segments=lineBatch(1024);
  let fixedDirty=false;
  const samples=batch((g,m)=>new T.Points(g,m),new T.PointsMaterial({...style,opacity:.95,size:5,sizeAttenuation:false}),256);
  function tint(value){
    if(!colors.has(value)){
      const css=typeof value==='string'?value.replace(/^rgba\(([^,]+,[^,]+,[^,]+),[^)]+\)$/,'rgb($1)'):value;
      colors.set(value,new T.Color(css));
    }
    return colors.get(value);
  }
  function vertices(buffer,frame,coords,value){
    const color=tint(value);
    for(let i=0;i<coords.length;i+=3)buffer.add(frame,coords[i],coords[i+1],coords[i+2],color);
  }
  function ellipse(frame,center,radii,axis,color){
    const coord=[0,0,0],a=(axis+1)%3,b=(axis+2)%3;
    coord[axis]=center[axis];
    for(let step=0;step<ringSteps;step++){
      for(const k of [step,(step+1)%ringSteps]){
        coord[a]=center[a]+radii[a]*ring[k][0];coord[b]=center[b]+radii[b]*ring[k][1];
        segments.add(frame,coord[0],coord[1],coord[2],color);
      }
    }
  }
  function ellipsoid(frame,center,radii,value){
    const color=tint(value);
    for(let axis=0;axis<3;axis++)ellipse(frame,center,radii,axis,color);
  }
  function capsule(frame,center,radius,half,value){
    const color=tint(value),coords=[];
    for(const side of [-1,1]){
      const end=center[0]+side*half;
      ellipse(frame,[end,center[1],center[2]],[radius,radius,radius],0,color);
      for(const [y,z] of [[radius,0],[0,radius],[-radius,0],[0,-radius]]){
        coords.push(center[0]-half,center[1]+y,center[2]+z,center[0]+half,center[1]+y,center[2]+z);
        for(let i=0;i<ringSteps/2;i++){
          const a=Math.PI*i/(ringSteps/2),b=Math.PI*(i+1)/(ringSteps/2);
          coords.push(end+side*radius*Math.sin(a),center[1]+y*Math.cos(a),center[2]+z*Math.cos(a),
                      end+side*radius*Math.sin(b),center[1]+y*Math.cos(b),center[2]+z*Math.cos(b));
        }
      }
    }
    vertices(segments,frame,coords,value);
  }
  function swimmerShapes(frame,rows){
    const local=new T.Matrix4(),shapeFrame=new T.Object3D();
    for(let i=0;i<7;i++){
      const k=207+i*16,kind=rows[k];
      if(kind<2.5)continue;
      local.set(rows[k+4],rows[k+5],rows[k+6],rows[k+1],
                rows[k+7],rows[k+8],rows[k+9],rows[k+2],
                rows[k+10],rows[k+11],rows[k+12],rows[k+3],0,0,0,1);
      shapeFrame.matrixWorld.multiplyMatrices(frame.matrixWorld,local);
      if(kind<3.5)capsule(shapeFrame,[0,0,0],rows[k+13],rows[k+14],'#f599d3');
      else this.box(shapeFrame,[0,0,0],rows.subarray(k+13,k+16),'#f599d3');
    }
  }
  const rigFrame=new T.Object3D(),rigEnd=new T.Vector3(),rigAxis=new T.Vector3(1,0,0);
  return {
    swimmerShapes,
    rigCapsules(frame,rows){
      frame.updateWorldMatrix(true,false);
      for(let i=0;i<rows.length;i+=7){
        const radius=rows[i+6];
        if(!(radius>0))continue;
        rigFrame.position.fromArray(rows,i);
        rigEnd.fromArray(rows,i+3).sub(rigFrame.position);
        const length=rigEnd.length();
        if(length<1e-4)continue;
        rigFrame.position.addScaledVector(rigEnd,.5);
        rigFrame.quaternion.setFromUnitVectors(rigAxis,rigEnd.divideScalar(length));
        rigFrame.updateMatrix();rigFrame.matrixWorld.multiplyMatrices(frame.matrixWorld,rigFrame.matrix);
        capsule(rigFrame,[0,0,0],radius,length/2,'#69e2bb');
      }
    },
    begin(){segments.clear();samples.clear();},
    box(frame,center,half,value){
      const color=tint(value);
      for(const edge of boxEdges)for(const i of edge)
        segments.add(frame,center[0]+(i&1?half[0]:-half[0]),center[1]+(i&2?half[1]:-half[1]),
          center[2]+(i&4?half[2]:-half[2]),color);
    },
    sphere(frame,center,radius,value){ellipsoid(frame,center,[radius,radius,radius],value);},
    ellipsoid,
    circle(frame,center,axis,radius,value){ellipse(frame,center,[radius,radius,radius],axis,tint(value));},
    lines(frame,coords,value){vertices(segments,frame,coords,value);},
    staticLines(frame,coords,value){
      vertices(fixed,frame,coords,value);
      fixedDirty=true;
    },
    points(frame,coords,value){vertices(samples,frame,coords,value);},
    render(renderer,camera){
      if(fixedDirty){fixed.update();fixedDirty=false;}
      segments.update();samples.update();
      const autoClear=renderer.autoClear;
      renderer.autoClear=false;
      try{renderer.render(scene,camera);}
      finally{renderer.autoClear=autoClear;}
    }
  };
}

// WildlifeContact's nominal animal envelopes, expanded by the opposing hull
// sample in Modelica. Skin probes use the same offsets as each ground contact.
const sharkHulls=[[[0,0,-.13],[2.4,.43,.46]],[[.05,0,.51],[.38,.09,.34]]];
const whaleSkin=[-2,0,-.84, .5,0,-1.23, 4.35,0,-.3, -.55,3.42,-1.9, -.55,-3.42,-1.9];
const sharkSkin=[2.32,0,-.09, 1.22,0,-.36, 0,0,-.47, -1.12,0,-.32, -2.18,0,-.55,
  .04,.91,-.30, .04,-.91,-.30, -.20,0,.92, 1.02,0,.34];

export function drawAnimalCollision(painter,frame,kind){
  if(kind!=='whale'&&kind!=='shark')return;
  frame.updateWorldMatrix(true,false);
  const pose=frame.userData.contactPose;
  if(kind==='whale'&&pose)painter.swimmerShapes(frame,pose);
  if(kind==='shark')for(const [center,radii] of sharkHulls)painter.ellipsoid(frame,center,radii,'#f599d3');
  if(kind==='whale'){
    painter.points(frame,whaleSkin,'#f8ec9d');
    if(!pose)return;
    // A fluke probe follows tail pitch relative to the rolled torso and
    // translates with the torso hinge at x = -2.35 m.
    const roll=pose[35],pitch=pose[31]-pose[29],cr=Math.cos(roll),sr=Math.sin(roll);
    const ct=Math.cos(pitch),st=Math.sin(pitch),flukes=[];
    for(const y of [-2.16,2.16]){
      const ry=y*cr+.22*sr,rz=y*sr-.22*cr;
      const z=-3.72*st+rz*ct;
      flukes.push(-2.35-3.72*ct-rz*st,ry*cr+z*sr,-ry*sr+z*cr);
    }
    painter.points(frame,flukes,'#f8ec9d');
  }else{
    const probes=sharkSkin.slice();
    if(pose)probes[13]-=.91*Math.sin(pose[70]);
    painter.points(frame,probes,'#f8ec9d');
  }
}

// Sailboat.contactWrench compares horizontal discs across a pair of boats,
// with a separate heave gate. Each ring is the contribution of one sample.
const discs=[
  [[-.93,.18],[-.68,.26],[-.31,.335],[.12,.321],[.52,.258],[.83,.19],[1.10,.11]],
  [[-1.9,.49],[-.95,.49],[0,.49],[.95,.49],[1.9,.49]],
  [[-2.85,.91],[-2.18,1.13],[-1.14,1.26],[0,1.22],[1.02,1.12],[2.05,.87],[3.02,.45]],
  [[-2.28,.72],[-1.79,.90],[-1.03,1.04],[0,1.02],[.88,.96],[1.73,.73],[2.57,.39]]
];
export function hullWires(vertices,faces,offsets=[0]){
  const output=[];
  const count=vertices.length/3;
  for(const side of offsets){
    const drawn=new Set();
    for(let i=0;i<faces.length;i+=3)for(let j=0;j<3;j++){
      const a=faces[i+j]-1,b=faces[i+(j+1)%3]-1,key=Math.min(a,b)*count+Math.max(a,b);
      if(drawn.has(key))continue;
      drawn.add(key);
      for(const v of [a,b])output.push(vertices[3*v],vertices[3*v+1]+side,vertices[3*v+2]);
    }
  }
  return output;
}
export const pontoonWires=(vertices,faces)=>hullWires(vertices,faces,[-1.02,1.02]);
export function drawVesselContacts(T,painter,group,kind,peers,peerTilts,patrols,patrolTilts,committee,pontoons,cruiser,cabin){
  const frame=new T.Object3D();
  function rings(east,north,height,yaw,kind){
    const points=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(const [x,radius] of discs[kind]){
      const cx=east+x*c,cy=north+x*s;
      for(let j=0;j<ringSteps;j++){
        const a=ring[j],b=ring[(j+1)%ringSteps];
        points.push(cx+radius*a[0],cy+radius*a[1],height,cx+radius*b[0],cy+radius*b[1],height);
      }
    }
    painter.lines(null,points,'#69e2bb');
  }
  function body(group,kind){
    if(kind===1){if(pontoons)painter.lines(group,pontoons,'#69e2bb');}
    else if(kind===2&&cruiser){
      painter.lines(group,cruiser,'#69e2bb');
      if(cabin)painter.lines(group,cabin,'#69e2bb');
    }
    else rings(group.position.x,group.position.y,group.position.z,group.rotation.z,kind);
  }
  if(group)body(group,kind);
  if(committee)body(committee,3);
  for(const [boats,tilts] of [[peers,peerTilts],[patrols,patrolTilts]]){
    for(let i=0;boats&&i*9<boats.length;i++){
      const k=i*9;
      if(boats[k]<.5)continue;
      frame.position.set(boats[k+1],boats[k+2],boats[k+7]);
      frame.rotation.set(tilts?.[i*2]??0,tilts?.[i*2+1]??0,boats[k+3],'ZYX');
      frame.updateMatrixWorld();
      body(frame,boats[k+8]);
    }
  }
}
