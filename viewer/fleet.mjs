// Snapshot transport only. Each boat owns its local Rumoca FMU.
import {PeerTimeline} from './fleet-timeline.mjs';
import {joinRoom} from './vendor/trystero.mjs';
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
export function fleet(T,scene,roomName,status){
  let room,action,lastSend=-Infinity,participants=new Set();
  const peers=new Map();
  function report(){status.textContent=room?(participants.size+1)+' online':'Offline';}
  function remove(id){
    const peer=peers.get(id);
    if(peer){peer.mesh?.group.removeFromParent();peer.sub?.removeFromParent();peer.drone?.removeFromParent();
      const geometries=new Set(),materials=new Set(),textures=new Set();
      peer.mesh?.group.traverse(o=>{if(o.userData.sharedVehicleAsset)return;if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
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
        peer={mesh,state,kind,timeline:new PeerTimeline(),cat:!!data[207],armed:false,target:new T.Vector3(),rotation:new T.Quaternion()};peers.set(peerId,peer);
      }
      peer.timeline.receive(data,performance.now());
    };report();
  }
  function frame(now,s,cat,extra,sub,drone,kind){
    if(!room)return;
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
      if(!fresh){if(peer.sub)peer.sub.visible=false;if(peer.drone)peer.drone.visible=false;continue;}
      const {left:p,right:d,fraction:f}=peer.timeline.at(now);
      drawGhost(T,scene,peer,'sub',sub,216,p,d,f);drawGhost(T,scene,peer,'drone',drone,224,p,d,f);
      if(!peer.mesh)continue;
      const state=peer.state;state.set(d.subarray(0,207));
      for(const i of [0,1,3,4,5])state[i]=p[i]+(d[i]-p[i])*f;
      state[2]=p[2]+Math.atan2(Math.sin(d[2]-p[2]),Math.cos(d[2]-p[2]))*f;
      peer.mesh.update(state,d.subarray(208,210),peer.cat?d.subarray(210,212):null,null);
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
  return {join,leave,frame,contacts,get visible(){return [...peers.values()].filter(peer=>peer.mesh?.group.visible||peer.drone?.visible||peer.sub?.visible).length;}};
}
