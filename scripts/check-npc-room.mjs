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
const peers=new Map([['a',a],['b',b]]);
host.connect(a,'a');guest.connect(b,'b');
function flush(){
  for(let remaining=100;pending.length;remaining--){
    assert(remaining>0,'Peer messages should settle');
    const {peerId,target,data}=pending.shift();
    for(const [id,peer] of peers){
      if(id!==peerId&&(!target||id===target))peer.onMessage(data,{peerId});
    }
  }
}
host.join('b');guest.join('a');flush();
assert.equal(host.host,true);
assert.equal(guest.host,false);
assert.equal(guest.hasWildlife,false);

assert.deepEqual(host.habitat.vessels,[]);
assert.equal(guest.spawn('motorboat',1),undefined);
assert.equal(host.spawn('hobie',2),'npc-1');
assert.equal(host.spawn('motorboat',3),'npc-2');
flush();
assert.deepEqual(guest.habitat.vessels,[{kind:'hobie',started:2},{kind:'motorboat',started:3}]);
assert.equal(host.spawn('hobie',4,600,13),'npc-3');
flush();
const raceId=host.habitat.vessels[2].raceId;
assert.match(raceId,/^[a-f0-9]{16}$/);
assert.deepEqual(guest.habitat.vessels[2],{kind:'hobie',started:4,raceAt:600,raceWind:13,raceId});
assert.equal(guest.hasWildlife,false);

guest.select('shark');flush();
assert.deepEqual([...host.animals.keys()],['shark']);
assert.equal(guest.animals.get('shark').seat,'b');
assert.equal(guest.animals.get('shark').player,true);
const banked=Array(207).fill(0);
banked[203]=.6;
banked[205]=.8;banked[206]=.3;
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
a.onMessage({type:'hello',version:2,joined:Date.now()+10,sharkBank:true},{peerId:'bank-legacy'});
const bankLegacy=pending.find(message=>message.target==='bank-legacy'&&message.data.type==='harbor').data;
assert.deepEqual(bankLegacy.frame,banked.slice(0,205));
assert.deepEqual(bankLegacy.items[0].frame,banked.slice(0,205));
pending.length=0;
host.leave('bank-legacy');flush();
guest.release('shark');flush();
assert.equal(guest.hasWildlife,false);
assert.equal(host.spawn('gull'),'gull-1');
host.habitat.time=.25;host.publish();flush();
assert.equal(guest.habitat.gulls.length,1);
const swimming=Array(25).fill(.5);
swimming[22]=2;swimming[23]=-.3;swimming[24]=.3;
host.habitat.gulls[0]=swimming;
host.publish();flush();
assert.deepEqual(guest.habitat.gulls[0],swimming);
a.onMessage({type:'hello',version:2,joined:Date.now()+10,extendedGulls:true,gullWater:true},{peerId:'water-legacy'});
const waterLegacy=pending.find(message=>message.target==='water-legacy'&&message.data.type==='harbor');
assert.deepEqual(waterLegacy.data.habitat.gulls[0],swimming.slice(0,22));
pending.length=0;
host.leave('water-legacy');flush();
assert.equal(guest.animals.size,0);
assert.equal(guest.latest,undefined);
assert.equal(guest.clock,.25);
guest.select('gull');flush();
assert.equal(host.seat('gull-1'),'b');
assert.equal(guest.seat('gull'),'b');
host.select('gull-1');
assert.equal(host.seat('gull'),'b','Only one player can occupy a gull');
guest.steer('gull',[0,.4,1],.6);flush();
assert.deepEqual(host.command('gull-1'),{axes:[0,.4,1],bank:.6,breach:false});
guest.select('whale');flush();
assert.equal(host.seat('gull'),null);
assert.deepEqual(host.command('gull-1').axes,[0,0,0]);
guest.select('gull');flush();
assert.equal(host.animals.size,0);
host.leave('b');flush();
assert.equal(host.seat('gull-1'),null);

const pilot=npcRoom();
pilot.select('gull');
assert.deepEqual(pilot.habitat.gullSeats,[pilot.self]);
assert.equal(pilot.habitat.gulls.length,1);
assert.equal(pilot.animals.size,0);
console.log('Empty rooms, player selection, gull controls, opt-in NPCs and peer synchronization passed.');

// Rejoin and exercise handoff, synchronized countdown, and a later arrival.
host.connect(a,'a');guest.connect(b,'b');
host.join('b');guest.join('a');flush();
assert.equal(host.spawn('hobie',1,600,11),'npc-1');
assert.equal(guest.restartRace(917),false);
assert.equal(host.restartRace(917),true);flush();
assert.equal(guest.habitat.raceStart,917);
assert.equal(guest.habitat.vessels[0].raceAt,917);
assert.equal(guest.transferHost('a'),false);
assert.equal(host.transferHost('b'),true);flush();
assert.equal(host.owner,'b');
assert.equal(guest.host,true);
assert.equal(host.spawn('gull'),undefined);
assert.equal(guest.spawn('gull'),'gull-1');flush();
assert.equal(host.habitat.gulls.length,1);
const late=npcRoom(),c=channel('c');
late.connect(c,'c');peers.set('c',c);
for(const [id,peer] of [['a',host],['b',guest]]){late.join(id);peer.join('c');}
flush();
assert.equal(late.owner,'b');
assert.equal(late.habitat.raceStart,917);
assert.equal(late.habitat.vessels[0].raceAt,917);
assert.equal(guest.transferHost('c'),true);flush();
assert.equal(late.host,true);
assert.equal(host.owner,'c');
assert.equal(guest.owner,'c');
assert.equal(late.restartRace(1034),true);flush();
for(const peer of [host,guest]){
  assert.equal(peer.habitat.raceStart,1034);
  assert.equal(peer.habitat.vessels[0].raceAt,1034);
  peer.leave('c');
}
peers.delete('c');flush();
assert.equal(host.host,true);
assert.equal(guest.owner,'a');
console.log('Only the host can restart or transfer, and the room state follows the selected host.');
