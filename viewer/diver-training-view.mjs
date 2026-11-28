// Each swimmer uses its actual posed skin. Display offsets separate the independent environments.
import {scubaDiver} from './scuba-diver.mjs';
import {trainingRigOverlay} from './training-rig-overlay.mjs';
import {trainingCameraDrag} from './training-camera.mjs';

function skinBatches(T,scene,parts,capacity) {
  const bones=parts[0].skeleton.bones.length,width=4*bones,stride=16*bones;
  const data=new Float32Array(stride*capacity);
  const texture=new T.DataTexture(data,width,capacity,T.RGBAFormat,T.FloatType);
  texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;
  const laneIndex=new T.InstancedBufferAttribute(new Float32Array(capacity),1);
  laneIndex.setUsage(T.DynamicDrawUsage);
  const nodes=parts.map(part=>{
    const source=part.geometry,geometry=new T.InstancedBufferGeometry();
    for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
    geometry.setIndex(source.index);geometry.setAttribute('trainingLane',laneIndex);geometry.instanceCount=0;
    const material=part.material.clone(),bind=part.bindMatrix;
    // Bone matrices already include world pose and the grid translation. In
    // attached bind mode the source mesh's model and inverse bind pose cancel.
    material.onBeforeCompile=shader=>{
      shader.uniforms.trainingBones={value:texture};shader.uniforms.bindMatrix={value:bind};
      shader.vertexShader=shader.vertexShader.replace('#include <skinning_pars_vertex>',`
        #define USE_SKINNING
        attribute vec4 skinIndex;
        attribute vec4 skinWeight;
        attribute float trainingLane;
        uniform highp sampler2D trainingBones;
        uniform mat4 bindMatrix;
        const mat4 bindMatrixInverse=mat4(1.0);
        mat4 getBoneMatrix(const in float bone) {
          float x=(bone*4.0+0.5)/${width}.0;
          float y=(trainingLane+0.5)/${capacity}.0;
          return mat4(texture2D(trainingBones,vec2(x,y)),
            texture2D(trainingBones,vec2(x+1.0/${width}.0,y)),
            texture2D(trainingBones,vec2(x+2.0/${width}.0,y)),
            texture2D(trainingBones,vec2(x+3.0/${width}.0,y)));
        }`);
    };
    material.customProgramCacheKey=()=>`diver-training-bones-${width}-${capacity}`;
    const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);return mesh;
  });
  return {data,stride,texture,laneIndex,
    count(n){for(const part of nodes)part.geometry.instanceCount=n;},
    dispose(){for(const part of nodes){part.removeFromParent();part.geometry.dispose();part.material.dispose();}texture.dispose();}
  };
}

