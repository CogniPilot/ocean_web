import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fleetLifts,liftPose,subKeel,liftMechanism,portLiftWireframes} from '../viewer/stern-lift.mjs';

const definition=await readFile(new URL('../Wreck/PortLift.mo',import.meta.url),'utf8');
const fittings=definition.match(/fittings\[17,6\]=\[([^\]]+)\]/)[1].split(';').map(row=>row.split(',').map(Number));
const cradle=liftMechanism(1);
const alongside=liftMechanism(0);
assert.deepEqual([alongside.padX,alongside.padY,alongside.padZ],[-2.78,2.23,-.34]);
assert(Math.abs(cradle.padZ-subKeel-.64)<1e-12);
const solids=await readFile(new URL('../Wreck/PiccardSolids.mo',import.meta.url),'utf8');
const boxes=solids.match(/primitives\[count,7\]\s*=\s*\[([^\]]+)\]/)[1].split(';').map(row=>row.split(',').map(Number));
assert.equal(boxes.length,Number(solids.match(/constant Integer count=(\d+)/)[1]));
const partBottom=b=>b[2]-b[5];
const keel=Math.min(...boxes.map(partBottom));
assert(Math.abs(keel+subKeel)<1e-8,'FMU skid height matches rendered seat');
const skids=boxes.filter(b=>Math.abs(partBottom(b)-keel)<1e-8);
for(const pad of fittings.slice(5,7)){
  assert(skids.some(bar=>Math.abs(cradle.padX+bar[0]-pad[0])+bar[3]<=.5*pad[3]));
  assert(Math.abs(pad[2]+.5*pad[5]-(cradle.padZ-subKeel))<1e-12);
}
const fixture=[0,0,0,.1,.2,.3,1,0,0,0,1,0,0,0,1];
const wires=portLiftWireframes({boxes:[...fixture,...fixture],movingCount:1,travel:1.75});
assert.equal(wires.fixed.length,12*2*3);assert.deepEqual(wires.moving,wires.fixed);

const ids=['carrier','secondCarrier','diver','otherDiver'];
const kinds=new Map(ids.map((id,i)=>[id,i<2?'motorboat':'sub']));
const peers=new Map(),actions=new Map(),packets=[];
for(const id of ids){
  const peer=fleetLifts(),members=new Set(ids.filter(other=>other!==id));
  const action={async send(data,{target}={}){
    for(const to of target?[target]:members)packets.push({from:id,to,data:structuredClone(data)});
  }};
  peers.set(id,peer);actions.set(id,action);
  peer.bind({makeAction:()=>action},members,other=>kinds.get(other),id);
  peer.setOwner(kinds.get(id)==='motorboat');
}
function deliver({from,to,data}){actions.get(to).onMessage(data,{peerId:from});}
function flush(){while(packets.length)deliver(packets.shift());}
function hold(kind,from,to){
  const index=packets.findIndex(p=>p.data[0]===kind&&p.from===from&&p.to===to);
  assert(index>=0,'missing '+kind);
  return packets.splice(index,1)[0];
}
const [carrier,second,diver,other]=ids.map(id=>peers.get(id));
const boat={x:3,y:5,z:-.1,ve:1.2,vn:-.4,vu:.2,yaw:.8,pitch:.15,heel:-.1,yawRate:.3};
const sub={...liftPose(boat,0),kind:'sub',id:'diver'};
const levelCarrier={x:0,y:0,z:0,yaw:0,heel:0,pitch:0};
const saddle=liftPose(levelCarrier,1);
assert(Math.hypot(saddle.x+2.78,saddle.y-.13,saddle.z-.73325)<1e-12);
assert.deepEqual(saddle.forward.map(x=>x+0),[1,0,0]);
assert.deepEqual(saddle.up,[0,0,1]);
// Compare stated pad velocity with the differentiated pose throughout the
// tilt, hoist and traverse under a nonzero roll/pitch/yaw of the cruiser.
const tilted={...levelCarrier,heel:.31,pitch:-.27,yaw:1.18};
for(const fraction of [.02,.10,.19,.22,.47,.61,.68,.82,.95]){
  const delta=1e-6,rate=-.125;
  const a=liftPose(tilted,fraction-delta),b=liftPose(tilted,fraction+delta);
  const q=liftPose(tilted,fraction,0,rate);
  for(const [x,v] of [['x','ve'],['y','vn'],['z','vu']])
    assert(Math.abs(q[v]-rate*(b[x]-a[x])/(2*delta))<1e-8);
}
const endPose=[-3,1,0,.2,0,.1,0,1,0,0,0,1,.03,.04,.05];
assert.equal(carrier.local.level,1);assert.equal(carrier.local.goal,1);
for(const peer of [carrier,second]){peer.travel(0);peer.tick(8,50,boat,[],0);}
flush();
// A free sub whose frame plate misses the magnetic face stays in the water.
const centered={...liftPose(levelCarrier,0),kind:'sub',id:'diver'};
for(const miss of [{...centered,y:centered.y+.35},{...centered,x:centered.x+.085},{...centered,up:[0,0,-1]}]){
  second.travel(1);
  second.tick(.2,100,levelCarrier,[miss],.02);
  assert.equal(second.local.rider,null);
  second.travel(0);
  second.tick(.2,150,levelCarrier,[],0);
}
second.travel(1);
second.tick(0,160,levelCarrier,[centered],0);
assert.equal(second.local.rider,centered.id,'energizes on an aligned plate before the winch moves');
second.travel(0);second.tick(.2,165,levelCarrier,[],.01);second.tick(.2,170,levelCarrier,[],0);
flush();
assert.equal(await carrier.reserve('secondCarrier'),false);
const a=diver.reserve('carrier'),b=other.reserve('carrier');flush();
assert.equal(await a,'afloat');assert.equal(await b,false);
assert.equal(carrier.local.rider,null);

