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
  function swimmerSkin(frame,parts){
    const shapeFrame=new T.Object3D();
    for(const {bone,wire} of parts){
      if(!bone){vertices(segments,frame,wire,'#f599d3');continue;}
      const joint=frame.userData.collisionRig?.get(T.PropertyBinding.sanitizeNodeName(bone));
      if(!joint)continue;
      joint.bone.updateWorldMatrix(true,false);
      shapeFrame.matrixWorld.multiplyMatrices(joint.bone.matrixWorld,joint.inverseRest);
      vertices(segments,shapeFrame,wire,'#f599d3');
    }
  }
  const rigFrame=new T.Object3D(),rigEnd=new T.Vector3(),rigAxis=new T.Vector3(1,0,0);
  return {
    swimmerSkin,
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

// Triangulated swimmer collision pieces follow their GLTF joints.
let swimmerHulls,loadingHulls;
function loadSwimmerHulls(){
  if(!loadingHulls){
    const url=new URL('./assets/swimmer-hulls.json',import.meta.url);
    url.search=new URL(import.meta.url).search;
    loadingHulls=fetch(url).then(response=>{
      if(!response.ok)throw Error(response.statusText);
      return response.json();
    }).then(hulls=>{swimmerHulls=hulls;}).catch(error=>console.warn('Swimmer collision mesh unavailable',error));
  }
}
export function drawAnimalCollision(painter,frame,kind){
  if(kind==='diver'){
    if(frame.userData.diverTriangles&&painter.lines){
      frame.userData.diverTriangles((part,wire)=>painter.lines(null,wire,part==='tank'?'#f5cd79':part==='fin'?'#8fc8ff':'#6ae5b5'));
      return;
    }
    const rows=frame.userData.diverProbes?.(),kinds=frame.userData.diverParts;
    if(rows)for(let k=0;k<rows.length;k+=4){
      const r=rows[k+3],part=kinds[k/4];
      painter.ellipsoid(null,[rows[k],rows[k+1],rows[k+2]],[r,r,r],
        part==='tank'?'#f5cd79':part==='fin'?'#8fc8ff':'#6ae5b5');
    }
    return;
  }
  if(kind==='manta'){
    const rest=frame.userData.mantaRestCapsules;
    if(!rest)return;
    const angles=frame.userData.mantaWingAngles??[0,0];
    const posed=frame.userData.mantaOverlayCapsules??=new Float64Array(70);
    for(let i=0;i<10;i++){
      const row=rest[i];
      posed.set(row,7*i);
      if(i<4)continue;
      for(const endpoint of [0,3]){
        const y=row[endpoint+1],z=row[endpoint+2],arm=Math.max(0,Math.abs(y)-.48),angle=angles[y>=0?0:1],c=Math.cos(angle),s=Math.sin(angle);
        posed[7*i+endpoint+1]=y+Math.sign(y)*(arm*(c-1)-z*s);
        posed[7*i+endpoint+2]=z*c+arm*s;
      }
    }
    painter.rigCapsules(frame,posed);
    return;
  }
  if(kind!=='whale'&&kind!=='shark')return;
  frame.updateWorldMatrix(true,false);
  if(!swimmerHulls){loadSwimmerHulls();return;}
  painter.swimmerSkin(frame,swimmerHulls[kind]);
}

// Sailboat.contactWrench compares horizontal discs across a pair of boats,
// with a separate heave gate. Each ring is the contribution of one sample.
const discs=[
  [[-.93,.18],[-.68,.26],[-.31,.335],[.12,.321],[.52,.258],[.83,.19],[1.10,.11]],
  [[-1.9,.49],[-.95,.49],[0,.49],[.95,.49],[1.9,.49]],
  [[-2.85,.91],[-2.18,1.13],[-1.14,1.26],[0,1.22],[1.02,1.12],[2.05,.87],[3.02,.45]]
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
export function compoundHullWires(vertices,faces){
  const count=Math.max(...faces)*3,lines=[];
  for(let i=0;i<vertices.length;i+=count)lines.push(...hullWires(vertices.slice(i,i+count),faces));
  return lines;
}
export function drawVesselContacts(T,painter,group,kind,peers,peerTilts,patrols,patrolTilts,pontoons,cruiser,cabin){
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
