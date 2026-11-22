import assert from 'node:assert/strict';
import {npcRoom} from '../viewer/npc-room.mjs';

const solo=npcRoom();
assert.equal(solo.hasWildlife,false);
assert.equal(solo.clock,undefined);
solo.select('shark');
assert.deepEqual([...solo.animals.keys()],['shark']);
assert.equal(solo.animals.get('shark').seat,solo.self);
solo.release('shark');
assert.equal(solo.hasWildlife,false);
assert.equal(solo.spawn('whale'),'whale');
solo.select('whale');
solo.release('whale');
assert.equal(solo.animals.get('whale').seat,null);
assert.equal(solo.spawn('whale'),'whale-2');
solo.connect(null);
assert.equal(solo.hasWildlife,false);
assert.equal(solo.spawn('gull'),'gull-1');
assert.equal(solo.habitat.gulls.length,1);
assert.equal(solo.animals.size,0);

const pending=[];
function channel(id){
  return {send(data,{target}={}){
    pending.push({peerId:id,target,data:structuredClone(data)});
    return Promise.resolve();
  }};
}
const host=npcRoom(),guest=npcRoom();
const a=channel('a'),b=channel('b');
host.connect(a,'a');guest.connect(b,'b');
function flush(){
  for(let remaining=100;pending.length;remaining--){
    assert(remaining>0,'Peer messages should settle');
    const {peerId,target,data}=pending.shift();
    const peer=peerId==='a'?b:a;
    if(!target||target!==peerId)peer.onMessage(data,{peerId});
  }
}
host.join('b');guest.join('a');flush();
assert.equal(host.host,true);
assert.equal(guest.host,false);
assert.equal(guest.hasWildlife,false);

guest.select('shark');flush();
assert.deepEqual([...host.animals.keys()],['shark']);
assert.equal(guest.animals.get('shark').seat,'b');
assert.equal(guest.animals.get('shark').player,true);
const banked=Array(205).fill(0);
banked[203]=.6;
host.animals.get('shark').frame=banked;
host.publish(banked);flush();
assert.deepEqual(guest.latest.frame,banked);
assert.deepEqual(guest.animals.get('shark').frame,banked);
a.onMessage({type:'hello',version:2,joined:Date.now()+10,extendedGulls:true},{peerId:'older'});
const oldPacket=pending.find(message=>message.target==='older'&&message.data.type==='harbor').data;
assert.equal(oldPacket.frame.length,203);
assert.equal(oldPacket.items[0].frame.length,203);
pending.length=0;
host.leave('older');flush();
guest.release('shark');flush();
assert.equal(guest.hasWildlife,false);
assert.equal(host.spawn('gull'),'gull-1');
host.habitat.time=.25;host.publish();flush();
assert.equal(guest.habitat.gulls.length,1);
assert.equal(guest.animals.size,0);
assert.equal(guest.latest,undefined);
assert.equal(guest.clock,.25);
console.log('Empty rooms, player selection, opt-in NPCs and peer synchronization passed.');