carrier.travel(1);
// A newly launched peer can briefly advertise its previous survey coordinates.
carrier.tick(.2,200,boat,[{...sub,x:sub.x+16,z:-10}],0);assert.equal(carrier.local.rider,null);
carrier.tick(.2,400,boat,[{...sub,z:sub.z+.15}],.26);flush();assert.equal(carrier.local.rider,'diver');
assert.equal(diver.release('carrier'),false);
const nominal=liftPose(boat,1),live=[nominal.x,nominal.y,nominal.z,0,0,0,...nominal.forward,...nominal.up,0,0,0];
const line=[1,2,3,4,5,6,1,50];
carrier.tick(20,800,boat,[],1,undefined,0,live,line);flush();
assert.deepEqual(diver.remote.get('carrier').pose,live);assert.deepEqual(diver.remote.get('carrier').cable,line);
assert.equal(diver.remote.get('carrier').poseCarrier.yaw,boat.yaw);
deliver({from:'diver',to:'carrier',data:['release',2]});assert.equal(carrier.local.rider,'diver');
carrier.travel(0);carrier.tick(4,1200,boat,[],.00001);flush();
assert.equal(carrier.local.rider,'diver','wait for the measured endpoint');

carrier.tick(.2,1400,boat,[sub],0,Float64Array.from(endPose));
assert.equal(carrier.local.rider,null);
const bottom=hold('state','carrier','diver');
carrier.travel(1);carrier.tick(.2,1600,boat,[sub],.04);flush();
assert.equal(diver.remote.get('carrier').rider,'diver');
const dropped=diver.takeDrop('carrier');assert.deepEqual(dropped.pose,endPose);
assert.equal(dropped.carrier.yaw,boat.yaw);assert.equal(dropped.carrier.wu,.3);
deliver(bottom);flush();
assert.equal(diver.takeDrop('carrier'),undefined);
assert.equal(diver.remote.get('carrier').rider,'diver','old endpoint preserves the newer attachment');

diver.abandon('carrier');flush();assert.equal(carrier.local.rider,null);
const c=other.reserve('carrier');flush();assert.equal(await c,'mounted');assert.equal(carrier.local.rider,'otherDiver');
other.abandon('carrier');flush();
carrier.travel(0);carrier.tick(1,1800,boat,[],0);flush();
carrier.travel(1);second.travel(1);
carrier.tick(.2,2000,boat,[sub],.03);second.tick(.2,2000,boat,[sub],.03);flush();
assert.equal(carrier.local.rider,'diver');assert.equal(second.local.rider,null);
carrier.leave('diver');flush();assert.equal(carrier.local.rider,null);
carrier.travel(0);carrier.tick(1,2300,boat,[],.45);flush();
carrier.setOwner(false);flush();assert.equal(diver.remote.has('carrier'),false);
carrier.setOwner(true);flush();assert.deepEqual([carrier.local.level,carrier.local.goal,carrier.local.rider],[1,1,null]);
assert.deepEqual([diver.remote.get('carrier').level,diver.remote.get('carrier').goal],[1,1]);
console.log('Stern lift reservations, measured travel, physical pickup, ownership, endpoint handoff, reordering and disconnect passed.');
