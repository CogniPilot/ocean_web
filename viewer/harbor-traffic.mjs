import {writeAnimalContacts} from './npc-room.mjs';
import {whaleEffects} from './whale-effects.mjs';
import {feedingHarbor} from './feeding-harbor.mjs';
import {greatWhiteLength} from './wildlife-wake.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {loadVehicleShell} from './vehicle-assets.mjs';
import {observeBoat,sailboatMesh} from './board/boat.mjs';
import {remoteDroneMesh} from './drone.mjs';
import {GLTFLoader} from './vendor/gltf-loader.mjs';

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
  function joint(name,axis){
    const bone=model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name)),rest=bone.quaternion.clone();
    const local=(axis??new T.Vector3(0,-1,0)).applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert());
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
    const proximal=joint('Spine3'),distal=joint('Spine4'),fluke=joint('Tail');
    const port=joint('TopFlipper.L'),starboard=joint('TopFlipper.R');
    articulate=(state,k)=>{
      const flex=state[k+7]-state[k+5];
      proximal(.60*flex);distal(.40*flex);fluke(state[k+15]);
      port(state[k+16]);starboard(state[k+17]);
    };
  }else{
    const lateral=n=>joint(n,new T.Vector3(0,0,1));
    const trunk=lateral('Spine2'),peduncle=lateral('Spine3'),tail=lateral('Tail');
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

export function harborTraffic(T,scene,fleet,sampleSurface,playSound,caustics,tideUniform){
  const room=fleet.npc,effects=whaleEffects(T,scene,sampleSurface),feeding=feedingHarbor(T,scene,room,playSound);
  let whale,shark,boat,drone,rig,rotors,worker,pending,host,lastTime,acc=0;
  let previous,current,lastPacket,arrival=0,interval=100,lastRig;
  const shown=new Float64Array(203),extras=new Map();
  let localActor,localVessel;
  function add(mesh){mesh.visible=false;scene.add(mesh);}
  marineAnimal(T,'whale',10,caustics,tideUniform).then(v=>{whale=v;add(v.group);}).catch(console.error);
  marineAnimal(T,'shark',greatWhiteLength,caustics,tideUniform).then(v=>{shark=v;add(v.group);}).catch(console.error);
  // Take the neutral cloth vertices from the shipped Hobie FMU once.
  Promise.all([loadVehicleShell('hobie-hulls'),loadInstance('Hobie16',{})]).then(([,hull])=>{
    rig=observeBoat(hull);boat=sailboatMesh(T,true);boat.group.name='NPC Hobie 16';add(boat.group);
  }).catch(console.error);
  remoteDroneMesh(T).then(v=>{
    drone=v;drone.name='NPC camera drone';add(v);
    rotors=Array.from({length:4},(_,i)=>v.getObjectByName('RDD2 rotor '+i));
    rotors.forEach((r,i)=>{r.name='NPC rotor '+i;});
  }).catch(console.error);
  function resumed(frame){
    return frame?{initialState:frame.slice(0,17),initialSwimmer:frame.slice(24,42),initialImpact:frame.slice(60,65),
      ...(frame.length>=70?{initialFish:[...frame.slice(65,70),...(frame.length>=75?frame.slice(70,75):[0,0,0,0,0])]}:{}),
      ...(frame.length>=81?{initialGuidance:frame.slice(75,81)}:{})}:{};
  }
  function pilotInputs(a,frame){
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
      ...(isWhale?{whaleBank:roll}:{}),
      [isWhale?'whaleSlope':'sharkSlope']:[(sampleSurface(e+1,n)-sampleSurface(e-1,n))/2,(sampleSurface(e,n+1)-sampleSurface(e,n-1))/2],
      [isWhale?'localSurface':'sharkSurface']:sampleSurface(e,n)
    };
  }
  const started=new Set();
  function takeControl(){
    const owned=new Worker(new URL('./harbor-worker.mjs',import.meta.url),{type:'module'});
    worker=owned;
    function failed(message){
      if(worker!==owned)return;
      owned.terminate();worker=undefined;pending=undefined;console.error('Harbor simulation:',message);
    }
    owned.onerror=event=>failed(event.message);
    owned.onmessage=({data})=>{
      if(worker!==owned||!room.host||!pending)return;
      if(data.error){failed(data.error);return;}
      const {steps,wind,level}=pending;pending=undefined;
      let base;
      for(const {id,frame} of data.frames){
        frame[23]=sampleSurface(frame[17],frame[18]);
        if(id==='harbor')base=frame;
        else if(room.animals.has(id))room.animals.get(id).frame=frame;
      }
      if(base){
        feeding.step(base,room.latest?.frame,steps,wind,level);
        room.publish(base);
      }
    };
  }
  addEventListener('pagehide',()=>worker?.terminate(),{once:true});
  function pose(frame,now){
    previous=current??frame;current=frame;
    interval=Math.max(1,Math.min(250,now-arrival));arrival=now;
  }
  let lastEnvironment;
  function advanceHost(time,now){
    if(!lastEnvironment)return;
    const {wind,level,local,flow,localHull}=lastEnvironment;
    if(host!==room.host){
      worker?.terminate();worker=undefined;pending=undefined;started.clear();
      host=room.host;acc=0;lastTime=time;
      if(host)takeControl();
    }
    if(host&&worker){
      const frame=room.latest?.frame;
      acc+=Math.min(.35,Math.max(0,time-lastTime));
      if(!pending&&(acc>=.1||!frame)){
        const observations=new Float64Array(32*8),hulls=new Float64Array(32*5),craft=[local,...fleet.vessels(now)];
        if(localHull&&localHull.kind!==local.kind)craft.push(localHull);
        else if(localHull)Object.assign(local,localHull);
        if(frame)craft.push({id:'npc-boat',kind:'npcBoat',x:frame[1],y:frame[2],z:level+.18,
          ve:frame[4]*Math.cos(frame[3])-frame[14]*Math.sin(frame[3]),vn:frame[4]*Math.sin(frame[3])+frame[14]*Math.cos(frame[3]),hull:1,yaw:frame[3],heel:frame[16]});
        for(const [i,v] of craft.slice(0,32).entries()){
          let key=5381;for(const c of String(v.id))key=(Math.imul(33,key)^c.charCodeAt(0))>>>0;
          if(v.hull)hulls.set([v.hull,v.yaw,v.heel??0,v.pitch??0,v.yawRate??0],5*i);
          observations.set([key||1,({boat:1,motorboat:1,sub:2,drone:3,npcBoat:4})[v.kind]??0,v.x,v.y,v.z,v.ve,v.vn,Number(!!v.local)],8*i);
        }
        const steps=Math.min(2,Math.floor((acc+1e-9)/.1))*10;
        acc=Math.max(0,acc-steps*.01);
        const inputs={npcTraffic:writeAnimalContacts(room.animals,frame,animals),...pilotInputs(room.animals.get('whale'),frame),...pilotInputs(room.animals.get('shark'),frame)};
        const actors=[{id:'harbor',inputs}];
        if(!started.has('harbor'))actors[0].seed=resumed(room.latest?.frame);
        for(const [id] of extras){
          const animal=room.animals.get(id);
          if(!animal)continue;
          const actor={id,inputs:pilotInputs(animal,animal.frame)};
          if(!started.has(id)){
            const seed=resumed(animal.frame??frame);
            if(!animal.frame&&seed.initialState){
              const offset=Number(id.split('-')[1])||2;
              seed.initialState[9]+=5*offset;seed.initialState[10]-=6;
              seed.initialSwimmer[0]+=7*offset;seed.initialSwimmer[1]-=8;
            }
            actor.seed=seed;
          }
          actors.push(actor);
        }
        started.clear();for(const actor of actors)started.add(actor.id);
        pending={steps,wind:[...wind],level};
        worker.postMessage({actors,steps,environment:{craftHull:hulls,craft:observations,currentVelocity:flow,wind,waterLevel:level}});
      }
    }
    lastTime=time;
  }
  function update(time,now,wind,level,local,flow,localHull){
    localVessel=local;
    for(const [id,e] of extras)if(!room.animals.has(id)){
      e.effects?.dispose();e.visual?.group.removeFromParent();extras.delete(id);
    }
    for(const [id,a] of room.animals)if(id!==a.kind&&!extras.has(id)){
      const e={};extras.set(id,e);
      marineAnimal(T,a.kind,a.kind==='whale'?10:greatWhiteLength,caustics,tideUniform).then(v=>{
        if(extras.get(id)!==e)return;
        e.visual=v;v.group.name=id;add(v.group);if(a.kind==='whale')e.effects=whaleEffects(T,scene,sampleSurface);
      }).catch(console.error);
    }
    lastEnvironment={wind,level,local,flow,localHull};
    advanceHost(time,now);
    const packet=room.latest;
    if(packet&&packet!==lastPacket){pose(packet.frame,now);lastPacket=packet;}
    if(!current)return;
    const f=Math.min(1,(now-arrival)/interval);
    for(let i=0;i<shown.length;i++)shown[i]=(previous[i]??0)+f*((current[i]??0)-(previous[i]??0));
    shown.set(current.slice(60,65),60);
    const angle=current[20]-previous[20];
    shown[20]=previous[20]+f*Math.atan2(Math.sin(angle),Math.cos(angle));
    if(current[22]<previous[22])shown[22]=current[22]; // breath-cycle wrap
    feeding.draw(current,previous,f);
    for(const [id,a] of room.animals){
      const animal=id==='whale'?whale:id==='shark'?shark:extras.get(id)?.visual;
      animal?.mouth(a.gape??0);
    }
    const t=shown[0],tide=shown[23];

    if(whale){
      whale.group.visible=true;whale.group.position.fromArray(shown,17);
      whale.group.rotation.set(shown[35],-shown[21],shown[20],'ZYX');
      whale.articulate(shown,24);
      effects.update(shown,t,whale,wind);
    }
    if(shark){
      shark.group.visible=true;shark.group.position.fromArray(shown,9);
      shark.group.rotation.set(0,-shown[67],shown[12],'ZYX');shark.articulate(shown);
    }
    for(const [id,e] of extras){
      const a=room.animals.get(id),v=e.visual;
      if(!v||!a?.frame)continue;
      if(e.frame!==a.frame){e.previous=e.frame??a.frame;e.frame=a.frame;e.shown??=new Float64Array(203);}
      for(let k=0;k<e.shown.length;k++)e.shown[k]=(e.previous[k]??0)+f*((e.frame[k]??0)-(e.previous[k]??0));
      const row=e.shown;row.set(e.frame.slice(60,65),60);v.group.visible=true;
      if(a.kind==='whale'){
        v.group.position.fromArray(row,17);v.group.rotation.set(row[35],-row[21],row[20],'ZYX');v.articulate(row,24);e.effects.update(row,row[0],v,wind);
      }else{v.group.position.fromArray(row,9);v.group.rotation.set(0,-row[67],row[12],'ZYX');v.articulate(row);}
    }
    if(boat){
      const z=sampleSurface(shown[1],shown[2])+.18+.06*Math.sin(.85*t);
      if(lastRig!==current){
        lastRig=current;
        for(let sail=0;sail<2;sail++){
          const a=current[15]*(sail?.74:1),c=Math.cos(a),s=Math.sin(a);
          rig.splice(186+9*sail,9,c,-s,0,s,c,0,0,0,1);
        }
        boat.update(rig,[0,0],[0,.42]);
      }
      boat.group.visible=true;boat.group.position.set(shown[1],shown[2],z);
      boat.group.rotation.set(shown[16],.018*Math.sin(.85*t),shown[3],'ZYX');
    }
    if(drone){
      drone.visible=true;drone.position.fromArray(shown,5);drone.rotation.z=shown[8];
      rotors.forEach((r,i)=>{r.rotation.z=(i%2?-1:1)*70*t;});
    }
  }
  let wakeFrame,wakeActor,sections;
  const wakesByKind=[{kind:'whale',start:81,pose:17},{kind:'shark',start:141,pose:9}];
  const noImpact=[-100,0,0,0,0];
  function surfaceWakes(water,now){
    if(!current)return;
    if(wakeFrame!==current||wakeActor!==localActor){
      sections=wakesByKind.map(({kind,start,pose})=>{
        let best=room.animals.get(kind),frame=current;
        const watched=room.animals.get(localActor);
        if(watched?.kind===kind&&watched.frame){best=watched;frame=watched.frame;}
        else if(localVessel){
          const distance=r=>Math.hypot(r[pose]-localVessel.x,r[pose+1]-localVessel.y);
          for(const a of room.animals.values())if(a.kind===kind&&a.frame&&distance(a.frame)<distance(frame)){best=a;frame=a.frame;}
        }
        return {id:best?.id??kind,stamp:frame[0],sources:frame.slice(start,start+60),impact:kind==='whale'?frame.slice(60,65):noImpact};
      });
      wakeFrame=current;wakeActor=localActor;
    }
    const blend=Math.max(0,Math.min(1,(now-arrival)/interval));
    sections.forEach(({id,stamp,sources,impact},i)=>{
      if(sources.length===60)water.sample(i,stamp,sources,impact,id,blend);
    });
  }
  const disturbances=new Float64Array(4*38);
  function wakes(rows){
    if(!sections||sections.some(row=>row.sources.length!==60))return rows;
    disturbances.set(rows);
    let slot=0;
    for(let animal=0;animal<sections.length;animal++){
      const {sources:samples,stamp,id}=sections[animal];
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
  function contacts(){return writeAnimalContacts(room.animals,current,animals);}
  function cameraSubject(view){
    if(view==='gull'||view.startsWith('gull-')){
      const gull=feeding.gull(view==='gull'?0:Number(view.slice(5))-1);
      return gull?.visible?gull:null;
    }
    const animal=extras.get(view)?.visual??(view==='whale'?whale:view==='shark'?shark:null);
    return animal?.group.visible ? animal.group : null;
  }
  return {update,advanceHost,wakes,fish(){return current?feeding.fish(shown[0]):null;},ping(a){return current?feeding.ping(a,a.frame??current,current[0]):null;},surfaceWakes,contacts,cameraSubject,watch(id){localActor=id;},frame(id){return room.animals.get(id)?.frame??current;}};
}
