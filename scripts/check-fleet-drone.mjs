import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fleet} from '../viewer/fleet.mjs';

const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
globalThis.BroadcastChannel=undefined;
const noop=()=>{};
globalThis.document={createElement:()=>({getContext:()=>({fillRect:noop,fillText:noop})})};
const pending=[];
const networks=new Map();
function transport(selfId){
  const actions=new Map();
  const network={
    actions,
    makeAction(name){
      const action={async send(data,{target}={}){
        pending.push({from:selfId,target,name,data:structuredClone(data)});
      }};
      actions.set(name,action);
      return action;
    },
    getPeers:()=>Object.fromEntries([...networks.keys()].filter(id=>id!==selfId).map(id=>[id,{close:noop}])),
    reannounce:noop,leave:noop
  };
  networks.set(selfId,network);
  return {selfId,joinRoom:()=>network};
}
const sent=[];
async function deliver(){
  for(let i=0;pending.length;i++){
    assert(i<300,'Room handshakes must settle');
    const row=pending.shift();
    sent.push(row);
    for(const [id,network] of networks){
      if(id!==row.from&&(!row.target||id===row.target)){
        network.actions.get(row.name)?.onMessage?.(row.data,{peerId:row.from});
      }
    }
  }
  await Promise.resolve();
  await Promise.resolve();
}
const pilot=fleet(T,new T.Scene(),'drone-test');
const remoteScene=new T.Scene();
const observer=fleet(T,remoteScene,'drone-test');
const senderTransport=transport('pilot'),receiverTransport=transport('observer');
transport('legacy');
pilot.join(senderTransport);observer.join(receiverTransport);
try{
  networks.get('pilot').onPeerJoin('observer');
  networks.get('pilot').onPeerJoin('legacy');
  networks.get('observer').onPeerJoin('pilot');
  await deliver();

  const airframe=new T.Group();airframe.position.set(1,2,7);
  for(let i=0;i<4;i++){
    const rotor=new T.Group();rotor.name='RDD2 rotor '+i;airframe.add(rotor);
  }
  const aircraft={rotorAngles:[0,0,0,0],rotorSpeeds:[740,750,760,770]};
  const start=performance.now();
  pilot.frame(start,null,false,null,null,airframe,'drone',false,aircraft);
  await deliver();
  const combined=sent.find(row=>row.from==='pilot'&&row.target==='observer'&&row.name==='sail-pose');
  assert.equal(combined.data.length,52,'A current peer gets pose and speeds in the same packet');
  assert.equal(sent.find(row=>row.from==='pilot'&&row.target==='legacy'&&row.name==='sail-pose').data.length,36);
  assert(sent.some(row=>row.from==='pilot'&&row.target==='legacy'&&row.name==='rdd2-rotors'));
  assert(!sent.some(row=>row.from==='pilot'&&row.target==='observer'&&row.name==='rdd2-rotors'));
  const draw=now=>observer.frame(now,null,false,null,null,airframe,'sub');
  draw(start+30);draw(start+63);
  const ghost=remoteScene.children.find(object=>object.getObjectByName('RDD2 rotor 0'));
  assert(ghost?.visible);
  assert(ghost.getObjectByName('RDD2 rotor 0').rotation.z>0);
  assert.deepEqual(Array.from(observer.drones[0].rotorSpeeds),aircraft.rotorSpeeds);
  assert.deepEqual(Array.from(observer.rotorWakes([1,2,6],start+63).slice(8,12)),aircraft.rotorSpeeds);
  assert.equal(observer.droneContacts([1,2,7],start+63)[0],0,'Ignore coincident spawns');
  assert.equal(observer.droneContacts([1,2,6],start+63)[0],1,'A distinct nearby player arms drone contacts');
  assert.deepEqual(Array.from(observer.droneContacts([1.21,2,7],start+63).slice(0,8)),[1,1,2,7,1,0,0,0]);
  draw(start+3600);
  assert(ghost.visible,'A delayed snapshot must not hide a connected peer');
  assert.equal(observer.drones.length,0);
  assert.equal(observer.rotorWakes([1,2,6],start+3600)[0],0,'A frozen visual must not emit stale downwash');

  assert.equal(observer.droneContacts([1,2,7],start+3600)[0],0,'Stale poses must not produce contact');

  const receiver=networks.get('observer');
  receiver.onPeerLeave('pilot');
  draw(performance.now()+100);
  assert(ghost.visible,'Keep the last pose during reconnect grace');
  assert.equal(observer.rotorWakes([1,2,6],performance.now())[0],0);
  receiver.onPeerJoin('pilot');
  await deliver();
  const fresh=new Float32Array([2,.001,4,2,7,0,0,0,1,0,0,0,0]);
  receiver.actions.get('sail-pose').onMessage(new Uint8Array(fresh.buffer),{peerId:'pilot'});
  draw(performance.now()+130);
  assert.equal(ghost.position.x,4,'Accept a new sender clock after reconnect');
  assert.equal(observer.droneContacts([4,2,6],performance.now()+130)[0],1,'A stopped drone remains collidable');
  const stopped=ghost.getObjectByName('RDD2 rotor 0').rotation.z;
  draw(performance.now()+160);
  assert.equal(ghost.getObjectByName('RDD2 rotor 0').rotation.z,stopped,'Zero RPM must stop the visual props');
  receiver.onPeerLeave('pilot');
  draw(performance.now()+5200);
  assert(!remoteScene.children.includes(ghost),'Remove a peer after a sustained disconnect');
  // The same remote-pose path clones both Piccard lamp mounts. Clone targets
  // must follow the receiving player's pose independently of the source model.
  receiver.onPeerJoin('pilot');
  await deliver();
  const vehicle=new T.Group();
  const lampNames=['Survey lamp','Starboard survey lamp'];
  for(const [i,name] of lampNames.entries()){
    const light=new T.SpotLight();light.name=name;light.position.set(.24,i?.109:-.109,.071);
    const lens=new T.Object3D();lens.name=name+' lens';
    light.target.name=name+' target';light.target.position.copy(light.position);light.target.position.x+=1;
    vehicle.add(light,lens,light.target);
  }
  const subPose=new Float32Array([1,.002,4,2,-7,0,0,0,1]);
  receiver.actions.get('sail-pose').onMessage(new Uint8Array(subPose.buffer),{peerId:'pilot'});
  const showSub=()=>observer.frame(performance.now(),null,false,null,vehicle,airframe,'drone');
  showSub();
  assert.equal(observer.lamps.length,2);
  const proxy=observer.submarines[0];
  for(const light of observer.lamps){
    assert.equal(light.parent,proxy);
    assert.equal(light.target,proxy.getObjectByName(light.name+' target'));
    assert.notEqual(light.target,vehicle.getObjectByName(light.name+' target'));
  }
  const rpm=[1234,-2000,0,5200,-123,586];
  const sendRPM=time=>pilot.frame(time,null,false,null,vehicle,null,'sub',true,
    null,null,null,0,0,rpm);
  sendRPM(start+6000);await deliver();showSub();
  assert.deepEqual(proxy.userData.thrusterRPM,rpm);
  const drive=sent.find(row=>row.name==='sub-drive');
  assert.equal(drive.data.byteLength,16);
  observer.frame(performance.now()+950,null,false,null,vehicle,airframe,'drone');
  assert.deepEqual(proxy.userData.thrusterRPM,rpm,'A delayed packet must not interrupt a running motor');
  observer.frame(performance.now()+2150,null,false,null,vehicle,airframe,'drone');
  assert.equal(proxy.userData.thrusterRPM,undefined);
  receiver.onPeerLeave('pilot');receiver.onPeerJoin('pilot');
  const rebootPose=new Float32Array(subPose);rebootPose[1]=.001;
  receiver.actions.get('sail-pose').onMessage(new Uint8Array(rebootPose.buffer),{peerId:'pilot'});
  const reboot=drive.data.slice();new DataView(reboot.buffer).setFloat32(0,.001,true);
  receiver.actions.get('sub-drive').onMessage(reboot,{peerId:'pilot'});
  showSub();assert.deepEqual(proxy.userData.thrusterRPM,rpm);
  for(const on of [false,true]){
    receiver.actions.get('sub-lamp').onMessage(on,{peerId:'pilot'});
    showSub();assert.equal(observer.lamps.length,on?2:0);
    for(const name of lampNames){
      assert.equal(proxy.getObjectByName(name).visible,on);
      assert.equal(proxy.getObjectByName(name+' lens').visible,on);
    }
  }
  console.log('Combined drone packets, legacy fallback, prop animation, stale poses and reconnect passed.');
}finally{
  observer.leave();
  pilot.leave();
}
