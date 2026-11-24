// Compare mirrored fin inputs, verify repeatability, then drive the manual pilot into real terrain.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {createWhaleEnvironment} from './whale-env.mjs';
import {npcRoom} from '../viewer/npc-room.mjs';

const read=async url=>new Response(await readFile(url));
const launch=(east,north,height,speed,vertical=0)=>[
  east,north,height,speed,vertical,0,0,0,0,0,0,0,0,0,0,0,0,0
];
const level=launch(2,-18,-5,4);
const env=await createWhaleEnvironment({state:level});
function hold(action,steps){
  let obs;
  for(let i=0;i<steps;i++)obs=env.step(action);
  return obs;
}
const positive=hold([.6,-.6,0,0,0],50);
await env.reset();
assert.deepEqual(hold([.6,-.6,0,0,0],50),positive);
await env.reset();
const negative=hold([-.6,.6,0,0,0],50);
assert(positive.finLift[0]>positive.finLift[1]&&negative.finLift[0]<negative.finLift[1]);
assert(positive.state[11]>.2&&Math.abs(positive.state[11]+negative.state[11])<1e-8);
await env.reset();
const isolated=hold([.5,0,.4,-.3,.5],20);
assert(isolated.state[16]>.58&&isolated.state[17]===0&&isolated.state[15]<-.33);
assert(isolated.state[7]>isolated.state[5]&&isolated.state[10]>0);
assert.throws(()=>env.step([0,0,0,0,2]),RangeError);

// New guests send a separate bank field so older hosts can still apply their three steer axes.
const host=npcRoom(),guest=npcRoom();
const queue=[];
function wire(sender,receiver){
  return {send(data){queue.push(()=>receiver.onMessage(data,{peerId:sender}));return Promise.resolve();}};
}
const guestChannel={};
const hostChannel=wire('host',guestChannel);
Object.assign(guestChannel,wire('guest',hostChannel));
const flush=()=>{while(queue.length)queue.shift()();};
host.connect(hostChannel,'host');
await new Promise(r=>setTimeout(r,3));
guest.connect(guestChannel,'guest');host.join('guest');guest.join('host');flush();
assert(host.host&&!guest.host);
guest.select('whale');flush();guest.steer('whale',[.2,-.1,.5],-.7);flush();
assert.deepEqual(host.command('whale'),{axes:[.2,-.1,.5],bank:-.7,breach:false});
hostChannel.onMessage({type:'steer',id:'whale',axes:[0,0,0]},{peerId:'guest'});
assert.equal(host.command('whale').bank,0);

for(const sign of [-1,1]){
  const m=await loadInstance('HarborTraffic',{initialSwimmer:level,whalePilot:[1,0,.6,-1],whaleBank:sign*1.4},read);
  for(let i=0;i<100;i++)m.advance(.01);
  const bank=m.get('swimmerState')[11];
  assert(sign*bank>.6);
  m.set('whaleBank',0);
  for(let i=0;i<400;i++)m.advance(.01);
  const recovered=m.get('swimmerState')[11];
  assert(Math.abs(recovered)<.04);
  console.log({bankDegrees:bank*180/Math.PI,recoveredDegrees:recovered*180/Math.PI});
}
await env.reset({state:launch(2,-18,-11.7,3)});
const hulls=JSON.parse(await readFile(new URL('../viewer/assets/swimmer-hulls.json',import.meta.url),'utf8'));
const lowestProbe=Math.min(...hulls.probes.whale.map(point=>point[2]));
assert(Math.abs(env.observe().clearance-(13.7-11.7+lowestProbe))<1e-9);
assert.equal(env.observe().normalForce,0);
for(const [name,start,pitch,limitX,limitZ] of [
  ['flat bottom',launch(2,-18,-10.8,3,-.4),-.8,70,-9],
  ['west shore',launch(7,40,-3,3.5),0,16,.5],
  ['island summit',launch(36,40,6.5,1,-1),0,38,6.5]
]){
  const m=await loadInstance('HarborTraffic',{initialSwimmer:start,whalePilot:[1,pitch,1,-1]},read);
  let minimum=Infinity,peakLoad=0,first;
  for(let i=0;i<800;i++){
    m.advance(.01);
    const [state,[force,gap]]=m.getMany(['swimmerState','whaleContact']);
    assert(state.every(Number.isFinite)&&Number.isFinite(gap)&&Number.isFinite(force));
    assert(force>=0&&(gap<0||force===0),'attractive or premature support');
    assert(state[0]<limitX&&state[2]<=limitZ,name+' exceeded expected approach envelope');
    if(first===undefined&&force>0)first=m.time;
    minimum=Math.min(minimum,gap);peakLoad=Math.max(peakLoad,force);
  }
  assert(first>0&&peakLoad>1000&&minimum>-.55,name+' contact');
  console.log({terrain:name,firstContactSeconds:first,minimumClearanceMetres:minimum,peakNormalNewtons:peakLoad});
}
