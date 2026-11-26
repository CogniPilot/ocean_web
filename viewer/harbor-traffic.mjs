import {diverWreckStart} from './harbor-sites.mjs';
import {sharkSegments} from './shark-inertia.mjs';
import {diverObstacles} from './diver-contact.mjs';
import {diverContactRig} from './scuba-diver.mjs';
import {whaleCameraGuard} from './whale-camera.mjs';
import {mantaVisual,swimmerObservation,wildlifeObservations,wildlifeActorId} from './manta.mjs';
import {divePacket,gullIndex,individualSwimmer,writeAnimalContacts} from './npc-room.mjs';
import {whaleEffects} from './whale-effects.mjs';
import {feedingHarbor} from './feeding-harbor.mjs';
import {greatWhiteLength} from './wildlife-wake.mjs';
import {GLTFLoader} from './vendor/gltf-loader.mjs';

export function interpolateSharkTail(previous,next,f){
  // Fish state on the wire at offset 65: peduncle angle and angular rate.
  const from=previous[70]??0,to=next[70]??0,delta=to-from;
  const duration=next[0]-previous[0],fromRate=previous[71],toRate=next[71];
  if(!(duration>0&&duration<=.21)||!Number.isFinite(fromRate)||!Number.isFinite(toRate))
    return from+f*delta;
  // Use both solved angular rates between snapshots. Straight interpolation
  // can miss the reversal of a tail stroke inside a 100 or 200 ms packet.
  return from+f*f*(3-2*f)*delta+duration*f*(1-f)*((1-f)*fromRate-f*toRate);
}

// Render a little behind the solved clock. Packet arrivals can bunch up even
// when the sender produces perfectly spaced model-time samples.
export class SwimmerTrack {
  constructor(individual=false){
    this.individual=individual;
    this.samples=[];
    this.row=new Float64Array(individual?23:319);
  }
  receive(frame,gape,now){
    let latest=this.samples.at(-1);
    if(latest?.frame[0]===frame[0])return;
    if(latest&&(frame[0]<latest.frame[0]||now-latest.arrival>1800)){
      this.samples.length=0;latest=undefined;
    }
    if(!latest){
      this.cursor=frame[0];this.speed=1;this.spacing=.1;this.lastDraw=now;this.ready=false;
    }else{
      const step=frame[0]-latest.frame[0];
      this.spacing+=.15*(step-this.spacing);
      const base=this.samples[0];
      if(now-base.arrival>=300){
        const measured=(frame[0]-base.frame[0])*1000/(now-base.arrival);
        this.speed+=.15*(measured-this.speed);
      }
    }
    const size=this.individual?frame.length:Math.max(319,frame.length);
    if(this.row.length!==size)this.row=new Float64Array(size);
    this.samples.push({frame,gape,arrival:now});
    if(this.samples.length>16)this.samples.shift();
  }
  at(now){
    const samples=this.samples,latest=samples.at(-1);
    if(!latest)return;
    const dt=Math.max(0,(now-this.lastDraw)/1000);this.lastDraw=now;
    const delay=1.8*this.spacing;
    if(latest.frame[0]-this.cursor>=delay)this.ready=true;
    if(this.ready){
      const error=latest.frame[0]-this.cursor-delay;
      const rate=this.speed*Math.min(1.22,Math.max(.78,1+error));
      this.cursor=Math.min(latest.frame[0],Math.max(samples[0].frame[0],this.cursor+dt*rate));
    }
    let i=0;
    while(i+1<samples.length&&samples[i+1].frame[0]<=this.cursor)i++;
    const a=samples[i],b=samples[i+1]??a,left=a.frame,right=b.frame;
    const span=right[0]-left[0],mix=span>0?(this.cursor-left[0])/span:0;
    const row=this.row;
    for(let k=0;k<row.length;k++){
      const from=left[k]??0,to=right[k]??from;
      row[k]=from+mix*(to-from);
    }
    for(const k of this.individual?[7]:[12,20]){
      const delta=right[k]-left[k];
      row[k]=left[k]+mix*Math.atan2(Math.sin(delta),Math.cos(delta));
    }
    if(this.individual)return row;
    row[70]=interpolateSharkTail(left,right,mix);
    for(let k=60;k<65;k++)row[k]=left[k]??0;
    if(right[22]<left[22])row[22]=left[22];
    this.gape=a.gape+mix*(b.gape-a.gape);
    this.rightFrame=right;this.fraction=left===right?1:mix;
    return row;
  }
}

