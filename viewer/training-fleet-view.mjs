import {previewSize,loadTrainingRig,fleetRigBatches} from './training-model-rig.mjs';
import {loadVehicleShell} from './vehicle-assets.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {sailboatMesh,observeBoat,sailingRigFields} from './board/boat.mjs';
import {readSailPanels,sailPanelFields} from './board/sail-battens.mjs';

const sailRigs=new Map();
async function buildRig(T,cat){
  await loadVehicleShell(cat?'hobie-hulls':'sloop-hull');
  const model=await loadInstance(cat?'Hobie16':'Sailboat',{windEast:0,windNorth:8});
  let boat,axes,angles;
  try{
    boat=sailboatMesh(T,cat,model.get('foilX')[0],readSailPanels(model));
    boat.update(observeBoat(model),null,null,null,null,null,cat?model.get('stayPath'):null,0,{
      rig:cat&&model.has(sailingRigFields[0])?model.getMany(sailingRigFields):null,cloth:readSailPanels(model)?model.getMany(sailPanelFields.map(fields=>fields[3])):null,
      forestay:cat?model.get('forestayPath'):null,mastRotation:cat?model.get('mastRotation'):0});
    const [axisX,axisZ]=model.getMany(['axisX','axisZ']);
    axes=axisX.map((x,i)=>new T.Vector3(x,0,axisZ[i]).normalize());
    angles=[...model.get('trim'),-model.get('rudder'),-model.get('rudder')];
  }finally{model.close();}
  const root=boat.group,joints=boat.inspection.joints,up=new T.Vector3(0,0,1);
  root.position.set(0,0,0);root.quaternion.identity();root.updateMatrixWorld(true);
  const hinges=[joints[0][0],joints[2][0],joints[3][0],joints[4]?.[0]].filter(Boolean);
  const pivots=hinges.map((node,i)=>({at:node.getWorldPosition(new T.Vector3()),axis:axes[i]??up,rest:angles[i]}));
  const buckets=Array.from({length:5},()=>new Map());
  const v=new T.Vector3(),n=new T.Vector3(),basis=new T.Matrix3(),transform=new T.Matrix4(),instance=new T.Matrix4();
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const geo=mesh.geometry,pos=geo.attributes.position,normal=geo.attributes.normal,uv=geo.attributes.uv;
    if(!normal||!pos)return;
    let ancestor=mesh,part=-1;
    while(ancestor&&part<0){part=hinges.indexOf(ancestor);ancestor=ancestor.parent;}
    const table=buckets[part+1];
    const groups=Array.isArray(mesh.material)?geo.groups:[{start:0,count:geo.index?.count??pos.count}];
    for(const group of groups){
      const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
      if(!table.has(material))table.set(material,{positions:[],normals:[],uvs:[],indices:[]});
      const data=table.get(material),count=mesh.isInstancedMesh?mesh.count:1;
      for(let i=0;i<count;i++){
        transform.copy(mesh.matrixWorld);
        if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);transform.multiply(instance);}
        basis.getNormalMatrix(transform);
        const base=data.positions.length/3;
        for(let j=0;j<pos.count;j++){
          v.fromBufferAttribute(pos,j).applyMatrix4(transform).toArray(data.positions,data.positions.length);
          n.fromBufferAttribute(normal,j).applyNormalMatrix(basis).toArray(data.normals,data.normals.length);
          data.uvs.push(uv?.getX(j)??0,uv?.getY(j)??0);
        }
        for(let j=group.start;j<group.start+group.count;j++)data.indices.push(base+(geo.index?geo.index.getX(j):j));
      }
    }
  });
  const parts=[];
  for(const [index,table] of buckets.entries())for(const [material,data] of table){
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
    geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normals,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));
    geometry.setIndex(data.indices);
    parts.push({index,geometry,material});
  }
  const unused=new Set();
  root.traverse(o=>{if(o.geometry&&!o.userData.sharedVehicleAsset)unused.add(o.geometry);});
  for(const geometry of unused)geometry.dispose();
  return {pivots,parts};
}

