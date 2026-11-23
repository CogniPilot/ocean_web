import {cabinCruiser} from './motorboat.mjs';
import {npcRoom} from './npc-room.mjs';
import {joinFleetRoom} from './fleet-room.mjs';
import {captainRoster} from './captains.mjs';
// Snapshot transport only. Each boat owns its local Rumoca FMU.
import {PeerTimeline} from './fleet-timeline.mjs';
import {FleetSeaClock} from './fleet-sea-clock.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';
import {sailboatMesh} from './board/boat.mjs';
const relays=['wss://relay.damus.io','wss://nos.lol','wss://relay-rpi.edufeed.org','wss://nostr.tegila.com.br'];
const channels=4;
const sailFloats=216;
const packetFloats=sailFloats+16; // two presence flags and two xyz/xyzw poses
// Sailboats keep the full rig snapshot format. A rigid vehicle needs only
// its kind, sender time, position and orientation.
function posePacket(kind,now,object){
  const packet=new Float32Array(9);
  packet[0]=kind==='drone'?2:1;
  packet[1]=now/1000;
  object.position.toArray(packet,2);object.quaternion.toArray(packet,5);
  return packet;
}
function drawGhost(T,scene,peer,kind,template,offset,p,d,f){
  if(!template||d[offset]!==1){if(peer[kind])peer[kind].visible=false;return;}
  if(!peer[kind]){
    const ghost=template.clone(true);
    const lights=[];
    ghost.traverse(o=>{
      o.layers.set(1);
      if(o.isSpotLight && kind==='sub' && o.name==='Survey lamp')peer.lamp=o;
      else if(o.isLight)lights.push(o);
    });
    if(kind==='sub' && peer.lamp){
      peer.lamp.target=ghost.getObjectByName('Survey lamp target');
      peer.lens=ghost.getObjectByName('Survey lamp lens');
    }
    if(kind==='drone')peer.rotors=Array.from({length:4},(_,i)=>ghost.getObjectByName('RDD2 rotor '+i));
    lights.forEach(o=>o.removeFromParent());
    scene.add(ghost);peer[kind]=ghost;
  }
  const ghost=peer[kind];ghost.visible=true;
  const old=p[offset]===1?p:d;
  ghost.position.fromArray(old,offset+1).lerp(peer.target.fromArray(d,offset+1),f);
  ghost.quaternion.fromArray(old,offset+4).normalize().slerp(peer.rotation.fromArray(d,offset+4).normalize(),f);
}
export function fleet(T,scene,roomName,status,weather,crew,laps,onImagingHit,chat){
  let remoteAirframe,loadingAirframe,remoteSub,loadingSub,retrySubAt=0;
  let selfId,room,action,poseSend,lastSend=-Infinity,participants=new Set();
  const npc=npcRoom();
  const peers=new Map(),lamps=[],cruisers=[],drones=[],lampStates=new Map();
  let starterChannel,engineChannel,encounterChannel,encounter,lastEncounterSend=-Infinity;
  function sendEncounter(now,snapshot){
    if(!room||!npc.host||!participants.size||now-lastEncounterSend<85)return;
    lastEncounterSend=now;
    encounterChannel.send(snapshot.map(row=>Array.from(row))).catch(()=>{});
  }
  function receiveEncounter(now){
    return encounter&&encounter.owner===npc.owner&&now-encounter.at<2000?encounter.rows:undefined;
  }
  const starters=new Map(),engineStates=new Map();
  let lampChannel,sentLamp,rotorChannel,imagingChannel,imagingSequence=0;
  const imagingSource=new T.Vector3();
  function imagingHit(range,position){
    if(room&&participants.size)imagingChannel.send([++imagingSequence,range,...position.toArray()]).catch(()=>{});
  }

  let trafficChanged=false,boatCount=0;
  let roster=new Map();
  let seaClock,clockChannel,lastClockSend=-Infinity,retainedOffset=0;
  let shownHost,chatChannel,lapChannel,penaltyChannel,ourPenalty=0,lastPenaltySend=-Infinity;
  const penalties=new Map();
  let weatherChannel,weatherRows,weatherChanged=false,lastWeatherSend=-Infinity;
  const weatherValid={
    wind:v=>Number.isFinite(v)&&v>=0&&v<=12.86,
    bearing:v=>Number.isFinite(v)&&Math.abs(v)<=Math.PI*2,
    sea:v=>['0','.45','1.1','1.5'].includes(v),
    sky:v=>['Day','Sunset','Moonlit','Cycle'].includes(v),
    storm:v=>typeof v==='boolean'
  };
  function changeWeather(key,value){
    if(!room||!npc.host||!weatherRows||!weatherValid[key](value)||weatherRows[key][2]===value)return;
    const revision=Math.max(0,weatherRows[key][0])+1;
    weatherRows[key]=[revision,selfId,value];
    weatherChanged=true;
  }
  const gustReports=new Map();
  const anchor=new Float64Array(5);
  let appliedReport,gustChannel,lastGustSend=-Infinity;
  const wakeRows=new Float64Array(4*38),wakeSlots=Array(4).fill(null);
  let wakeChannel,wakeSequence=0,lastWakeStamp=-Infinity;
  const wakeOptOut=new Set();
  let acceptsWakes=true,wakePreference;
  function setWakeReception(enabled){
    if(enabled===acceptsWakes)return;
    acceptsWakes=enabled;
    if(!enabled)for(const entry of wakeSlots)if(entry)clearWake(entry.id);
    if(room && participants.size)wakePreference.send(Number(enabled)).catch(()=>{});
  }
  function clearWake(id){
    const slot=wakeSlots.findIndex(entry=>entry?.id===id);
    if(slot<0)return;
    wakeSlots[slot]=null;wakeRows.fill(0,slot*38,(slot+1)*38);
  }
  function receiveWake(packet,id){
    if(!['boat','motorboat'].includes(peers.get(id)?.kind)||!(packet instanceof Uint8Array)||packet.byteLength!==37*4)return;
    const data=new Float32Array(packet.slice().buffer);
    if(!data.every(Number.isFinite)||data[0]<0)return;
    for(let i=1;i<data.length;i+=3){
      if(Math.abs(data[i])>1e7||Math.abs(data[i+1])>1e7||data[i+2]<0||data[i+2]>5)return;
    }
    let slot=wakeSlots.findIndex(entry=>entry?.id===id);
    if(slot<0){
      slot=wakeSlots.indexOf(null);if(slot<0)return;
      wakeSlots[slot]={id,stamp:-1,seen:0};
      wakeRows[slot*38]=++wakeSequence;
    }
    const entry=wakeSlots[slot];
    if(data[0]<=entry.stamp)return;
    wakeRows.set(data,slot*38+1);entry.stamp=data[0];entry.seen=performance.now();
  }
  function wakeSources(now,source,stamp){
    for(const entry of wakeSlots)if(entry&&now-entry.seen>1000)clearWake(entry.id);
    if(room&&participants.size>wakeOptOut.size&&source&&stamp!==lastWakeStamp){
      const packet=new Float32Array(37);
      packet[0]=now/1000;packet.set(source,1);
      const bytes=new Uint8Array(packet.buffer);
      if(!wakeOptOut.size)wakeChannel.send(bytes).catch(()=>{});
      else for(const id of participants)if(!wakeOptOut.has(id))wakeChannel.send(bytes,{target:id}).catch(()=>{});
      lastWakeStamp=stamp;
    }
    return wakeRows;
  }
  async function sendChat(message){
    const active=chatChannel;
    if(!active)return false;
    try{
      await active.send(message);
    }catch{return false;}
    return active===chatChannel;
  }
  function report(){
    roster=room?captainRoster([selfId,...participants]):new Map();
    if(!status)return;
    status.textContent=room?roomName+' · '+roster.get(selfId)+' · '+roster.size+' online'+(npc.host?' · Host':'')+(roster.size===1?' · Waiting for peers':''):'Offline';
    for(const id of ['wind','sky','storm','seaState']){
      const el=document.getElementById(id);
      el.disabled=Boolean(room&&!npc.host);
      el.title=el.disabled?'The room host controls the weather':'';
    }
    chat?.connected(room?roomName:null);
    crew.hidden=!room;
    if(!room)crew.open=false;
    const list=crew.querySelector('ul');
    list.replaceChildren();
    for(const [id,name] of roster){
      const entry=document.createElement('li');
      entry.textContent=name+(id===selfId?' (you)':'')+(id===npc.owner?' · Host':'');
      list.append(entry);
      if(peers.has(id))labelCaptain(id,peers.get(id));
    }
  }
  function labelCaptain(id,peer){
    const name=roster.get(id);
    if(!name||peer.label?.name===name)return;
    if(!peer.label){
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=48;
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      peer.label=new T.Sprite(new T.SpriteMaterial({map:texture,depthWrite:false}));
      peer.label.layers.set(1);peer.label.scale.set(2.4,.45,1);scene.add(peer.label);
    }
    peer.label.name=name;
    const texture=peer.label.material.map,ctx=texture.image.getContext('2d');
    ctx.fillStyle='#102b36';ctx.fillRect(0,0,256,48);ctx.fillStyle='white';
    ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(name,128,24,240);texture.needsUpdate=true;
  }
  async function loadPeerBoat(id,peer){
    peer.loadingHull=true;
    try{
      await loadVehicleShell(peer.cat?'hobie-hulls':'sloop-hull');
      if(peers.get(id)!==peer)return;
      peer.mesh=sailboatMesh(T,peer.cat);
      peer.mesh.group.traverse(o=>{o.layers.disable(0);o.layers.enable(1);});
      peer.mesh.group.visible=false;
      scene.add(peer.mesh.group);
    }catch(error){
      peer.retryHullAt=performance.now()+10000;
      console.warn('Remote sailboat mesh',error);
    }finally{
      peer.loadingHull=false;
    }
  }
  function remove(id){
    penalties.delete(id);starters.delete(id);engineStates.delete(id);
    clearWake(id);
    const peer=peers.get(id);
    if(peer){peer.mesh?.group.removeFromParent();peer.sub?.removeFromParent();peer.drone?.removeFromParent();peer.motorboat?.removeFromParent();
      if(peer.label){
        peer.label.removeFromParent();peer.label.material.map.dispose();peer.label.material.dispose();
      }
      peer.cruiser?.dispose();
      const geometries=new Set(),materials=new Set(),textures=new Set();
      peer.mesh?.group.traverse(o=>{if(o.userData.sharedVehicleAsset)return;if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
      for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}
      for(const item of [...textures,...geometries])item.dispose();
      if(peer.kind==='boat'||peer.kind==='motorboat'){boatCount--;trafficChanged=true;}
      peers.delete(id);}
  }
  function leave(){if(seaClock)retainedOffset=seaClock.offset;const old=room;npc.connect(null);laps?.connect(null);chatChannel=null;lapChannel=null;starterChannel=null;engineChannel=null;starters.clear();engineStates.clear();encounterChannel=null;encounter=undefined;lastEncounterSend=-Infinity;penaltyChannel=null;lastPenaltySend=-Infinity;ourPenalty=0;penalties.clear();lampStates.clear();lamps.length=0;sentLamp=undefined;room=null;action=null;poseSend=undefined;seaClock=null;clockChannel=null;lastClockSend=-Infinity;lastWakeStamp=-Infinity;wakeChannel=null;wakeOptOut.clear();weatherChannel=null;weatherRows=null;gustChannel=null;gustReports.clear();lastGustSend=-Infinity;old?.leave();for(const id of peers.keys())remove(id);participants.clear();report();}
  function join(transport,name=roomName){
    if(room)return;
    if(name!==roomName)retainedOffset=0;
    roomName=name;
    selfId=transport.selfId;
    room=joinFleetRoom(transport,{appId:'pelagic-sailing-v1',relayConfig:{urls:relays}},roomName);
    const active=room;
    npc.connect(room.makeAction('harbor-npcs'),selfId);
    encounterChannel=room.makeAction('shark-scene');
    encounterChannel.onMessage=(rows,{peerId})=>{
      if(room!==active||npc.host||peerId!==npc.owner||!participants.has(peerId))return;
      const sizes=[10,8,6,30,18,48,3,10];
      if(!Array.isArray(rows)||(rows.length!==7&&rows.length!==8)||!rows.every((row,i)=>
        Array.isArray(row)&&row.length===sizes[i]&&row.every(Number.isFinite)))return;
      encounter={owner:peerId,at:performance.now(),rows};
    };
    engineChannel=room.makeAction('engine-run');
    engineChannel.onMessage=(running,{peerId})=>{
      if(room===active&&participants.has(peerId)&&typeof running==='boolean')engineStates.set(peerId,running);
    };
    starterChannel=room.makeAction('engine-start');
    starterChannel.onMessage=(remaining,{peerId})=>{
      if(room===active&&participants.has(peerId)&&Number.isFinite(remaining)&&remaining>=0&&remaining<=1)
        starters.set(peerId,{remaining,received:performance.now()});
    };
    penaltyChannel=room.makeAction('race-flag');
    penaltyChannel.onMessage=(turns,{peerId})=>{
      if(room!==active||!participants.has(peerId)||!Number.isInteger(turns)||turns<0||turns>100)return;
      if(turns)penalties.set(peerId,turns);
      else penalties.delete(peerId);
    };
    chatChannel=room.makeAction('room-chat');
    chatChannel.onMessage=(message,{peerId})=>{
      if(room===active&&participants.has(peerId)&&typeof message==='string'&&message.length<=400&&message.trim())
        chat?.receive(roster.get(peerId)??'Player',message.trim());
    };
    lapChannel=room.makeAction('best-laps');
    laps?.connect(lapChannel,roomName);
    seaClock=new FleetSeaClock(selfId);
    seaClock.offset=retainedOffset;
    clockChannel=room.makeAction('sea-clock');
    clockChannel.onMessage=(sample,{peerId})=>{
      if(room===active)seaClock.observe(peerId,sample,performance.now());
    };
    if(weather){
      weatherRows={};
      for(const [key,value] of Object.entries(weather.read())){
        weatherRows[key]=[-seaClock.joined,selfId,value];
      }
      weatherChannel=room.makeAction('weather');
      weatherChannel.onMessage=(sample,{peerId})=>{
        if(room!==active||peerId!==npc.owner||npc.host||!sample||typeof sample!=='object')return;
        // Older hosts advertised storm as a time-of-day preset.
        if(Array.isArray(sample.timeOfDay))sample={...sample,sky:sample.timeOfDay};
        else if(!sample.storm&&Array.isArray(sample.sky)&&sample.sky.length===3){
          const [rev,host,sky]=sample.sky;
          sample={...sample,sky:[rev,host,sky==='Storm'?'Day':sky],storm:[rev,host,sky==='Storm']};
        }
        const changes={};
        for(const [key,valid] of Object.entries(weatherValid)){
          const row=sample[key],prior=weatherRows[key];
          if(!Array.isArray(row)||row.length!==3)continue;
          const [revision,id,value]=row;
          if(!Number.isSafeInteger(revision)||typeof id!=='string'||id.length>128||!valid(value))continue;
          if(prior[1]===peerId&&revision<prior[0])continue;
          weatherRows[key]=row;
          if(value!==prior[2])changes[key]=value;
        }
        if(Object.keys(changes).length)weather?.apply(changes);
      };
    }
    gustChannel=room.makeAction('wind-travel');
    gustChannel.onMessage=(report,{peerId})=>{
      if(room===active && Array.isArray(report) && report.length===3 && report.every(Number.isFinite))
        gustReports.set(peerId,report);
    };
    wakePreference=room.makeAction('wake-pref');
    wakePreference.onMessage=(value,{peerId})=>{
      if(room!==active||!participants.has(peerId))return;
      if(value===0)wakeOptOut.add(peerId);
      else if(value===1)wakeOptOut.delete(peerId);
    };
    wakeChannel=room.makeAction('hull-wake');
    wakeChannel.onMessage=(packet,{peerId})=>{if(room===active&&acceptsWakes)receiveWake(packet,peerId);};
    imagingChannel=room.makeAction('imaging-hit');
    imagingChannel.onMessage=(sample,{peerId})=>{
      const peer=peers.get(peerId),now=performance.now();
      if(room!==active||peer?.kind!=='motorboat'||!Array.isArray(sample)||!(sample.length===2||sample.length===5))return;
      const [sequence,range]=sample;
      if(!Number.isSafeInteger(sequence)||sequence<=(peer.lastHitSequence??0)||!Number.isFinite(range)||range<0||range>36)return;
      if(sample.length===5){
        if(!sample.slice(2).every(x=>Number.isFinite(x)&&Math.abs(x)<1e7))return;
        imagingSource.fromArray(sample,2);
      }else if(peer.motorboat?.visible)imagingSource.copy(peer.motorboat.position);
      else return;
      peer.lastHitSequence=sequence;
      if(now-(peer.lastHitAt??-Infinity)<650)return;
      peer.lastHitAt=now;onImagingHit?.(imagingSource);
    };
    lampChannel=room.makeAction('sub-lamp');
    lampChannel.onMessage=(on,{peerId})=>{
      if(room===active && participants.has(peerId) && typeof on==='boolean')lampStates.set(peerId,on);
    };
    rotorChannel=room.makeAction('rdd2-rotors');
    rotorChannel.onMessage=(sample,{peerId})=>{
      const peer=peers.get(peerId);
      if(room!==active || peer?.kind!=='drone' || !Array.isArray(sample) ||
        sample.length!==5 || !sample.every(Number.isFinite) || sample[0]<=0)return;
      const previous=peer.rotorTimeline.latest;
      if(!peer.rotorTimeline.receive(sample,performance.now()))return;
      const dt=sample[0]-(previous?.data[0]??sample[0]);
      peer.rotorAudio=dt>.02&&dt<.7?{group:peer.drone,
        rotorSpeeds:sample.slice(1).map((angle,i)=>Math.min(1400,Math.abs(angle-previous.data[i+1])/dt))}:null;
    };
    action=room.makeAction('sail-pose');
    room.onPeerJoin=id=>{
      if(room!==active)return;
      participants.add(id);npc.join(id);
      laps?.send(id);
      sentLamp=undefined;
      wakePreference.send(Number(acceptsWakes),{target:id}).catch(()=>{});
      lastWeatherSend=-Infinity;
      report();
    };
    room.onPeerLeave=id=>{if(room===active){participants.delete(id);npc.leave(id);lampStates.delete(id);wakeOptOut.delete(id);seaClock.peers.delete(id);gustReports.delete(id);remove(id);report();}};
    action.onMessage=(packet,{peerId})=>{
      if(room!==active||!(packet instanceof Uint8Array)||
        (packet.byteLength!==4*packetFloats&&packet.byteLength!==36&&packet.byteLength!==60))return;
      const values=new Float32Array(packet.slice().buffer);
      if(!values.every(v=>Number.isFinite(v)&&Math.abs(v)<1e8))return;
      let kind='boat',data=values;
      if(values.length===9||values.length===15){
        if((values.length===15?values[0]!==3:values[0]!==1&&values[0]!==2)||values[1]<=0)return;
        kind=values[0]===3?'motorboat':values[0]===1?'sub':'drone';
        data=new Float32Array(packetFloats);
        const offset=kind==='drone'?224:216;
        data[offset]=1;data.set(values.subarray(2,9),offset+1);if(kind==='motorboat')data.set(values.subarray(9),208);data[215]=values[1];
      }else if(data[207]!==0&&data[207]!==1)return;
      let peer=peers.get(peerId);
      if(peer&&data[215]>0&&data[215]*1000<=peer.timeline.latest.sent)return;
      if(peer&&(peer.kind!==kind||peer.cat!==!!data[207])){remove(peerId);peer=null;}
      if(!peer){
        if(peers.size>=channels)return;
        peer={id:peerId,state:kind==='boat'?new Float32Array(207):null,kind,timeline:new PeerTimeline(),cat:!!data[207],
          retryHullAt:0,target:new T.Vector3(),rotation:new T.Quaternion()};
        if(kind==='boat'||kind==='motorboat'){
          const used=new Set([...peers.values()].map(p=>p.contactSlot));
          for(let i=0;i<channels;i++)if(!used.has(i)){peer.contactSlot=i;break;}
          boatCount++;
        }
        if(kind==='drone')peer.rotorTimeline=new PeerTimeline(0);
        peers.set(peerId,peer);labelCaptain(peerId,peer);
      }
      if(kind==='boat'&&!peer.mesh&&!peer.loadingHull&&performance.now()>=peer.retryHullAt)loadPeerBoat(peerId,peer);
      if(peer.timeline.receive(data,performance.now())&&(kind==='boat'||kind==='motorboat'))trafficChanged=true;
    };report();
  }
  function frame(now,s,cat,extra,sub,drone,kind,lampOn,aircraft,motor,motorState,radarTime){
    lamps.length=cruisers.length=drones.length=0;
    if(!room)return;
    npc.tick(now);
    if(participants.size&&now-lastPenaltySend>=1500){
      lastPenaltySend=now;
      penaltyChannel.send(ourPenalty).catch(()=>{});
    }
    if(shownHost!==npc.owner){
      shownHost=npc.owner;report();
      if(weatherRows&&npc.host){
        for(const row of Object.values(weatherRows))row[1]=selfId;
        lastWeatherSend=-Infinity;
      }
    }
    if(npc.host && weatherChannel && participants.size && now-lastWeatherSend>=(weatherChanged?125:3000)){
      lastWeatherSend=now;weatherChanged=false;
      // A combined sky preset lets earlier clients display rain. Their revision
      // must advance when either of the two independent settings changes.
      const {sky,storm}=weatherRows;
      const version=sky[0]<0&&storm[0]<0?Math.max(sky[0],storm[0]):Math.max(0,sky[0])+Math.max(0,storm[0]);
      const legacySky=[version,selfId,storm[2]?'Storm':sky[2]];
      weatherChannel.send({...weatherRows,timeOfDay:sky,sky:legacySky}).catch(()=>{});
    }
    if(kind==='sub' && participants.size && lampOn!==sentLamp){
      sentLamp=lampOn;
      lampChannel.send(lampOn).catch(()=>{if(room && sentLamp===lampOn)sentLamp=undefined;});
    }
    if(!poseSend&&now-lastSend>=100 && participants.size){
      lastSend=now;
      let packet;
      if(kind==='boat'){
        packet=new Float32Array(packetFloats);packet.set(s.subarray?s.subarray(0,207):s.slice(0,207));
        packet[207]=Number(cat);packet.set(extra,208);packet[215]=now/1000;
      }else{
        if(kind==='motorboat'&&motor){
          packet=new Float32Array(15);packet.set(posePacket(kind,now,motor));packet[0]=3;packet.set(motorState.slice(0,6),9);
          starterChannel.send(motorState[6]).catch(()=>{});
          if(typeof motorState[7]==='boolean')engineChannel.send(motorState[7]).catch(()=>{});
        }
        const vehicle=kind==='drone'?drone:kind==='sub'?sub:null;
        if(vehicle)packet=posePacket(kind,now,vehicle);
      }
      if(kind==='drone' && aircraft)rotorChannel.send([now/1000,...aircraft.rotorAngles]).catch(()=>{});
      if(packet){
        const send=action.send(new Uint8Array(packet.buffer)).catch(()=>{});
        poseSend=send;
        void send.then(()=>{if(poseSend===send)poseSend=undefined;});
      }
    }
    for(const peer of peers.values()){
      const fresh=peer.timeline.age(now)<2500;
      if(peer.mesh)peer.mesh.group.visible=fresh;
      if(peer.label)peer.label.visible=fresh;
      if(!fresh){if(peer.motorboat)peer.motorboat.visible=false;if(peer.sub)peer.sub.visible=false;if(peer.drone)peer.drone.visible=false;continue;}
      const {left:p,right:d,fraction:f}=peer.timeline.at(now);
      if(peer.kind==='motorboat'){
        if(!peer.cruiser){peer.cruiser=cabinCruiser(T);peer.motorboat=peer.cruiser.group;scene.add(peer.motorboat);}
        drawGhost(T,scene,peer,'motorboat',peer.motorboat,216,p,d,f);
        peer.cruiser.update(now/1000,d[208],d[209],d.subarray(210,214),radarTime);
        const starter=starters.get(peer.id);
        peer.cruiser.engineRunning=engineStates.get(peer.id);
        peer.cruiser.starterRemaining=starter?Math.max(0,starter.remaining-(now-starter.received)/1000):0;
        cruisers.push(peer.cruiser);
        if(peer.label){peer.label.position.copy(peer.motorboat.position);peer.label.position.z+=3;}
        continue;
      }
      if(d[216]===1 && !sub && !remoteSub && !loadingSub && now>=retrySubAt){
        loadingSub=Promise.resolve(loadVehicleShell('survey-pressure-housing'))
          .then(()=>{remoteSub=surveyVehicle(T,vehicleShell('survey-pressure-housing'));})
          .catch(error=>{retrySubAt=performance.now()+10000;console.warn('Remote submarine mesh',error);})
          .finally(()=>{loadingSub=null;});
      }
      drawGhost(T,scene,peer,'sub',sub??remoteSub,216,p,d,f);
      if(peer.lamp && peer.sub.visible){
        peer.lamp.visible=peer.lens.visible=lampStates.get(peer.id)??true;
        if(peer.lamp.visible)lamps.push(peer.lamp);
      }
      if(d[224]===1&&!drone&&!loadingAirframe){
        loadingAirframe=import('./drone.mjs').then(({remoteDroneMesh})=>remoteDroneMesh(T)).then(mesh=>{remoteAirframe=mesh;}).catch(error=>console.warn('Remote drone mesh',error));
      }
      drawGhost(T,scene,peer,'drone',drone??remoteAirframe,224,p,d,f);
      if(peer.rotors && peer.rotorTimeline?.latest){
        const {left,right,fraction}=peer.rotorTimeline.at(now);
        for(let i=0;i<4;i++)peer.rotors[i].rotation.z=left[i+1]+fraction*(right[i+1]-left[i+1]);
        if(peer.drone.visible&&peer.rotorAudio&&peer.rotorTimeline.age(now)<650){
          peer.rotorAudio.group=peer.drone;drones.push(peer.rotorAudio);
        }
      }
      if(peer.label && !peer.mesh){
        const vessel=peer[peer.kind];
        peer.label.visible=!!vessel?.visible;
        if(vessel){peer.label.position.copy(vessel.position);peer.label.position.z+=.8;}
      }
      if(!peer.mesh)continue;
      if(peer.rigFrame!==d){
        peer.mesh.update(d,d.subarray(208,210),peer.cat?d.subarray(210,212):null,null);
        peer.rigFrame=d;
      }
      const state=peer.state;
      for(const i of [0,1,3,4,5])state[i]=p[i]+(d[i]-p[i])*f;
      state[2]=p[2]+Math.atan2(Math.sin(d[2]-p[2]),Math.cos(d[2]-p[2]))*f;
      peer.mesh.setPose(state);
      if(peer.label){peer.label.position.copy(peer.mesh.group.position);peer.label.position.z+=2.4;}
    }
  }
  const traffic=new Float64Array(9*channels),contactTilts=new Float64Array(2*channels);
  const contactPeers=Array(channels).fill(null);
  function contacts(e,n,heading){
    trafficChanged=false;traffic.fill(0);contactTilts.fill(0);contactPeers.fill(null);
    const now=performance.now();
    for(const peer of peers.values()){
      const slot=peer.contactSlot;
      if(slot===undefined||!peer.timeline.writeTraffic(now,e,n,traffic,9*slot,heading,peer.kind==='motorboat'))continue;
      const data=peer.timeline.latest.data;
      contactPeers[slot]={id:peer.id,sheet:data[6]};
      if(peer.kind==='motorboat'){
        hullEuler.setFromQuaternion(hullQuarter.fromArray(data,220),'ZYX');
        contactTilts.set([hullEuler.x,hullEuler.y],2*slot);
      }else contactTilts.set([data[4],data[5]],2*slot);
    }
    return traffic;
  }
  const deck=new Float64Array(14);
  function nearbyDeck(east,north,now){
    let nearest,limit=10;
    for(const peer of peers.values()){
      if(peer.kind!=='boat'||!peer.timeline.latest||peer.timeline.age(now)>650)continue;
      const {data}=peer.timeline.latest;
      const distance=Math.hypot(east-data[0],north-data[1]);
      if(distance<limit){nearest=data;limit=distance;}
    }
    deck.fill(0);
    if(nearest){
      const [e,n,yaw,z,roll,pitch]=nearest;
      deck.set([1,nearest[207],e,n,z,yaw,roll,-pitch,nearest[212],nearest[213],0,0,0,nearest[214]]);
    }
    return deck;
  }
  function seaTime(local,now){
    if(!room)return local+retainedOffset;
    const phase=seaClock.sample(local,now,npc.owner);
    if(participants.size && now-lastClockSend>=250){
      lastClockSend=now;
      clockChannel.send([seaClock.joined,phase]).catch(()=>{});
    }
    return phase;
  }
  function windAnchor(phase,now,east,north,localEast,localNorth){
    const report=room&&seaClock.leader!==selfId?gustReports.get(seaClock.leader):undefined;
    if(report && report!==appliedReport){
      anchor.set([phase-report[0],report[1],report[2],localEast,localNorth]);
      appliedReport=report;
    }else if(!report && appliedReport){
      // Preserve the committed position on handover. The FMU keeps integrating wind travel.
      anchor.set([0,east,north,localEast,localNorth]);
      appliedReport=undefined;
    }
    if(room && seaClock.leader===selfId && participants.size && now-lastGustSend>=250){
      gustChannel.send([phase,east,north]).catch(()=>{});
      lastGustSend=now;
    }
    return anchor;
  }
  const hullEuler=new T.Euler(0,0,0,'ZYX'),hullQuarter=new T.Quaternion();
  function players(){
    return [...participants].map(id=>{
      const peer=peers.get(id);
      const model=peer?.kind==='boat'?(peer.cat?'hobie':'sloop'):peer?.kind;
      return {id,name:roster.get(id)??'Player',model,penalty:penalties.get(id)??0};
    });
  }
  function vessels(now){
    const result=[];
    for(const [id,peer] of peers){
      if(!peer.timeline.latest||peer.timeline.age(now)>2500)continue;
      const d=peer.timeline.latest.data,k=peer.kind==='sub'||peer.kind==='motorboat'?217:peer.kind==='drone'?225:0;
      const hull=peer.kind==='motorboat'?3:peer.kind==='boat'?(peer.cat?1:2):0;
      let ve=k?0:d[212],vn=k?0:d[213],yaw=d[2],heel=d[4],pitch=d[5],yawRate=k?0:d[214];
      if(hull===3){
        hullEuler.setFromQuaternion(hullQuarter.fromArray(d,k+3),'ZYX');
        yaw=hullEuler.z;heel=hullEuler.x;pitch=hullEuler.y;
        const old=peer.timeline.samples.at(-2),dt=old?(peer.timeline.latest.sent-old.sent)*.001:0;
        if(dt>.005&&dt<1){
          ve=(d[k]-old.data[k])/dt;vn=(d[k+1]-old.data[k+1])/dt;
          hullEuler.setFromQuaternion(hullQuarter.fromArray(old.data,k+3),'ZYX');
          const angle=yaw-hullEuler.z;
          yawRate=Math.atan2(Math.sin(angle),Math.cos(angle))/dt;
        }
      }
      result.push({id,kind:peer.kind,player:true,x:d[k],y:d[k+1],z:d[k+(k?2:3)],hull,yaw,heel,pitch,yawRate,ve,vn});
    }
    return result;
  }
  function detachView(){
    status=weather=crew=laps=onImagingHit=chat=undefined;
  }
  function attachView(bindings){
    ({scene,status,weather,crew,laps,onImagingHit,chat}=bindings);
    for(const peer of peers.values()){
      for(const part of [peer.mesh?.group,peer.sub,peer.drone,peer.motorboat,peer.label]){
        if(part)scene.add(part);
      }
    }
    laps?.connect(lapChannel,roomName);
    if(weatherRows)weather?.apply(Object.fromEntries(Object.entries(weatherRows).map(([key,row])=>[key,row[2]])));
    report();
  }
  function resumeClock(phase){
    retainedOffset=phase;
    if(seaClock)seaClock.offset=phase;
    lastWakeStamp=-Infinity;
  }
  return {join,leave,frame,sendChat,sendEncounter,receiveEncounter,hostCruiser:()=>peers.get(npc.owner)?.cruiser,detachView,attachView,resumeClock,get connected(){return Boolean(room);},setPenalty(turns){
    if(ourPenalty!==turns){ourPenalty=turns;lastPenaltySend=-Infinity;}
  },lamps,cruisers,drones,imagingHit,contacts,nearbyDeck,npc,vessels,players,contactPeers,contactTilts,get captain(){return roster.get(selfId);},captainName:id=>roster.get(id),get hasPeers(){return participants.size>0;},needsTraffic(periodic){return trafficChanged || (periodic && boatCount>0);},seaTime,changeWeather,windAnchor,wakeSources,setWakeReception,get wantsWakeSource(){return !!room && participants.size>wakeOptOut.size;},get visible(){return [...peers.values()].filter(peer=>peer.mesh?.group.visible||peer.drone?.visible||peer.motorboat?.visible||peer.sub?.visible).length;}};
}
