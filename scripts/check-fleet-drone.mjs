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
  draw(start+3600);
  assert(ghost.visible,'A delayed snapshot must not hide a connected peer');
  assert.equal(observer.drones.length,0);
  assert.equal(observer.rotorWakes([1,2,6],start+3600)[0],0,'A frozen visual must not emit stale downwash');

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
  const stopped=ghost.getObjectByName('RDD2 rotor 0').rotation.z;
  draw(performance.now()+160);
  assert.equal(ghost.getObjectByName('RDD2 rotor 0').rotation.z,stopped,'Zero RPM must stop the visual props');
  receiver.onPeerLeave('pilot');
  draw(performance.now()+5200);
  assert(!remoteScene.children.includes(ghost),'Remove a peer after a sustained disconnect');
  console.log('Combined drone packets, legacy fallback, prop animation, stale poses and reconnect passed.');
}finally{
  observer.leave();
  pilot.leave();
}
