// Snapshot transport only. Each boat owns its local Rumoca FMU.
import {joinRoom} from './vendor/trystero.mjs';
import {sailboatMesh} from './board/boat.mjs';
const relays=['wss://relay.damus.io','wss://nos.lol','wss://relay-rpi.edufeed.org','wss://nostr.tegila.com.br'];
const channels=4;
export function fleet(T,scene,roomName,status){
  let room,action,lastSend=-Infinity,participants=new Set();
  const peers=new Map();
  function report(){status.textContent=room?(participants.size+1)+' online':'Offline';}
  function remove(id){
    const peer=peers.get(id);
    if(peer){scene.remove(peer.mesh.group);
      const geometries=new Set(),materials=new Set(),textures=new Set();
      peer.mesh.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
      for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}
      for(const item of [...textures,...geometries])item.dispose();
      peers.delete(id);}
  }
  function leave(){const old=room;room=null;action=null;old?.leave();for(const id of peers.keys())remove(id);participants.clear();report();}
  function join(){
    if(room)return;
    room=joinRoom({appId:'pelagic-sailing-v1',relayConfig:{urls:relays}},roomName);
    const active=room;
    action=room.makeAction('sail-pose');
    room.onPeerJoin=id=>{if(room===active){participants.add(id);report();}};
    room.onPeerLeave=id=>{if(room===active){participants.delete(id);remove(id);report();}};
    action.onMessage=(packet,{peerId})=>{
      if(room!==active||!(packet instanceof Uint8Array)||packet.byteLength!==4*216)return;
      const data=new Float32Array(packet.slice().buffer);
      if(!data.every(v=>Number.isFinite(v)&&Math.abs(v)<1e8)||![0,1].includes(data[207]))return;
      let peer=peers.get(peerId);
      if(peer&&peer.cat!==!!data[207]){remove(peerId);peer=null;}
      if(!peer){
        if(peers.size>=channels)return;
        const mesh=sailboatMesh(T,!!data[207]);mesh.group.traverse(o=>o.layers.set(1));scene.add(mesh.group);
        peer={mesh,cat:!!data[207],armed:false};peers.set(peerId,peer);
      }
      peer.prev=peer.data||data;peer.prevTime=peer.time??performance.now();peer.time=performance.now();peer.data=data;
    };report();
  }
  function frame(now,s,cat,extra){
    if(!room)return;
    if(now-lastSend>=100 && participants.size){
      lastSend=now;const packet=new Float32Array(216);packet.set(s.slice(0,207));packet[207]=Number(cat);packet.set(extra,208);
      action.send(new Uint8Array(packet.buffer)).catch(()=>{});
    }
    for(const peer of peers.values()){
      peer.mesh.group.visible=now-peer.time<2500;
      if(!peer.mesh.group.visible)continue;
      const d=peer.data,p=peer.prev,f=Math.min(1,Math.max(0,(now-peer.time)/Math.max(50,peer.time-peer.prevTime)));
      const state=d.slice(0,207);
      for(const i of [0,1,3,4,5])state[i]=p[i]+(d[i]-p[i])*f;
      state[2]=p[2]+Math.atan2(Math.sin(d[2]-p[2]),Math.cos(d[2]-p[2]))*f;
      peer.mesh.update(state,d.subarray(208,210),peer.cat?d.subarray(210,212):null,null);
    }
  }
  const traffic=new Float64Array(9*channels);
  function contacts(e,n){
    traffic.fill(0);let row=0;
    for(const peer of peers.values()){
      const d=peer.data;if(performance.now()-peer.time>650)continue;
      if(Math.hypot(e-d[0],n-d[1])>5.5)peer.armed=true;
      if(peer.armed)traffic.set([1,d[0],d[1],d[2],d[212],d[213],d[214],d[3],Number(peer.cat)],9*row++);
    }
    return traffic;
  }
  return {join,leave,frame,contacts,get visible(){return [...peers.values()].filter(peer=>peer.mesh.group.visible).length;}};
}
