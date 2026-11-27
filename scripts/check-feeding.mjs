// The host observes multiple mouths at the same harbor time using one FMU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>({json:async()=>JSON.parse(await readFile(url))});
const ground=await loadInstance('FeedingGround',{clock:1},read);
const points=ground.get('school');
assert.equal(points.length,72*4);
const [east,north,depth]=points;
for(const whale of [1,0,1]){
  const reach=whale?3.9:2;
  ground.set('whale',whale);
  ground.set('pose',[east-reach,north,depth+(whale?.55:.14),0,0,0]);
  ground.set('feedAge',.57);
  const [gape,capture,inside]=ground.getMany(['gape','capture','inMouth']);
  assert(Math.abs(gape-(whale?.57/.65:(.72-.57)/.21))<1e-9);
  assert.equal(capture,1);
  assert.equal(inside[0],1);
  ground.set('feedAge',3);
  assert.deepEqual(ground.getMany(['gape','capture']),[0,0]);

  for(const [range,bearing,elevation,visible] of [[6,.3,-.17,true],[6,-.93,0,false],[6,0,.5,false],[16,0,0,false]]){
    ground.set('pose',[east-reach-range*Math.cos(bearing)*Math.cos(elevation),
      north-range*Math.sin(bearing)*Math.cos(elevation),depth-range*Math.sin(elevation),0,0,0]);
    const echo=ground.get('returns');
    for(const [i,expected] of [range,bearing,elevation].entries())assert(Math.abs(echo[i]-expected)<1e-9);
    assert.equal(echo[3]>0,visible);
  }
}
ground.set('pose',[points[71*4]-3.9,points[71*4+1],points[71*4+2]+.55,0,0,0]);
assert.equal(ground.get('inMouth')[71],1);
console.log('Whale lunge, shark bite and forward sonar observations passed.');

const {mantaFiltering,creditPrey}=await import('../viewer/feeding-harbor.mjs');
ground.set('whale',0);ground.set('manta',1);ground.set('feedAge',-1);
ground.set('useSchool',1);
const bait=Array.from({length:72},(_,i)=>[i?1000+i:0,0,-3,0]).flat();
ground.set('swimmers',bait);
const manta={kind:'manta'},regrowth=Array(72).fill(0);
function mantaPass(x,y,z,ve,yaw=0,pitch=0,vz=0,t=10){
  const frame=[t,x,y,z,ve,0,vz,yaw,pitch,0];
  ground.set('pose',[x,y,z,yaw,pitch,0]);
  const [capture,inside]=ground.getMany(['capture','inMouth']);
  if(mantaFiltering(frame)&&capture)creditPrey(manta,inside,regrowth,t);
}
mantaPass(-1,.6,-3,1);
mantaPass(-1,0,-2.5,1);
mantaPass(-1,0,-3,0);
mantaPass(-1,0,-3,-1);
assert.equal(manta.caught??0,0,'side, depth, stationary and reverse passes leave the bait');
mantaPass(-1,0,-3,1);assert.equal(manta.caught,1);
mantaPass(-1,0,-3,1);assert.equal(manta.caught,1,'restocking prey cannot feed twice');
mantaPass(-1,0,-3,1,0,0,0,29);assert.equal(manta.caught,2,'restocked prey becomes available');
assert(mantaFiltering([0,0,0,0,0,0,.5,0,Math.PI/2]),'upward swimming remains forward in a vertical pitch');
console.log('Manta forward filter-feeding, mouth contact, misses and restock passed.');

const {feedingHarbor}=await import('../viewer/feeding-harbor.mjs');
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>String(url).startsWith('file:')?new Response(await readFile(url)):originalFetch(url,options);
try{
  const ray={id:'manta',kind:'manta',seat:'local',frame:[0,0,0,0,1,0,0,0,0,0]};
  const habitat={gulls:[],restock:Array(72).fill(0),time:0};
  const room={session:1,host:true,habitat,animals:new Map([['manta',ray]]),takeCall:()=>null};
  const feeding=feedingHarbor({Vector3:class{}},null,room);
  let fish;
  for(let i=0;i<100&&!fish;i++){
    fish=feeding.fish(10);
    if(!fish)await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert(fish,'FeedingGround browser reactor loaded for the harbor host');
  const [x,y,z]=fish.positions;
  ray.frame=[10,x-1,y+1,z,1,0,0,0,0,0];
  feeding.step(10);assert.equal(ray.caught??0,0);
  ray.frame=[10.01,x-1,y,z,1,0,0,0,0,0];
  feeding.step(10.01);assert.ok(ray.caught>=1,'the host credits this manta swimming through live bait');
  const total=ray.caught;
  feeding.step(10.02);assert.equal(ray.caught,total,'a repeated swimmer frame cannot catch again');
}finally{globalThis.fetch=originalFetch;}