const sharkDenticles=new WeakMap();
function sharkSkin(T,material){
  let maps=sharkDenticles.get(T);
  if(!maps){
    const loader=new T.TextureLoader();
    function load(suffix,colorSpace){
      const map=loader.load(new URL('./assets/subsea/shark-denticles-'+suffix+'.webp',import.meta.url).href);
      map.colorSpace=colorSpace;map.wrapS=map.wrapT=T.MirroredRepeatWrapping;
      map.repeat.set(28,12);map.anisotropy=4;
      return map;
    }
    maps={albedo:load('albedo',T.SRGBColorSpace),surface:load('surface',T.NoColorSpace)};
    sharkDenticles.set(T,maps);
  }
  material.roughnessMap=maps.surface;material.roughness=.94;
  material.bumpMap=maps.surface;material.bumpScale=.00028;
  const waterLight=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    waterLight.call(material,shader,renderer);
    shader.uniforms.denticles={value:maps.albedo};
    shader.fragmentShader='uniform sampler2D denticles;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n diffuseColor.rgb*=.92+.28*texture2D(denticles,vBumpMapUv).rgb;');
  };
  material.customProgramCacheKey=()=>'great-white-denticles-and-caustics';
}

async function marineAnimal(T,name,length,caustics,tideUniform){
  const url=new URL('./assets/'+name+'.glb',import.meta.url);
  url.search=new URL(import.meta.url).search;
  const {scene:model}=await new GLTFLoader().loadAsync(url.href);
  model.traverse(m=>{
    if(m.isMesh&&m.material.name==='Slate dorsum and ivory belly'){
      caustics.lightSkin(m.material,tideUniform);sharkSkin(T,m.material);
    }
  });
  const group=new T.Group(),aligned=new T.Group();group.add(aligned);aligned.add(model);
  model.rotation.x=Math.PI/2;group.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(model,true),size=box.getSize(new T.Vector3());
  const head=model.getObjectByName('Root').getWorldPosition(new T.Vector3());
  const tail=model.getObjectByName('Tail_end').getWorldPosition(new T.Vector3());
  aligned.rotation.z=-Math.atan2(head.y-tail.y,head.x-tail.x);
  const scale=length/Math.max(size.x,size.y);
  model.scale.setScalar(scale);model.position.copy(box.getCenter(new T.Vector3())).multiplyScalar(-scale);

  let articulate,edgePoints;
  if(name==='whale')model.position.set(0,0,0);
  group.updateMatrixWorld(true);
  function joint(name,axis,label){
    const bone=model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name)),rest=bone.quaternion.clone();
    const local=(axis??new T.Vector3(0,-1,0)).applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert());
    bone.userData.physicsJoint={axis:local.toArray(),label};
    const swing=new T.Quaternion();return angle=>bone.quaternion.copy(rest).multiply(swing.setFromAxisAngle(local,angle));
  }
  if(name==='whale'){
    // Select vertices along the textured flukes' trailing UV seam once. Their
    // skin weights are entirely on the tail bone, so the same sockets follow
    // pitch, feather and roll without traversing the skinned mesh each frame.
    let flukes;
    model.traverse(m=>{if(m.isSkinnedMesh&&m.material.name==='Ventral flukes')flukes=m;});
    const tailBone=model.getObjectByName('Tail'),rim=[];
    if(flukes){
      const uv=flukes.geometry.attributes.uv;
      for(let i=0;i<16;i++){
        const target=(i+.5)/16;
        let best=Infinity,index=0;
        for(let j=0;j<uv.count;j++){
          const error=Math.abs(uv.getX(j)-target)+Math.abs(uv.getY(j));
          if(error<best){best=error;index=j;}
        }
        const v=flukes.getVertexPosition(index,new T.Vector3());
        rim.push(tailBone.worldToLocal(flukes.localToWorld(v)));
      }
    }
    edgePoints=points=>{
      tailBone.updateWorldMatrix(true,false);
      for(let i=0;i<16;i++){
        if(rim[i])points[i].copy(rim[i]).applyMatrix4(tailBone.matrixWorld);
        else points[i].set(group.position.x,group.position.y,-1000);
      }
    };
    const proximal=joint('Spine3',null,'Tail bend · front'),distal=joint('Spine4',null,'Tail bend · rear');
    const fluke=joint('Tail',null,'Fluke feather');
    const port=joint('TopFlipper.L',null,'Port flipper'),starboard=joint('TopFlipper.R',null,'Starboard flipper');
    articulate=(state,k)=>{
      const flex=state[k+7]-state[k+5];
      proximal(.60*flex);distal(.40*flex);fluke(state[k+15]);
      port(state[k+16]);starboard(state[k+17]);
    };
  }else{
    const lateral=(name,label)=>joint(name,new T.Vector3(0,0,1),label);
    const trunk=lateral('Spine2','Trunk flex'),peduncle=lateral('Spine3','Peduncle sweep'),tail=lateral('Tail','Caudal feather');
    const port=joint('Bone',null,'Port pectoral incidence'),starboard=joint('Bone001',null,'Starboard pectoral incidence');
    articulate=state=>{
      const flex=state[202]??0,bend=state[70]??0;
      trunk(flex);peduncle(bend-flex);tail((state[72]??0)-bend);
      port(state[319]??state[201]??0);starboard(state[320]??state[201]??0);
    };
  }
  const collisionRig=new Map();
  model.traverse(bone=>{
    if(bone.isBone)collisionRig.set(bone.name,{bone,inverseRest:bone.matrixWorld.clone().invert()});
  });
  group.userData.collisionRig=collisionRig;
  if(name==='shark'){
    group.userData.physicsBodies=sharkSegments.map(({bone:boneName,label,mass,pivot,center,inertia})=>{
      const {bone,inverseRest}=collisionRig.get(boneName);
      const frame=new T.Object3D();frame.name=label;frame.matrixAutoUpdate=false;
      // Cancel glTF rig units / axes in the neutral pose, then follow the joint.
      frame.matrix.copy(inverseRest).multiply(new T.Matrix4().makeTranslation(...pivot));
      bone.add(frame);
      const [xx,yy,zz,xy,xz,yz]=inertia;
      return {frame,label,mass,center:center.map((x,i)=>x-pivot[i]),moments:[xx,yy,zz],tensor:[xx,xy,xz,xy,yy,yz,xz,yz,zz]};
    });
  }
  if(name==='whale')group.userData.guardCamera=whaleCameraGuard(T,group);
  group.name=name==='whale'?'NPC humpback':'NPC shark';
  const jaws=[];
  model.traverse(m=>{const index=m.morphTargetDictionary?.Feed;if(index!=null)jaws.push([m,index]);});
  function mouth(value){for(const [m,index] of jaws)m.morphTargetInfluences[index]=value;}
  return {group,articulate,mouth,edgePoints,socket:model.getObjectByName('HumpbackBlowholes')};
}

