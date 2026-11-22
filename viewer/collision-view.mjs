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
  const segments=batch((g,m)=>new T.LineSegments(g,m),new T.LineBasicMaterial({...style,opacity:.64}),segmentCapacity);
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
  return {
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
    points(frame,coords,value){vertices(samples,frame,coords,value);},
    render(renderer,camera){
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
const whaleHulls=[[[.35,0,0],[4.55,1,1.08]],[[-4.75,0,0],[.67,1.98,.20]],
  [[.15,1.8,-.65],[.55,1.38,.20]],[[.15,-1.8,-.65],[.55,1.38,.20]]];
const sharkHulls=[[[0,0,-.13],[2.4,.43,.46]],[[.05,0,.51],[.38,.09,.34]]];
const whaleSkin=[-2,0,-.84, .5,0,-1.23, 4.35,0,-.3, -.55,3.42,-1.9, -.55,-3.42,-1.9];
const sharkSkin=[2.32,0,-.09, 1.22,0,-.36, 0,0,-.47, -1.12,0,-.32, -2.18,0,-.55,
  .04,.91,-.30, .04,-.91,-.30, -.20,0,.92, 1.02,0,.34];

export function drawAnimalCollision(painter,frame,kind){
  if(kind!=='whale'&&kind!=='shark')return;
  frame.updateWorldMatrix(true,false);
  const pose=frame.userData.contactPose;
  for(const [center,radii] of (kind==='whale'?whaleHulls:sharkHulls))painter.ellipsoid(frame,center,radii,'#f599d3');
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
export function drawSailboatContacts(painter,group,cat,peers){
  function rings(east,north,height,yaw,twin){
    const points=[],c=Math.cos(yaw),s=Math.sin(yaw),spacing=twin?.95:.42,radius=twin?.49:.31;
    for(const y of (twin?[1.02,-1.02]:[0]))for(let i=-2;i<=2;i++){
      const x=i*spacing,cx=east+x*c-y*s,cy=north+x*s+y*c;
      for(let j=0;j<ringSteps;j++){
        const a=ring[j],b=ring[(j+1)%ringSteps];
        points.push(cx+radius*a[0],cy+radius*a[1],height,cx+radius*b[0],cy+radius*b[1],height);
      }
    }
    painter.lines(null,points,'#69e2bb');
  }
  rings(group.position.x,group.position.y,group.position.z,group.rotation.z,cat);
  for(let i=0;peers&&i<peers.length;i+=9)if(peers[i]>.5)
    rings(peers[i+1],peers[i+2],peers[i+7],peers[i+3],peers[i+8]>.5);
}