export async function trainingFleetView(canvas,id){
  const T=globalThis.THREE,size=previewSize[id],sailing=id==='hobie16'||id==='sailboat';
  let pivots=[],parts=[],rig;
  if(sailing){
    if(!sailRigs.has(id))sailRigs.set(id,buildRig(T,id==='hobie16').catch(error=>{sailRigs.delete(id);throw error;}));
    ({pivots,parts}=await sailRigs.get(id));
  }else rig=await loadTrainingRig(T,id);
  const renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));
  const events=new AbortController(),scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,2400);
  scene.background=new T.Color(0xc6e2ec);scene.fog=new T.FogExp2(0xa8cbd6,.003);
  camera.up.set(0,0,1);camera.near=Math.min(.1,size.length/40);
  if(size.underwater){scene.background.setHex(0x194e61);scene.fog.color.setHex(0x276275);}
  const ordinary=rig?fleetRigBatches(T,scene,rig):null;
  scene.add(new T.HemisphereLight(0xfffbeb,0xa2c6ce,1.6));
  const sun=new T.DirectionalLight(0xfff3d8,2);sun.position.set(6,-4,12);scene.add(sun);
  const water=new T.Mesh(new T.PlaneGeometry(4500,4500),new T.MeshStandardMaterial({color:size.underwater?0x35616b:0x357482,roughness:.53,metalness:.12}));
  // Earth-fixed wavelets give a moving boat a visible speed and turn reference.
  if(!size.underwater)water.material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 seaXY;\n'+shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nseaXY=(modelMatrix*vec4(transformed,1.0)).xy;');
    shader.fragmentShader='varying vec2 seaXY;\n'+shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
      float swell=sin(dot(seaXY,vec2(.22,.14))+.62*sin(seaXY.y*.27));
      float fine=sin(dot(seaXY,vec2(1.18,-.98))+.8*swell+sin(seaXY.x*.38));
      float detail=1.0-smoothstep(.08,1.1,max(fwidth(seaXY.x),fwidth(seaXY.y)));
      diffuseColor.rgb*=.98+.075*swell+.085*fine*detail;
      diffuseColor.rgb+=vec3(.07,.11,.12)*smoothstep(.85,1.,fine)*max(0.,swell)*detail;`);
  };
  scene.add(water);
  const grid=new T.GridHelper(800,160,0x739ea0,0x739ea0);
  grid.rotation.x=Math.PI/2;grid.position.z=.012;grid.material.transparent=true;grid.material.opacity=.26;scene.add(grid);
  const transforms=Array.from({length:5},()=>new T.Matrix4()),root=new T.Object3D(),rotate=new T.Matrix4(),back=new T.Matrix4();
  const box=new T.Box3(),center=new T.Vector3(),eye=new T.Vector3(),point=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3();
  let batches=[],capacity=0,from=[],to=[],shown=[],origins=[],time=-1,lastArrival=0,start=0,duration=0;
  let yaw=-1.22,elevation=.38,zoom=1,selected=-1,pointer,raf=0;
  function reserve(count){
    if(ordinary){ordinary.reserve(count);return;}
    if(count<=capacity)return;
    for(const mesh of batches){scene.remove(mesh);mesh.dispose();}
    capacity=2**Math.ceil(Math.log2(count));
    batches=parts.map(part=>{
      const mesh=new T.InstancedMesh(part.geometry,part.material,capacity);
      mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);return mesh;
    });
  }
  function sample(now){
    const a=duration?Math.max(0,Math.min(1,(now-start)/duration)):1;
    for(let i=0;i<to.length;i++)for(let j=0;j<to[i].length;j++){
      const delta=to[i][j]-from[i][j];
      shown[i][j]=from[i][j]+a*(j>=3&&j<=5?Math.atan2(Math.sin(delta),Math.cos(delta)):delta);
    }
    return a<1;
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(draw);}
  function draw(now){
    raf=0;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio()))renderer.setSize(w,h,false);
    const moving=sample(now);
    box.makeEmpty();let slot=0;
    shown.forEach(([x,y,z,heading,pitch,heel,main,jib,rudder],i)=>{
      if(selected>=0&&i!==selected)return;
      root.position.set(x,y,z);root.rotation.set(id==='gull'?-heel:heel,(size.pitch??-1)*pitch,heading,'ZYX');root.updateMatrix();
      box.expandByPoint(root.position);
      if(ordinary){ordinary.pose(slot++,root.matrix,shown[i],time);return;}
      transforms[0].copy(root.matrix);
      const angles=[main,jib,-rudder,-rudder];
      pivots.forEach(({at,axis,rest},j)=>{
        transforms[j+1].copy(root.matrix).multiply(rotate.makeTranslation(at.x,at.y,at.z))
          .multiply(rotate.makeRotationAxis(axis,angles[j]-rest)).multiply(back.makeTranslation(-at.x,-at.y,-at.z));
      });
      batches.forEach((mesh,j)=>mesh.setMatrixAt(slot,transforms[parts[j].index]));slot++;
    });
    ordinary?.finish(slot);
    for(const mesh of batches){mesh.count=slot;mesh.instanceMatrix.needsUpdate=true;}
    if(!box.isEmpty()){box.getCenter(center);center.z+=size.center??0;}
    camera.aspect=w/h;camera.updateProjectionMatrix();
    eye.set(Math.cos(yaw)*Math.cos(elevation),Math.sin(yaw)*Math.cos(elevation),Math.sin(elevation));
    right.set(-Math.sin(yaw),Math.cos(yaw),0);up.crossVectors(eye,right);
    const tanY=.88*Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect;
    let fit=size.length;
    shown.forEach((row,i)=>{
      if(selected>=0&&selected!==i)return;
      point.fromArray(row).sub(center);point.z+=size.center??0;
      const depth=point.dot(eye)+.5*size.length;
      fit=Math.max(fit,depth+(Math.abs(point.dot(right))+.5*size.length)/tanX,
        depth+(Math.abs(point.dot(up))+(sailing?.77:.30)*size.length)/tanY);
    });
    const distance=fit*zoom;
    camera.position.copy(center).addScaledVector(eye,distance);camera.lookAt(center);camera.updateMatrixWorld();
    const floor=size.underwater?Math.min(-20,center.z-2*size.length):0;
    water.position.set(center.x,center.y,floor);grid.position.z=floor+.012;grid.position.x=Math.round(center.x/5)*5;grid.position.y=Math.round(center.y/5)*5;
    renderer.render(scene,camera);if(moving)schedule();
  }
  const on=(event,fn,opts)=>canvas.addEventListener(event,fn,{...opts,signal:events.signal});
  const magnify=factor=>{zoom=Math.max(.18,Math.min(4,zoom*factor));schedule();};
  on('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointer=[e.clientX,e.clientY];});
  on('pointermove',e=>{
    if(!pointer)return;
    yaw-=(e.clientX-pointer[0])*.009;elevation=Math.max(.07,Math.min(1.46,elevation+(e.clientY-pointer[1])*.008));
    pointer=[e.clientX,e.clientY];schedule();
  });
  on('lostpointercapture',()=>{pointer=null;});
  on('wheel',e=>{e.preventDefault();magnify(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.0015))));},{passive:false});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);schedule();
  return {frames(data){
    const rows=data?.frames??[],now=performance.now(),stamp=data?.batchSeconds;
    const reset=rows.length!==to.length||!rows.length||!(stamp>time);
    if(reset){
      origins=rows.map(r=>r.slice(0,2));
      if(selected>=rows.length)selected=-1;
    }
    const cols=Math.ceil(Math.sqrt(rows.length));
    sample(now);
    to=rows.map(([x,y,z,h,p,r],i)=>{
      const rig=data.rig?.[i]??(sailing?[pivots[0].rest,pivots[1].rest,-pivots[2].rest]:[]);
      return [x-origins[i][0]+(i%cols)*2*size.length,
        y-origins[i][1]+Math.floor(i/cols)*2*size.length,z,h,p,r,...rig];
    });
    from=(reset?to:shown).map(row=>row.slice());shown=from.map(row=>row.slice());
    reserve(rows.length);time=stamp;duration=reset?0:Math.min(1000,Math.max(16,now-lastArrival));lastArrival=start=now;schedule();
  },focus(i){selected=i;zoom=1;schedule();},magnify,dispose(){
    observer.disconnect();events.abort();cancelAnimationFrame(raf);ordinary?.dispose();for(const mesh of batches)mesh.dispose();
    for(const object of [water,grid]){object.geometry.dispose();object.material.dispose();}
    renderer.dispose();
  }};
}
