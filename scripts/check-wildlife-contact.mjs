import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {npcRoom,writeAnimalContacts} from '../viewer/npc-room.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const fromDisk=async u=>({json:async()=>JSON.parse(await readFile(u))});
const open=(name,settings)=>loadInstance(name,settings,fromDisk);

const host=npcRoom(),guest=npcRoom(),peers=new Map();
for(const [id,room] of [['a',host],['b',guest]]){
  const channel={async send(data,{target}={}){peers.get(target??(id==='a'?'b':'a'))?.onMessage(structuredClone(data),{peerId:id});}};
  peers.set(id,channel);room.connect(channel,id);
}
host.join('b');guest.join('a');
assert(host.host&&!guest.host);
function guestContacts(kind){
  while(host.animals.size<10)host.spawn(host.animals.size%2?'shark':'whale');
  const main=Array(203).fill(0);main[0]=1;main[11]=-12;main[19]=-12;
  for(const a of host.animals.values()){
    if(a.id===a.kind)continue;
    const k=a.kind==='whale'?17:9;
    a.frame=main.slice();a.frame[k+2]=-12;
  }
  const actors=[...host.animals.values()];
  // Reorder the two tail slots so each species is tested in the last slot.
  const tail=actors[9].kind===kind?actors[9]:actors[8];
  host.animals.delete(tail.id);host.animals.set(tail.id,tail);
  const k=kind==='whale'?17:9;tail.frame[k+2]=-.12;tail.frame[k+3]=Math.PI/2;
  host.publish(main);
  assert.equal(guest.animals.size,10);
  const rows=writeAnimalContacts(guest.animals,guest.latest.frame,new Float64Array(90));
  assert.equal(rows[81],kind==='whale'?1:2);assert.equal(rows[84],-.12);
  return rows;
}

// A deep animal occupies the nearer slot. The surface animal in the last spawn
// slot must still stop this approach. Compare all three hull configurations.
for(const [hullClass,mass] of [[1,265],[2,64],[3,3250]]){
  for(const kind of [1,2]){
    const actor=new Float64Array(90),rows=guestContacts(kind===1?'whale':'shark');
    const law=await open('HullWildlife',{hullClass});
    law.set('traffic',rows);
    let x=-7,speed=4,peak=0,furthest=x,stop;
    for(let i=0;i<300;i++){
      law.set('pose',[x,0,0,0,0,0]);law.set('velocity',[speed,0,0]);
      const f=law.get('wrench');
      peak=Math.max(peak,-f[0]);
      if(speed<.1&&stop===undefined)stop=x;
      speed+=.01*f[0]/mass;x+=.01*speed;furthest=Math.max(furthest,x);
    }
    assert(peak>20&&stop<0&&furthest<0,`hull ${hullClass}, animal ${kind}, stop ${stop}`);
    rows[84]=-12;law.set('traffic',rows);law.set('pose',[0,0,0,0,0,0]);assert.deepEqual(law.get('wrench'),[0,0,0,0,0,0]);
    law.set('traffic',actor);law.set('pose',[0,0,0,0,0,0]);assert.deepEqual(law.get('wrench'),[0,0,0,0,0,0]);
    console.log('Hull approach',{hullClass,kind,stop,peak});
  }
}
for(const kind of ['whale','shark']){
  for(const manual of [0,1]){
    const s=await open('HarborTraffic',{}),free=await open('HarborTraffic',{});
    const whale=kind==='whale',animalPose=model=>whale?model.get('whale'):model.get('state').slice(9,13);
    const pose=animalPose(s);
    // Bring the original hull's bow into one flank with the animal's own
    // depth retained. The host computes this for both default and spawned FMUs.
    const craft=new Float64Array(256),hull=new Float64Array(160);
    craft.set([881,1,pose[0],pose[1]-1.05,pose[2],0,3,0]);hull.set([3,Math.PI/2,0,0,0]);
    s.set('craft',craft);s.set('craftHull',hull);free.set('craft',craft);
    for(const model of [s,free])model.set(whale?'whalePilot':'sharkPilot',[manual,0,.6,-1]);
    let peak=0;
    for(let i=0;i<35;i++){s.advance(.01);free.advance(.01);const reaction=s.get('hullReaction').slice(whale?0:3,whale?3:6);
      peak=Math.max(peak,Math.hypot(reaction[0],reaction[1]));}
    const hit=animalPose(s),clear=animalPose(free);
    const deviation=Math.hypot(hit[0]-clear[0],hit[1]-clear[1]);
    assert(peak>100&&deviation>.005);
    console.log('Host reciprocal contact',{kind,manual:Boolean(manual),peak,deviation});
  }
}

for(const kind of [1,2]){
  const s=await open('HarborTraffic',{}),state=s.get('state'),yaw=state[3],rows=guestContacts(kind===1?'whale':'shark');
  rows[82]=state[1]+2*Math.cos(yaw);rows[83]=state[2]+2*Math.sin(yaw);rows[84]=.05;rows[85]=yaw+Math.PI/2;
  s.set('npcTraffic',rows);
  let peak=0;
  for(let i=0;i<8;i++){s.advance(.01);const reaction=s.get('npcContact');peak=Math.max(peak,Math.hypot(reaction[0],reaction[1]));}
  assert(peak>100);console.log('NPC Hobie contact against shared last slot',{kind,peak});
}

// One raised wing reaches the port hull at this height. Swapping the two
// solved angles preserves mean stroke and moves that wing below the hull.
const rayFrame=Array(29).fill(0);
rayFrame[3]=-5;
const rays=new Map([['manta',{id:'manta',kind:'manta',frame:rayFrame}]]);
const hull=await open('HullWildlife',{hullClass:1,pose:[-.6,2,-4.5,0,0,0],velocity:[0,0,0]});
function wingContact(port,starboard){
  rayFrame[23]=port;rayFrame[24]=starboard;
  const traffic=new Float64Array(90),articulation=new Float64Array(40);
  writeAnimalContacts(rays,null,traffic,articulation);
  hull.set('traffic',traffic);hull.set('articulation',articulation);
  return Math.hypot(...hull.get('wrench').slice(0,3));
}
assert(wingContact(.55,-.45)>500);
assert.equal(wingContact(-.45,.55),0);
console.log('Vessel contact follows the independently posed port wing.');
