import {captainRoster} from './captains.mjs';
// Snapshot transport only. Each boat owns its local Rumoca FMU.
import {PeerTimeline} from './fleet-timeline.mjs';
import {FleetSeaClock} from './fleet-sea-clock.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';
import {remoteDroneMesh} from './drone.mjs';
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
    ghost.traverse(o=>{o.layers.set(1);if(o.isLight)lights.push(o);});
    lights.forEach(o=>o.removeFromParent());
    scene.add(ghost);peer[kind]=ghost;
  }
  const ghost=peer[kind];ghost.visible=true;
  const old=p[offset]===1?p:d;
  ghost.position.fromArray(old,offset+1).lerp(peer.target.fromArray(d,offset+1),f);
  ghost.quaternion.fromArray(old,offset+4).normalize().slerp(peer.rotation.fromArray(d,offset+4).normalize(),f);
}
export function fleet(T,scene,roomName,status,weather,crew){
  let remoteAirframe,loadingAirframe,remoteSub,loadingSub,retrySubAt=0;
  let selfId,room,action,lastSend=-Infinity,participants=new Set();
  const peers=new Map();
  let roster=new Map();
  let seaClock,clockChannel,lastClockSend=-Infinity,retainedOffset=0;
  let weatherChannel,weatherRows,weatherChanged=false,lastWeatherSend=-Infinity;
  const weatherValid={
    wind:v=>Number.isInteger(v)&&v>=0&&v<=22,
    bearing:v=>Number.isFinite(v)&&Math.abs(v)<=Math.PI*2,
    sea:v=>['0','.45','1.1'].includes(v),
    sky:v=>['Day','Sunset','Moonlit','Storm','Cycle'].includes(v)
  };
  function changeWeather(key,value){
    if(!room||!weatherRows||!weatherValid[key](value)||weatherRows[key][2]===value)return;
    const revision=Math.max(0,weatherRows[key][0])+1;
    weatherRows[key]=[revision,selfId,value];
    weatherChanged=true;
  }
  const gustReports=new Map();
  const anchor=new Float64Array(5);
  let appliedReport,gustChannel,lastGustSend=-Infinity;
  const wakeRows=new Float64Array(4*38),wakeSlots=Array(4).fill(null);
  let wakeChannel,wakeSequence=0,lastWakeStamp=-Infinity;
  function clearWake(id){
    const slot=wakeSlots.findIndex(entry=>entry?.id===id);
    if(slot<0)return;
    wakeSlots[slot]=null;wakeRows.fill(0,slot*38,(slot+1)*38);
  }
  function receiveWake(packet,id){
    if(peers.get(id)?.kind!=='boat'||!(packet instanceof Uint8Array)||packet.byteLength!==37*4)return;
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
    if(room&&participants.size&&source&&stamp!==lastWakeStamp){
      const packet=new Float32Array(37);
      packet[0]=stamp;packet.set(source,1);
      wakeChannel.send(new Uint8Array(packet.buffer)).catch(()=>{});
      lastWakeStamp=stamp;
    }
    return wakeRows;
  }
  function report(){
    roster=room?captainRoster([selfId,...participants]):new Map();
    status.textContent=room?roster.get(selfId)+' · '+roster.size+' online':'Offline';
    crew.hidden=!room;
    if(!room)crew.open=false;
    const list=crew.querySelector('ul');
    list.replaceChildren();
    for(const [id,name] of roster){
      const entry=document.createElement('li');
      entry.textContent=id===selfId?name+' (you)':name;
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
  function remove(id){
    clearWake(id);
    const peer=peers.get(id);
    if(peer){peer.mesh?.group.removeFromParent();peer.sub?.removeFromParent();peer.drone?.removeFromParent();
      if(peer.label){
        peer.label.removeFromParent();peer.label.material.map.dispose();peer.label.material.dispose();
      }
      const geometries=new Set(),materials=new Set(),textures=new Set();
      peer.mesh?.group.traverse(o=>{if(o.userData.sharedVehicleAsset)return;if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
      for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}
      for(const item of [...textures,...geometries])item.dispose();
      peers.delete(id);}
  }
  function leave(){if(seaClock)retainedOffset=seaClock.offset;const old=room;room=null;action=null;seaClock=null;clockChannel=null;lastClockSend=-Infinity;lastWakeStamp=-Infinity;wakeChannel=null;weatherChannel=null;weatherRows=null;gustChannel=null;gustReports.clear();lastGustSend=-Infinity;old?.leave();for(const id of peers.keys())remove(id);participants.clear();report();}
  function join(transport){
    if(room)return;
    selfId=transport.selfId;
    room=transport.joinRoom({appId:'pelagic-sailing-v1',relayConfig:{urls:relays}},roomName);
    const active=room;
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
      weatherChannel.onMessage=sample=>{
        if(room!==active||!sample||typeof sample!=='object')return;
        const changes={};
        for(const [key,valid] of Object.entries(weatherValid)){
          const row=sample[key],prior=weatherRows[key];
          if(!Array.isArray(row)||row.length!==3)continue;
          const [revision,id,value]=row;
          if(!Number.isSafeInteger(revision)||typeof id!=='string'||id.length>128||!valid(value))continue;
          if(revision<prior[0]||(revision===prior[0]&&id<=prior[1]))continue;
          weatherRows[key]=row;
          if(value!==prior[2])changes[key]=value;
        }
        if(Object.keys(changes).length)weather.apply(changes);
      };
    }
    gustChannel=room.makeAction('wind-travel');
    gustChannel.onMessage=(report,{peerId})=>{
      if(room===active && Array.isArray(report) && report.length===3 && report.every(Number.isFinite))
        gustReports.set(peerId,report);
    };
    wakeChannel=room.makeAction('hull-wake');
    wakeChannel.onMessage=(packet,{peerId})=>{if(room===active)receiveWake(packet,peerId);};
    action=room.makeAction('sail-pose');
    room.onPeerJoin=id=>{if(room===active){participants.add(id);lastWeatherSend=-Infinity;report();}};
    room.onPeerLeave=id=>{if(room===active){participants.delete(id);seaClock.peers.delete(id);gustReports.delete(id);remove(id);report();}};
    action.onMessage=(packet,{peerId})=>{
      if(room!==active||!(packet instanceof Uint8Array)||
        (packet.byteLength!==4*packetFloats&&packet.byteLength!==36))return;
      const values=new Float32Array(packet.slice().buffer);
      if(!values.every(v=>Number.isFinite(v)&&Math.abs(v)<1e8))return;
      let kind='boat',data=values;
      if(values.length===9){
        if((values[0]!==1&&values[0]!==2)||values[1]<=0)return;
        kind=values[0]===1?'sub':'drone';
        data=new Float32Array(packetFloats);
        const offset=kind==='sub'?216:224;
        data[offset]=1;data.set(values.subarray(2),offset+1);data[215]=values[1];
      }else if(data[207]!==0&&data[207]!==1)return;
      let peer=peers.get(peerId);
      if(peer&&data[215]>0&&data[215]*1000<=peer.timeline.latest.sent)return;
      if(peer&&(peer.kind!==kind||peer.cat!==!!data[207])){remove(peerId);peer=null;}
      if(!peer){
        if(peers.size>=channels)return;
        let mesh,state;
        if(kind==='boat'){
          mesh=sailboatMesh(T,!!data[207]);mesh.group.traverse(o=>o.layers.set(1));scene.add(mesh.group);
          state=new Float32Array(207);
        }
        peer={mesh,state,kind,timeline:new PeerTimeline(),cat:!!data[207],armed:false,target:new T.Vector3(),rotation:new T.Quaternion()};peers.set(peerId,peer);labelCaptain(peerId,peer);
      }
      peer.timeline.receive(data,performance.now());
    };report();
  }
  function frame(now,s,cat,extra,sub,drone,kind){
    if(!room)return;
    if(weatherChannel && participants.size && now-lastWeatherSend>=(weatherChanged?125:3000)){
      lastWeatherSend=now;weatherChanged=false;
      weatherChannel.send(weatherRows).catch(()=>{});
    }
    if(now-lastSend>=100 && participants.size){
      lastSend=now;
      let packet;
      if(kind==='boat'){
        packet=new Float32Array(packetFloats);packet.set(s.subarray?s.subarray(0,207):s.slice(0,207));
        packet[207]=Number(cat);packet.set(extra,208);packet[215]=now/1000;
      }else{
        const vehicle=kind==='drone'?drone:sub;
        if(vehicle)packet=posePacket(kind,now,vehicle);
      }
      if(packet)action.send(new Uint8Array(packet.buffer)).catch(()=>{});
    }
    for(const peer of peers.values()){
      const fresh=peer.timeline.age(now)<2500;
      if(peer.mesh)peer.mesh.group.visible=fresh;
      if(peer.label)peer.label.visible=fresh;
      if(!fresh){if(peer.sub)peer.sub.visible=false;if(peer.drone)peer.drone.visible=false;continue;}
      const {left:p,right:d,fraction:f}=peer.timeline.at(now);
      if(d[216]===1 && !sub && !remoteSub && !loadingSub && now>=retrySubAt){
        loadingSub=Promise.resolve(loadVehicleShell('survey-pressure-housing'))
          .then(()=>{remoteSub=surveyVehicle(T,vehicleShell('survey-pressure-housing'));})
          .catch(error=>{retrySubAt=performance.now()+10000;console.warn('Remote submarine mesh',error);})
          .finally(()=>{loadingSub=null;});
      }
      drawGhost(T,scene,peer,'sub',sub??remoteSub,216,p,d,f);
      if(d[224]===1&&!drone&&!loadingAirframe){
        loadingAirframe=remoteDroneMesh(T).then(mesh=>{remoteAirframe=mesh;}).catch(error=>console.warn('Remote drone mesh',error));
      }
      drawGhost(T,scene,peer,'drone',drone??remoteAirframe,224,p,d,f);
      if(peer.label && !peer.mesh){
        const vessel=peer[peer.kind];
        peer.label.visible=!!vessel?.visible;
        if(vessel){peer.label.position.copy(vessel.position);peer.label.position.z+=.8;}
      }
      if(!peer.mesh)continue;
      const state=peer.state;state.set(d.subarray(0,207));
      for(const i of [0,1,3,4,5])state[i]=p[i]+(d[i]-p[i])*f;
      state[2]=p[2]+Math.atan2(Math.sin(d[2]-p[2]),Math.cos(d[2]-p[2]))*f;
      peer.mesh.update(state,d.subarray(208,210),peer.cat?d.subarray(210,212):null,null);
      if(peer.label){peer.label.position.copy(peer.mesh.group.position);peer.label.position.z+=2.4;}
    }
  }
  const traffic=new Float64Array(9*channels);
  function contacts(e,n){
    traffic.fill(0);let row=0;
    for(const peer of peers.values()){
      if(peer.kind!=='boat'||peer.timeline.age(performance.now())>650)continue;
      const d=peer.timeline.latest.data;
      if(Math.hypot(e-d[0],n-d[1])>5.5)peer.armed=true;
      if(peer.armed)traffic.set([1,d[0],d[1],d[2],d[212],d[213],d[214],d[3],Number(peer.cat)],9*row++);
    }
    return traffic;
  }
  function seaTime(local,now){
    if(!room)return local+retainedOffset;
    const phase=seaClock.sample(local,now);
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
  return {join,leave,frame,contacts,seaTime,changeWeather,windAnchor,wakeSources,get visible(){return [...peers.values()].filter(peer=>peer.mesh?.group.visible||peer.drone?.visible||peer.sub?.visible).length;}};
}