export async function trainingView(T,canvas,signal,onStatus=()=>{}){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));renderer.setClearColor(0,0);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(40,1,.025,250);
  camera.up.set(0,0,1);scene.fog=new T.FogExp2(0x285762,.012);
  scene.add(new T.HemisphereLight(0xe3ffff,0x76aeca,1.65));
  const light=new T.DirectionalLight(0xd9fff9,2);light.position.set(-4,-2,8);scene.add(light);
  const focus=new T.Vector3(),box=new T.Box3(),sphere=new T.Sphere(new T.Vector3(),2);
  const frustum=new T.Frustum(),projection=new T.Matrix4(),parts=[],hinges=[];
  let rig,skin,diagnostics,capacity=0,ready=0,rows=[],pending,job,from,target,building,lastTime,arrival=0,duration=0,start=0;
  let selected=-1,overlay=false,angle=-.95,elev=.5,zoom=1,raf,disposed=false,dirty=true,unitsPerPixel=0;
  const centers=[],eyeAxis=new T.Vector3(),rightAxis=new T.Vector3(),upAxis=new T.Vector3(),offset=new T.Vector3();
  const pan=new T.Vector3(),targetPoint=new T.Vector3();
  function reserve(n){
    if(n<=capacity)return;
    skin?.dispose();diagnostics?.dispose();
    capacity=2**Math.ceil(Math.log2(n));skin=skinBatches(T,scene,parts,capacity);
    from=new Float32Array(skin.data.length);target=new Float32Array(skin.data.length);
    building=new Float32Array(skin.data.length);
    diagnostics=trainingRigOverlay(T,scene,capacity*hinges.length);ready=0;lastTime=undefined;
  }
  function center(out,row,i,count){
    const cols=Math.ceil(Math.sqrt(count)),height=Math.ceil(count/cols);
    out.fromArray(row,1);
    out.x+=3.4*(Math.floor(i/cols)-(height-1)*.5);
    out.y+=2.5*(i%cols-(cols-1)*.5);
    return out;
  }
  function cameraPose(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const pr=renderer.getPixelRatio();
    if(canvas.width!==Math.floor(w*pr)||canvas.height!==Math.floor(h*pr)){renderer.setSize(w,h,false);dirty=true;}
    camera.aspect=w/h;camera.updateProjectionMatrix();
    eyeAxis.set(Math.cos(angle)*Math.cos(elev),Math.sin(angle)*Math.cos(elev),Math.sin(elev));
    rightAxis.set(-Math.sin(angle),Math.cos(angle),0);upAxis.crossVectors(eyeAxis,rightAxis);
    const tanY=.92*Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect;
    let fit=3.3/Math.min(1,camera.aspect);
    if(selected<0)for(let i=0;i<ready;i++){
      offset.subVectors(centers[i],focus);
      const near=offset.dot(eyeAxis);
      fit=Math.max(fit,near+(Math.abs(offset.dot(rightAxis))+1.6)/tanX,near+(Math.abs(offset.dot(upAxis))+1.0)/tanY);
    }
    const distance=Math.max(.35,zoom*fit);
    unitsPerPixel=2*distance*Math.tan(camera.fov*Math.PI/360)/h;
    targetPoint.copy(focus).add(pan);
    camera.position.copy(targetPoint).addScaledVector(eyeAxis,distance);
    camera.lookAt(targetPoint);camera.updateMatrixWorld();
  }
  function frameBounds(){
    box.makeEmpty();
    for(let i=0;i<ready;i++)if(selected<0||selected===i)box.expandByPoint(centers[i]);
    if(!box.isEmpty())box.getCenter(focus);
    dirty=true;
  }
  function visible(){
    if(!skin)return;
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let n=0;
    for(let i=0;i<ready;i++){
      sphere.center.copy(centers[i]);if(frustum.intersectsSphere(sphere))skin.laneIndex.array[n++]=i;
    }
    skin.laneIndex.needsUpdate=true;skin.count(n);dirty=false;
  }
  function interpolate(now){
    if(!duration||!skin)return;
    const a=Math.max(0,Math.min(1,(now-start)/duration)),count=ready*skin.stride;
    for(let i=0;i<count;i++)skin.data[i]=from[i]+a*(target[i]-from[i]);
    skin.texture.needsUpdate=true;
    if(a===1)duration=0;
  }
  function pose(row,i,n){
    rig.applyFrame(row,0);
    const p=centers[i]??(centers[i]=new T.Vector3());
    rig.group.position.copy(center(p,row,i,n));
    rig.group.updateMatrixWorld(true);
  }
  function begin(now){
    const batch=pending;pending=null;
    reserve(batch.rows.length);
    const time=batch.rows[0][0],reset=time<=lastTime||rows.length!==batch.rows.length||lastTime===undefined;
    if(reset){ready=0;duration=0;}
    job={rows:batch.rows,i:0,reset,arrival:batch.arrival};
    diagnostics.clear();
    if(reset)onStatus('Posing '+batch.rows.length+' divers');
  }
  function advance(now){
    if(!job&&pending)begin(now);
    if(!job)return;
    const j=job,n=j.rows.length,begun=performance.now(),skeleton=parts[0].skeleton;
    do{
      const i=j.i++,row=j.rows[i];pose(row,i,n);skeleton.update();
      const next=skeleton.boneMatrices.subarray(0,skin.stride),offset=i*skin.stride;
      building.set(next,offset);
      if(j.reset){skin.data.set(next,offset);ready=j.i;skin.texture.needsUpdate=true;}
      if(overlay&&(selected<0||selected===i))diagnostics.rig(rig.group,hinges);
    }while(j.i<n&&performance.now()-begun<5);
    if(j.reset){frameBounds();onStatus(j.i<n?'Posing divers · '+j.i+' / '+n:'');}
    if(j.i<n)return;
    // Keep displaying the preceding segment while the next bone palette is built.
    // Arrival cadence can be several seconds on a GPU shared with the desktop.
    const prepared=performance.now();
    if(!j.reset){
      interpolate(prepared);
      from.set(skin.data);
      start=prepared;
      duration=Math.max(16,(j.arrival-arrival)*1.08);
    }
    [target,building]=[building,target];
    rows=j.rows;ready=n;lastTime=rows[0][0];arrival=j.arrival;job=null;frameBounds();diagnostics.flush();
  }
  let rateStart=performance.now(),rendered=0,fps;
  function draw(now){
    if(signal.aborted)return;
    advance(now);interpolate(now);cameraPose();if(dirty)visible();
    renderer.render(scene,camera);
    rendered++;
    if(now-rateStart>=1000){fps=1000*rendered/(now-rateStart);rateStart=now;rendered=0;}
    raf=requestAnimationFrame(draw);
  }
  function overlayPose(){
    if(!diagnostics)return;
    diagnostics.clear();
    if(job){job.i=0;diagnostics.flush();return;}
    if(overlay)rows.forEach((row,i)=>{if(selected<0||i===selected){pose(row,i,rows.length);diagnostics.rig(rig.group,hinges);}});
    diagnostics.flush();
  }
  function dispose(){
    if(disposed)return;disposed=true;
    cancelAnimationFrame(raf);skin?.dispose();diagnostics?.dispose();rig?.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  signal.addEventListener('abort',dispose,{once:true});
  const magnify=factor=>{zoom=Math.max(.06,Math.min(3,zoom*factor));dirty=true;};
  trainingCameraDrag(canvas,signal,{
    orbit(dx,dy){angle-=dx*.009;elev=Math.max(-1.35,Math.min(1.35,elev+dy*.008));dirty=true;},
    pan(dx,dy){pan.addScaledVector(rightAxis,-dx*unitsPerPixel).addScaledVector(upAxis,dy*unitsPerPixel);dirty=true;}
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();magnify(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.0015))));},{passive:false,signal});
  try{
    onStatus('Loading diver model');
    rig=await scubaDiver(T,undefined,{training:true});
    if(signal.aborted){rig.dispose();return;}
    rig.group.traverse(o=>{if(o.isSkinnedMesh)parts.push(o);if(o.userData.physicsJoint)hinges.push(o);});
    if(!parts.length||parts.some(p=>p.skeleton!==parts[0].skeleton))throw Error('Expected one shared dressed diver skeleton');
    onStatus('');raf=requestAnimationFrame(draw);
  }catch(error){if(!disposed)dispose();throw error;}
  return {
    get fps(){return fps;},
    frames(value){
      if(value?.length){pending={rows:value,arrival:performance.now()};return;}
      rows=[];pending=null;job=null;ready=0;duration=0;lastTime=undefined;
      skin?.count(0);diagnostics?.clear();diagnostics?.flush();dirty=true;onStatus('');
    },
    focus(i){selected=i;zoom=1;pan.set(0,0,0);frameBounds();overlayPose();},
    overlay(on){overlay=on;overlayPose();},magnify
  };
}