export function harborTraffic(T,scene,fleet,sampleSurface,playSound,caustics,tideUniform,gullEnvironment,signal,otherActors,sampleBed,fishWaterLimits,sampleActorCurrents,sampleMappedCurrent){
  let perceived=[],lastPerception=-Infinity,diverPhysics;
  const room=fleet.npc,feeding=feedingHarbor(T,scene,room,playSound,gullEnvironment,sampleSurface,signal,()=>perceived,fishWaterLimits,sampleMappedCurrent);
  const visuals=new Map(),started=new Set();
  let worker,pending,session,lastTime,lastEnvironment,acc=0,gullDebt=0;
  let current,lastPacket,arrival=0,interval=100;
  let localActor,localVessel,breakwater,loadingBreakwater,breakwaterState;
  const breakwaterRig=new Float64Array(203);
  function showBreakwater(row,time){
    breakwaterState=row;
    if(!row||row[0]<.5){if(breakwater)breakwater.group.visible=false;return;}
    if(!breakwater&&!loadingBreakwater){
      loadingBreakwater=marineAnimal(T,'shark',greatWhiteLength,caustics,tideUniform).then(visual=>{
        if(signal.aborted)return;
        breakwater=visual;
        visual.group.name='Breakwater';
        visual.group.visible=Boolean(breakwaterState?.[0]);
        scene.add(visual.group);
      }).catch(error=>console.warn('Great white encounter model unavailable',error));
    }
    if(!breakwater)return;
    const {group,articulate,mouth}=breakwater;
    group.visible=true;group.position.fromArray(row,1);group.rotation.set(0,-row[5],row[4],'ZYX');
    mouth(row[9]);
    // Skin motion between the resolved swim and jaw poses.
    const frequency=.48+.13*Math.hypot(row[6],row[7],row[8]),phase=2*Math.PI*frequency*time;
    breakwaterRig[202]=.06*Math.sin(phase);
    breakwaterRig[70]=.14*Math.sin(phase-.70);
    breakwaterRig[72]=.23*Math.sin(phase-1.35);
    articulate(breakwaterRig);
  }

  function syncVisuals(){
    for(const [id,entry] of visuals){
      if(room.animals.has(id))continue;
      entry.effects?.dispose();entry.visual?.dispose?.();
      entry.visual?.group.removeFromParent();
      visuals.delete(id);
    }
    for(const [id,animal] of room.animals){
      if(visuals.has(id))continue;
      const entry={track:new SwimmerTrack(individualSwimmer(animal.kind))};
      visuals.set(id,entry);
      const whale=animal.kind==='whale';
      const asset=animal.kind==='diver'?import('./scuba-diver.mjs').then(m=>m.scubaDiver(T,playSound)):
        animal.kind==='manta'?mantaVisual(T,scene,signal,sampleSurface,playSound):
        marineAnimal(T,animal.kind,whale?10:greatWhiteLength,caustics,tideUniform);
      asset.then(visual=>{
        if(signal.aborted||visuals.get(id)!==entry){visual.dispose?.();return;}
        visual.group.userData.swimmer={id,kind:animal.kind};
        entry.visual=visual;
        if(whale)entry.effects=whaleEffects(T,scene,sampleSurface);
        visual.group.visible=false;
        scene.add(visual.group);
      }).catch(console.error);
    }
  }
  function resumed(frame){
    return frame?{initialState:frame.slice(0,17),initialSwimmer:frame.slice(24,42),initialImpact:frame.slice(60,65),
      ...(frame.length>=70?{initialFish:[...frame.slice(65,70),...(frame.length>=75?frame.slice(70,75):[0,0,0,0,0])]}:{}),
      ...(frame.length>=81?{initialGuidance:frame.slice(75,81)}:{}),
      ...(frame.length>=205?{initialSharkBank:frame.slice(203,205)}:{}),
      ...(frame.length>=207?{initialSwimReserve:frame.slice(205,207)}:{})}:{};
  }
  function useSpawn(seed,animal){
    if(!animal?.spawn||animal.frame)return;
    if(animal.kind==='whale'){
      seed.initialSwimmer??=[2,-18,-3,1.7,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
      [seed.initialSwimmer[0],seed.initialSwimmer[1]]=animal.spawn;
    }else{
      seed.initialState??=[0,-28,6,0,2,-25,2,6,0,9,-12,-4,0,-.06,0,0,0];
      [seed.initialState[9],seed.initialState[10]]=animal.spawn;
    }
  }
  function pilotInputs(a,frame){
    if(!a)return {};
    const isWhale=a.kind==='whale',pose=isWhale?(frame?.slice(17,21)??[2,-18,-3,0]):(frame?.slice(9,13)??[9,-12,-4,0]);
    const clock=frame?.[0]??0;

    let turn=0,pitch=0,effort=0,age=-1,roll=0,sprint=false;
    if(a.seat){
      const command=room.command(a.id);
      const {axes,bank,breach}=command;sprint=command.sprint;
      roll=bank*1.4;
      turn=axes[0];pitch=axes[1]*.88;effort=(axes[2]+1)*.5;
      if(breach&&(a.breachAt==null||clock-a.breachAt>(isWhale?25:10)))a.breachAt=clock;
      if(a.breachAt!=null){age=clock-a.breachAt;if(age>(isWhale?25:10)){a.breachAt=undefined;age=-1;}}
    }else a.breachAt=undefined;
    const [e,n]=pose;
    return {
      ...(isWhale?{}:{sharkDirect:a.seat&&age<0&&!sprint?2:0}),
      [isWhale?'whalePilot':'sharkPilot']:[Number(Boolean(a.seat)),pitch,effort,age],
      [isWhale?'whalePrey':'sharkPrey']:!a.seat&&frame?feeding.prey(a,frame,clock):[0,0,0,0,0],
      [isWhale?'whaleTurn':'sharkTurn']:turn,
      [isWhale?'whaleBank':'sharkBank']:roll,
      [isWhale?'whaleSlope':'sharkSlope']:[(sampleSurface(e+1,n)-sampleSurface(e-1,n))/2,(sampleSurface(e,n+1)-sampleSurface(e,n-1))/2],
      [isWhale?'localSurface':'sharkSurface']:sampleSurface(e,n)
    };
  }
  function stopWorker(){
    worker?.terminate();
    worker=undefined;pending=undefined;started.clear();
  }
  function takeControl(){
    const owned=new Worker(new URL('./harbor-worker.mjs',import.meta.url),{type:'module'});
    const sourceSession=room.session;
    worker=owned;
    function failed(message){
      if(worker!==owned)return;
      stopWorker();console.error('Harbor simulation:',message);
    }
    owned.onerror=event=>failed(event.message);
    owned.onmessage=({data})=>{
      if(worker!==owned||room.session!==sourceSession||!room.host||!room.animals.size||!pending)return;
      if(data.error){failed(data.error);return;}
      const {steps,swimmers}=pending;
      pending=undefined;
      let base;
      for(const {id,frame,attempt,loads} of data.frames){
        if(loads)for(const [animalId,values] of loads)room.publishLoads(animalId,values);
        const member=room.animals.get(id);
        if(individualSwimmer(member?.kind)){if(member===swimmers.get(id))member.frame=frame;continue;}
        if(id!=='harbor'&&!member)continue;
        frame[23]=sampleSurface(frame[17],frame[18]);
        if(id==='harbor'){
          base=frame;
          for(const kind of ['whale','shark']){
            const a=room.animals.get(kind);
            if(a){a.spawn=undefined;a.feedingAttempt=attempt[kind==='whale'?0:1];}
          }
        }
        else if(room.animals.has(id)){
          const animal=room.animals.get(id);
          animal.frame=frame;animal.feedingAttempt=attempt[animal.kind==='whale'?0:1];
        }
      }
      {
        const time=Math.max((room.habitat.time??0)+steps*.01,base?.[0]??0);
        feeding.step(time,base,room.latest?.frame);
        room.publish(base);
      }
    };
  }
  (signal??window).addEventListener(signal?'abort':'pagehide',stopWorker,{once:true});

  function observe(now,frame){
    const {local,localHull}=lastEnvironment;
    const observed=[...fleet.vessels(now),...(otherActors?.()??[])];
    // Piloted animals already appear at their authoritative wildlife pose.
    if(!localActor&&local)observed.push({...local,...(localHull?.kind===local.kind?localHull:null),id:room.self});
    if(localHull&&(localActor||local?.kind!==localHull.kind))observed.push({...localHull,id:room.self+'-hull'});
    for(const animal of room.animals.values()){
      const v=swimmerObservation(animal,frame);
      if(v)observed.push(v);
    }
    for(const [i,g] of room.habitat.gulls.entries()){
      observed.push({id:'gull-'+(i+1),kind:'gull',x:g[0],y:g[1],z:g[2],yaw:g[3],ve:g[4]*Math.cos(g[3]),vn:g[4]*Math.sin(g[3]),vu:g[5]});
    }
    if(breakwaterState?.[0]>.5){
      const r=breakwaterState;
      observed.push({id:'breakwater',kind:'shark',x:r[1],y:r[2],z:r[3],yaw:r[4],pitch:-r[5],ve:r[6],vn:r[7],vu:r[8]});
    }
    return observed;
  }
  function advanceHost(time,now){
    if(!lastEnvironment)return;
    if(session!==room.session){
      stopWorker();
      session=room.session;lastTime=time;lastPerception=-Infinity;acc=0;gullDebt=0;
      current=lastPacket=undefined;
      for(const [id,entry] of visuals)entry.track=new SwimmerTrack(individualSwimmer(room.animals.get(id)?.kind));
    }
    const frame=room.latest?.frame;
    if(time<lastPerception||time-lastPerception>=.10){
      perceived=observe(now,frame);lastPerception=time;
    }
    if(room.host&&feeding.advanceSchool?.(time,lastEnvironment.flow)&&!room.hasWildlife)room.publish();
    const elapsed=Math.min(.35,Math.max(0,time-(lastTime??time)));
    lastTime=time;
    const needsWorker=room.host&&room.animals.size>0;
    if(!needsWorker&&worker)stopWorker();
    if(!room.host||!room.hasWildlife){acc=0;gullDebt=0;return;}

    const {wind,level,flow}=lastEnvironment;
    // Gull plants are small and can publish a presentation sample at the
    // render cadence even when a swimmer's worker batch is still pending.
    if(room.habitat.gulls.length){
      gullDebt+=elapsed;
      const gullSteps=Math.floor((gullDebt+1e-9)/.01);
      if(gullSteps>=2){
        gullDebt=Math.max(0,gullDebt-gullSteps*.01);
        feeding.stepGulls(gullSteps,flow);
      }
    }else gullDebt=0;
    acc+=elapsed;
    if(pending||acc<.1)return;
    const steps=Math.min(2,Math.floor((acc+1e-9)/.1))*10;
    acc=Math.max(0,acc-steps*.01);

    if(!needsWorker){
      feeding.step((room.habitat.time??0)+steps*.01);
      room.publish();
      return;
    }
    if(!worker)takeControl();
    const observed=perceived;
    const mainHarbor=[...room.animals.values()].some(a=>!individualSwimmer(a.kind));
    const inputs={sharkDirect:0,...pilotInputs(room.animals.get('whale'),frame),...pilotInputs(room.animals.get('shark'),frame),
      observerIds:[wildlifeActorId('whale'),wildlifeActorId('shark')],
      ...wildlifeObservations(observed,new Set(),frame?.slice(9,12),false,frame?.slice(17,20))};
    const actors=mainHarbor?[{id:'harbor',inputs}]:[];
    if(mainHarbor&&!started.has('harbor')){
      const seed=resumed(frame);
      for(const kind of ['whale','shark'])useSpawn(seed,room.animals.get(kind));
      actors[0].seed=seed;
    }
    const peerProbes=new Map(),swimmerCurrents=[];
    for(const [id,animal] of room.animals){
      if(animal.kind==='diver'){
        const f=animal.frame,number=Number(id.split('-')[1])||1;
        const spawn=animal.spawn,shore=spawn?.length===2;
        const heading=shore?Math.PI:spawn?.[3]??diverWreckStart.yaw;
        const start=shore?[spawn[0],spawn[1],sampleBed(...spawn)+1.15]:spawn?.slice(0,3)??[diverWreckStart.x,diverWreckStart.y-.8*(number-1),diverWreckStart.z],position=f?.slice(1,4)??start;
        const avoid=[0,0,0];
        for(const other of observed){
          if(other.id===id)continue;
          const dx=position[0]-other.x,dy=position[1]-other.y,dz=position[2]-other.z;
          const distance=Math.hypot(dx,dy,dz),radius=other.kind==='whale'?7:other.kind==='motorboat'?6:2.6;
          if(distance<=.001||distance>=radius)continue;
          const scale=(1-distance/radius)/distance;
          avoid[0]+=dx*scale;avoid[1]+=dy*scale;avoid[2]+=dz*scale;
        }
        const command=animal.seat&&!animal.auto?room.command(id):null;
        const [east,north]=position;
        const bedHeight=sampleBed(east,north),waterLevel=sampleSurface(east,north);
        const bedSlope=waterLevel-bedHeight<1.55?[(sampleBed(east+.12,north)-sampleBed(east-.12,north))/.24,
          (sampleBed(east,north+.12)-sampleBed(east,north-.12))/.24]:[0,0];
        diverPhysics??=diverContactRig(T);
        if(!f&&!shore)start[2]=diverPhysics.spawnHeight(start,heading,waterLevel,sampleBed);
        const sweep=f&&fishWaterLimits?diverObstacles(observed,id,f,steps*.01,fishWaterLimits,peerId=>{
          if(peerProbes.has(peerId))return peerProbes.get(peerId);
          const other=room.animals.get(peerId)?.frame;
          if(!other)return null;
          diverPhysics.rig.applyFrame(other,sampleSurface(other[1],other[2]),sampleBed);
          const points=diverPhysics.rig.triangles.snapshot();peerProbes.set(peerId,points);return points;
        }):null;
        if(!command&&f&&fishWaterLimits&&f[21]<.5){
          // Fin steering uses three short feelers against wreck, seabed and coral.
          // Prefer the clearer side; the outward bias also brakes an approach.
          const z=f[3],yaw=f[7],reach=2.6,spread=.78;
          const clearance=heading=>fishWaterLimits(east,north,z,east+reach*Math.cos(heading),
            north+reach*Math.sin(heading),z,.32)?.fraction??1;
          const ahead=clearance(yaw);
          if(ahead<1){
            const left=clearance(yaw+spread),right=clearance(yaw-spread),side=left>=right?1:-1;
            const strength=2.8*(1-ahead);
            avoid[0]-=strength*(Math.cos(yaw)+side*Math.sin(yaw));
            avoid[1]+=strength*(-Math.sin(yaw)+side*Math.cos(yaw));
            if(Math.max(left,right)<.55)avoid[2]+=.3;
          }
        }
        if(!animal.patrol)animal.patrol=[...start,heading,0];
        const incident=sweep?diverPhysics.sample(f,waterLevel,sampleBed,sweep,steps*.01):null;
        const actor={id,kind:'diver',swimWeights:animal.swimWeights,policyRevision:animal.policyRevision,learned:!!(command&&animal.learned&&waterLevel-bedHeight>1.55),inputs:{patrolOrigin:animal.patrol,vestValve:animal.learned?0:(command?.vest??0),verticalPilot:command?.vest??0,lateralPilot:command?.strafe??0,torchEquipped:command?.torch?1:0,contact:incident?.contact??[0,0,0,0],
          contactLink:incident?.contactLink??1,meshCollision:incident?.meshCollision??0,
          contactWitness:incident?.contactWitness??[0,0,0,0,0,0,0,0,0],
          meshSelfContact:incident?.meshSelfContact??[0,0,0,0,0,0,0,0,0],
          contactMomentArm:incident?.contactMomentArm??[0,0,0],contactRelativeVelocity:incident?.contactRelativeVelocity??[0,0,0],bedSlope,currentVelocity:[flow[0],flow[1],flow[2]??0],
          bedHeight,waterLevel,
          avoidance:avoid,sprint:Number(!!command?.sprint),pilot:command?[1,...command.axes,command.bank]:[0,0,0,0,0]}};
        if(!started.has(id)||!f)actor.seed={initialWaterLevel:waterLevel,initialState:f?f.slice(1,17):[...start,0,0,0,heading,0,0,0,0,0,number*.6,0,0,number*.3]};
        if(actor.seed&&f?.length>=divePacket.posture)actor.seed.initialDive=f.slice(divePacket.start,divePacket.gauge);
        if(actor.seed&&f)actor.seed.initialPitchCommand=f.length>=divePacket.lateral?f[22]:f[8];
        if(actor.seed&&shore&&!f){actor.seed.initialPosture=1;actor.seed.initialJoints=Array(20).fill(0);}
        if(actor.seed&&f?.length>=divePacket.joints){
          actor.seed.initialPosture=f[divePacket.posture];
          actor.seed.priorLog=f.slice(divePacket.log,divePacket.joints);
          if(f.length>=divePacket.lateral)actor.seed.initialJoints=f.slice(divePacket.joints,divePacket.footLoads);
          if(f.length>=divePacket.vest)actor.seed.initialLateral=f.slice(divePacket.lateral,divePacket.vest);
          if(f.length>=divePacket.axial)actor.seed.initialVestGas=f[divePacket.vest];
          if(f.length>=divePacket.length)actor.seed.initialTorch=f[divePacket.torch];
          if(f.length>=divePacket.torch)actor.seed.initialAxial=f.slice(divePacket.axial,divePacket.torch);
          else if(actor.seed.initialJoints){
            // Migrate old stroke angles defined relative to an extended fin.
            const joints=actor.seed.initialJoints;
            for(const j of [2,7]){
              const ankle=joints[j]+(1-f[21])*Math.PI/2;
              joints[j]=Math.max(-.23,Math.min(1.02,ankle));
              if(joints[j]!==ankle)joints[j+10]=0;
            }
          }
        }
        swimmerCurrents.push({actor,position});
        actors.push(actor);continue;
      }
      if(animal.kind==='manta'){
        const f=animal.frame,number=Number(id.split('-')[1])||1;
        const position=f?.slice(1,4)??[-25+2.5*(number-1),17.4-2*(number-1),-7.4];
        const command=animal.seat?room.command(id):null;
        const actor={id,kind:'manta',inputs:{...wildlifeObservations(observed,new Set([id]),position,true),
          currentVelocity:[flow[0],flow[1],flow[2]??0],waterLevel:sampleSurface(position[0],position[1]),
          bedHeight:sampleBed(position[0],position[1]),breach:Number(!!command?.breach),autoBreach:1,
          sprint:Number(command?.sprint===true),pilot:command?[1,...command.axes,command.bank]:[0,0,0,0,0]}};
        if(!started.has(id)&&f){actor.seed={initialState:f.slice(1,17)};actor.seed.initialWings=f.length>=27?f.slice(23,27):[f[18],f[18],f[22],f[22]];if(f.length>=29)actor.seed.initialWake=f.slice(27,29);}
        else if(!started.has(id)&&number>1)actor.seed={initialState:[...position,1.24,-.50,0,-.38,0,0,0,0,0,0,.34,0,60]};
        swimmerCurrents.push({actor,position});
        actors.push(actor);continue;
      }
      if(id===animal.kind)continue;
      const actor={id,inputs:{...pilotInputs(animal,animal.frame),...wildlifeObservations(observed,new Set([id]),swimmerObservation(animal,frame)?[animal.frame[animal.kind==='whale'?17:9],animal.frame[animal.kind==='whale'?18:10],animal.frame[animal.kind==='whale'?19:11]]:null)}};
      if(!started.has(id)){
        const seed=resumed(animal.frame??frame);
        if(!animal.frame)delete seed.initialSwimReserve;
        if(!animal.frame&&seed.initialState){
          const offset=Number(id.split('-')[1])||2;
          seed.initialState[9]+=5*offset;seed.initialState[10]-=6;
          seed.initialSwimmer[0]+=7*offset;seed.initialSwimmer[1]-=8;
        }
        seed.behaviorOffset=17*(Number(id.split('-')[1])||2);
        useSpawn(seed,animal);
        actor.seed=seed;
      }
      actors.push(actor);
    }
    for(const actor of actors){
      if(individualSwimmer(actor.kind))continue;
      const previous=actor.id==='harbor'?frame:room.animals.get(actor.id)?.frame;
      // Each HarborTraffic FMU contains both swimmers. Clone seeds and host handoff packets
      // carry both poses, even if the additional NPC only presents one of them.
      swimmerCurrents.push({actor,key:'whaleWater',position:actor.seed?.initialSwimmer?.slice(0,3)??previous?.slice(17,20)??[2,-18,-3]},
        {actor,key:'sharkWater',position:actor.seed?.initialState?.slice(9,12)??previous?.slice(9,12)??[9,-12,-4]});
    }
    if(swimmerCurrents.length){
      const velocities=sampleActorCurrents?.(swimmerCurrents.map(item=>item.position));
      if(velocities)swimmerCurrents.forEach(({actor,key},i)=>{
        const flow=velocities[i];
        if(key)actor.inputs[key]=[1,flow[0],flow[1]];
        else actor.inputs.currentVelocity=flow;
      });
    }
    for(const actor of actors){
      const ids=actor.id==='harbor'?['shark','whale']:[actor.id];
      const requested=ids.filter(id=>room.animals.has(id)&&room.wantsLoads(id));
      if(requested.length)actor.inspect=requested.map(id=>[id,room.animals.get(id).kind]);
    }
    started.clear();for(const actor of actors)started.add(actor.id);
    pending={steps,swimmers:new Map(actors.filter(a=>individualSwimmer(a.kind)).map(a=>[a.id,room.animals.get(a.id)]))};
    worker.postMessage({actors,steps,environment:{currentVelocity:flow,wind,waterLevel:level,
      npcTraffic:contacts(),npcArticulation:animalJoints}});
  }
  function update(time,now,wind,level,local,flow,localHull){
    localVessel=local;
    lastEnvironment={wind,level,local,flow,localHull};
    advanceHost(time,now);
    syncVisuals();

    const packet=room.latest;
    if(packet!==lastPacket){
      current=packet?.frame;lastPacket=packet;
      interval=Math.max(1,Math.min(250,now-arrival));arrival=now;
    }
    feeding.draw(room.habitat.time??current?.[0]??0,now);
    for(const [id,entry] of visuals){
      const animal=room.animals.get(id),v=entry.visual;
      if(!v)continue;
      const frame=animal.frame??(id===animal.kind&&!individualSwimmer(animal.kind)?current:undefined);
      if(!frame){v.group.visible=false;continue;}
      entry.track.receive(frame,animal.gape??0,now);
      const row=entry.track.at(now);
      v.group.visible=true;v.group.userData.contactPose=row;
      if(animal.kind==='diver'){
        v.applyFrame(row,sampleSurface(row[1],row[2]),sampleBed);
        if(frame.length>=divePacket.joints)v.setComputer?.(frame);
        continue;
      }
      if(animal.kind==='manta'){v.articulate(row);continue;}
      v.mouth(entry.track.gape);
      if(animal.kind==='whale'){
        v.group.position.fromArray(row,17);v.group.rotation.set(row[35],-row[21],row[20],'ZYX');v.articulate(row,24);
        entry.effects.update(row,row[0],v,wind);
      }else{
        v.group.position.fromArray(row,9);v.group.rotation.set(row[203],-row[67],row[12],'ZYX');v.articulate(row);
      }
    }
  }
  let wakeFrame,wakeActor,wakeRevision,sections;
  const wakesByKind=[{kind:'whale',start:81,pose:17},{kind:'shark',start:141,pose:9}];
  const noImpact=[-100,0,0,0,0];
  function surfaceWakes(water,now){
    if(!current){
      if(sections){water.clear();sections=undefined;wakeFrame=undefined;}
      return;
    }
    if(wakeFrame!==current||wakeActor!==localActor||wakeRevision!==room.revision){
      const next=wakesByKind.map(({kind,start,pose})=>{
        const distance=row=>localVessel?Math.hypot(row[pose]-localVessel.x,row[pose+1]-localVessel.y):0;
        let best,frame;
        for(const animal of room.animals.values()){
          if(animal.kind!==kind)continue;
          const row=animal.frame??(animal.id===kind?current:undefined);
          if(!row)continue;
          if(!frame||distance(row)<distance(frame)||animal.id===localActor){best=animal;frame=row;}
          if(animal.id===localActor)break;
        }
        if(!frame)return null;
        return {id:best.id,stamp:frame[0],sources:frame.slice(start,start+60),impact:kind==='whale'?frame.slice(60,65):noImpact};
      });
      if(sections?.some((section,i)=>section&&!next[i]))water.clear();
      sections=next;
      wakeFrame=current;wakeActor=localActor;wakeRevision=room.revision;
    }
    const blend=Math.max(0,Math.min(1,(now-arrival)/interval));
    sections.forEach((section,i)=>{
      if(section?.sources.length!==60)return;
      const entry=visuals.get(section.id),track=entry?.track,right=track?.rightFrame;
      if(!right){water.sample(i,section.stamp,section.sources,section.impact,section.id,blend);return;}
      if(entry.waterFrame!==right){
        const start=wakesByKind[i].start;
        entry.waterFrame=right;entry.waterSources=right.slice(start,start+60);
        entry.waterImpact=i===0?right.slice(60,65):noImpact;
      }
      if(entry.waterSources.length===60)
        water.sample(i,right[0],entry.waterSources,entry.waterImpact,section.id,track.fraction);
    });
  }
  const disturbances=new Float64Array(4*38);
  function wakes(rows){
    if(!sections?.some(Boolean))return rows;
    disturbances.set(rows);
    let slot=0;
    for(let animal=0;animal<sections.length;animal++){
      const section=sections[animal];
      if(section?.sources.length!==60)continue;
      const {sources:samples,stamp,id}=section;
      if(!samples.some((v,k)=>k%5===2&&v>.0003))continue;
      while(slot<rows.length&&rows[slot]>0)slot+=38;
      if(slot>=rows.length)break;
      const suffix=Number(id.split('-')[1])||0;
      disturbances[slot]=2147483647-2*suffix-animal;
      disturbances[slot+1]=stamp;
      for(let i=0;i<12;i++){
        const j=5*i,k=slot+2+3*i;
        disturbances[k]=samples[j];disturbances[k+1]=samples[j+1];
        disturbances[k+2]=samples[j+2];
      }
      slot+=38;
    }
    return disturbances;
  }
  const animals=new Float64Array(90);
  const animalJoints=new Float64Array(40);
  function contacts(){return writeAnimalContacts(room.animals,current,animals,animalJoints);}
  function cameraSubject(view){
    const index=gullIndex(view);
    if(index>=0){
      const gull=feeding.gull(index);
      return gull?.visible?gull:null;
    }
    const animal=visuals.get(view)?.visual;
    return animal?.group.visible ? animal.group : null;
  }
  function nearestHumpback(listener,range){
    let nearest,best=range*range;
    for(const [id,entry] of visuals){
      const swimmer=entry.visual?.group;
      if(!swimmer?.visible||room.animals.get(id)?.kind!=='whale')continue;
      const p=swimmer.position,distance=p.distanceToSquared(listener);
      if(distance<best&&p.z<sampleSurface(p.x,p.y)){nearest=p;best=distance;}
    }
    return nearest;
  }
  return {nearbyActors:()=>perceived,fishSchools:feeding.fishSchools,update,advanceHost,wakes,nearestHumpback,showBreakwater,fish(){return feeding.fish(lastTime??current?.[0]??0);},ping(a){return current?feeding.ping(a,a.frame??current,current[0]):null;},surfaceWakes,contacts,animalJoints,cameraSubject,watch(id){localActor=id;},frame(id){
    const index=gullIndex(id);
    return index>=0?room.habitat.gulls[index]:room.animals.get(id)?.frame??(individualSwimmer(room.animals.get(id)?.kind)?null:current);
  }};
}
