import {gullIndex,writeAnimalContacts} from './npc-room.mjs';
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

async function marineAnimal(T,name,length,caustics,tideUniform){
  const url=new URL('./assets/'+name+'.glb',import.meta.url);
  url.search=new URL(import.meta.url).search;
  const {scene:model}=await new GLTFLoader().loadAsync(url.href);
  model.traverse(m=>{
    if(m.isMesh&&m.material.name==='Slate dorsum and ivory belly')caustics.lightSkin(m.material,tideUniform);
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
    articulate=state=>{
      const flex=state[202]??0,bend=state[70]??0;
      trunk(flex);peduncle(bend-flex);tail((state[72]??0)-bend);
    };
  }
  group.name=name==='whale'?'NPC humpback':'NPC shark';
  const jaws=[];
  model.traverse(m=>{const index=m.morphTargetDictionary?.Feed;if(index!=null)jaws.push([m,index]);});
  function mouth(value){for(const [m,index] of jaws)m.morphTargetInfluences[index]=value;}
  return {group,articulate,mouth,edgePoints,socket:model.getObjectByName('HumpbackBlowholes')};
}

export function harborTraffic(T,scene,fleet,sampleSurface,playSound,caustics,tideUniform,gullEnvironment,signal){
  const room=fleet.npc,feeding=feedingHarbor(T,scene,room,playSound,gullEnvironment);
  const visuals=new Map(),started=new Set();
  let worker,pending,session,lastTime,lastEnvironment,acc=0;
  let current,lastPacket,lastGullTime,arrival=0,interval=100;
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
      entry.effects?.dispose();
      entry.visual?.group.removeFromParent();
      visuals.delete(id);
    }
    for(const [id,animal] of room.animals){
      if(visuals.has(id))continue;
      const entry={};
      visuals.set(id,entry);
      const whale=animal.kind==='whale';
      marineAnimal(T,animal.kind,whale?10:greatWhiteLength,caustics,tideUniform).then(visual=>{
        if(visuals.get(id)!==entry)return;
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

    let turn=0,pitch=0,effort=0,age=-1,roll=0;
    if(a.seat){
      const {axes,bank,breach}=room.command(a.id);
      roll=bank*1.4;
      turn=axes[0];pitch=axes[1]*.88;effort=(axes[2]+1)*.5;
      if(breach&&(a.breachAt==null||clock-a.breachAt>(isWhale?25:10)))a.breachAt=clock;
      if(a.breachAt!=null){age=clock-a.breachAt;if(age>(isWhale?25:10)){a.breachAt=undefined;age=-1;}}
    }else a.breachAt=undefined;
    const [e,n]=pose;
    return {
      [isWhale?'whalePilot':'sharkPilot']:[Number(Boolean(a.seat)),pitch,effort,age],
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
      const {steps,flow}=pending;
      pending=undefined;
      let base;
      for(const {id,frame} of data.frames){
        frame[23]=sampleSurface(frame[17],frame[18]);
        if(id==='harbor'){
          base=frame;
          for(const kind of ['whale','shark']){
            const a=room.animals.get(kind);
            if(a?.spawn)a.spawn=undefined;
          }
        }
        else if(room.animals.has(id))room.animals.get(id).frame=frame;
      }
      if(base){
        const time=Math.max((room.habitat.time??0)+steps*.01,base[0]);
        feeding.step(time,base,room.latest?.frame,steps,flow);
        room.publish(base);
      }
    };
  }
  (signal??window).addEventListener(signal?'abort':'pagehide',stopWorker,{once:true});

  function advanceHost(time,now){
    if(!lastEnvironment)return;
    if(session!==room.session){
      stopWorker();
      session=room.session;lastTime=time;acc=0;
      current=lastPacket=lastGullTime=undefined;
      for(const entry of visuals.values())entry.frame=undefined;
    }
    const elapsed=Math.min(.35,Math.max(0,time-(lastTime??time)));
    lastTime=time;
    const needsWorker=room.host&&room.animals.size>0;
    if(!needsWorker&&worker)stopWorker();
    if(!room.host||!room.hasWildlife){acc=0;return;}

    const {wind,level,local,flow,localHull}=lastEnvironment;
    acc+=elapsed;
    const frame=room.latest?.frame;
    if(pending||(acc<.1&&(!needsWorker||frame)))return;
    const steps=Math.min(2,Math.floor((acc+1e-9)/.1))*10;
    acc=Math.max(0,acc-steps*.01);

    if(!needsWorker){
      feeding.step((room.habitat.time??0)+steps*.01,undefined,undefined,steps,flow);
      room.publish();
      return;
    }
    if(!worker)takeControl();
    const observations=new Float64Array(32*8),hulls=new Float64Array(32*5),craft=[local,...fleet.vessels(now)];
    if(localHull&&localHull.kind!==local.kind)craft.push(localHull);
    else if(localHull)Object.assign(local,localHull);
    for(const [i,v] of craft.slice(0,32).entries()){
      let key=5381;for(const c of String(v.id))key=(Math.imul(33,key)^c.charCodeAt(0))>>>0;
      if(v.hull)hulls.set([v.hull,v.yaw,v.heel??0,v.pitch??0,v.yawRate??0],5*i);
      observations.set([key||1,({boat:1,motorboat:1,sub:2,drone:3})[v.kind]??0,v.x,v.y,v.z,v.ve,v.vn,Number(!!v.local)],8*i);
    }
    const inputs={...pilotInputs(room.animals.get('whale'),frame),...pilotInputs(room.animals.get('shark'),frame)};
    const actors=[{id:'harbor',inputs}];
    if(!started.has('harbor')){
      const seed=resumed(frame);
      for(const kind of ['whale','shark'])useSpawn(seed,room.animals.get(kind));
      actors[0].seed=seed;
    }
    for(const [id,animal] of room.animals){
      if(id===animal.kind)continue;
      const actor={id,inputs:pilotInputs(animal,animal.frame)};
      if(!started.has(id)){
        const seed=resumed(animal.frame??frame);
        if(!animal.frame)delete seed.initialSwimReserve;
        if(!animal.frame&&seed.initialState){
          const offset=Number(id.split('-')[1])||2;
          seed.initialState[9]+=5*offset;seed.initialState[10]-=6;
          seed.initialSwimmer[0]+=7*offset;seed.initialSwimmer[1]-=8;
        }
        useSpawn(seed,animal);
        actor.seed=seed;
      }
      actors.push(actor);
    }
    started.clear();for(const actor of actors)started.add(actor.id);
    pending={steps,flow};
    worker.postMessage({actors,steps,environment:{craftHull:hulls,craft:observations,currentVelocity:flow,wind,waterLevel:level}});
  }
  function update(time,now,wind,level,local,flow,localHull){
    localVessel=local;
    lastEnvironment={wind,level,local,flow,localHull};
    advanceHost(time,now);
    syncVisuals();

    const packet=room.latest,gullTime=room.habitat.time;
    if(packet!==lastPacket||gullTime!==lastGullTime){
      current=packet?.frame;lastPacket=packet;lastGullTime=gullTime;
      interval=Math.max(1,Math.min(250,now-arrival));arrival=now;
    }
    const f=Math.min(1,(now-arrival)/interval);
    feeding.draw(room.habitat.time??current?.[0]??0,f);
    for(const [id,entry] of visuals){
      const animal=room.animals.get(id),v=entry.visual;
      if(!v)continue;
      const frame=animal.frame??(id===animal.kind?current:undefined);
      if(!frame){v.group.visible=false;continue;}
      if(entry.frame!==frame){
        entry.previous=entry.frame??frame;entry.frame=frame;
        entry.shown??=new Float64Array(319);
      }
      const row=entry.shown,previous=entry.previous;
      for(let k=0;k<row.length;k++)row[k]=(previous[k]??0)+f*((frame[k]??0)-(previous[k]??0));
      v.group.visible=true;v.group.userData.contactPose=row;v.mouth(animal.gape??0);
      if(animal.kind==='whale'){
        row.set(frame.slice(60,65),60);
        const angle=frame[20]-previous[20];
        row[20]=previous[20]+f*Math.atan2(Math.sin(angle),Math.cos(angle));
        if(frame[22]<previous[22])row[22]=frame[22];
        v.group.position.fromArray(row,17);v.group.rotation.set(row[35],-row[21],row[20],'ZYX');v.articulate(row,24);
        entry.effects.update(row,row[0],v,wind);
      }else{
        row[70]=interpolateSharkTail(previous,frame,f);
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
      if(section?.sources.length===60)water.sample(i,section.stamp,section.sources,section.impact,section.id,blend);
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
  return {update,advanceHost,wakes,nearestHumpback,showBreakwater,fish(){return feeding.fish(current?.[0]??lastTime??0);},ping(a){return current?feeding.ping(a,a.frame??current,current[0]):null;},surfaceWakes,contacts,animalJoints,cameraSubject,watch(id){localActor=id;},frame(id){
    const index=gullIndex(id);
    return index>=0?room.habitat.gulls[index]:room.animals.get(id)?.frame??current;
  }};
}
