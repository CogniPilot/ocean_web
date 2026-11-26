// Exercise the distributed browser FMU, including its sampled interaction outputs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const open=async(inputs={})=>loadInstance('MantaRay',inputs,async url=>new Response(await readFile(url)));
const dt=.02;
function advance(ray,seconds){
  for(let i=0;i<Math.round(seconds/dt);i++)ray.advance(dt);
}
function close(a,b,tol=1e-8){assert(Math.abs(a-b)<tol,`${a} differs from ${b}`);}
const maxAbs=a=>Math.max(...a.map(Math.abs));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// The same bank command gets its moment from the two fins' local water
// loads. Start in a glide with both wings stationary to isolate that flow.
async function bankMoment(speed,bank,{current=0,rollRate=0,z=-4}={}){
  const ray=await open({pilot:[1,0,0,-1,bank],currentVelocity:[current,0,0],
    initialState:[0,0,z,speed,0,0,0,0,0,0,0,rollRate,0,0,0,60]});
  const [port,starboard]=ray.get('wingNormalLoad');
  return .21*5.5*(port-starboard);
}
const slowMoment=await bankMoment(.8,1),fastMoment=await bankMoment(1.6,1);
assert(slowMoment>0);
close(fastMoment,4*slowMoment);
close(await bankMoment(1.6,-1),-fastMoment);
close(await bankMoment(2,1,{current:2}),0);
close(await bankMoment(2.8,1,{current:2}),slowMoment);
close(await bankMoment(1.6,1,{z:2}),0);
const dampingMoment=await bankMoment(0,0,{rollRate:.6});
assert(dampingMoment<0);
console.log('Gliding bank moments (N·m)',{slowMoment,fastMoment,dampingMoment});

async function directFins(actions,{speed=1.6,current=0,z=-4,pitchRate=0,yawRate=0,pilot=[0,0,0,0,0]}={}){
  return open({directDrive:1,finActions:actions,pilot,currentVelocity:[current,0,0],
    initialState:[0,0,z,speed,0,0,0,0,0,yawRate,pitchRate,0,0,0,0,60]});
}
const neutral=[0,0,0,0,0],pitchFins=[0,0,1,0,0],yawFins=[0,0,0,0,1];
const finTests={};
for(const [actions,axis,label,arm,inertia,rateIndex] of [
  [pitchFins,1,'pitch',.4*5.8/5.5,480,10],[yawFins,2,'yaw',.21*5.5,490,9]
]){
  const ray=await directFins(actions);
  const [moment,loads]=ray.getMany(['finMoment',axis===1?'chordNormalLoad':'wingAxialLoad']);
  const torque=moment[axis];
  assert(torque>0);
  close(torque,arm*(axis===1?loads[0]-loads[1]:loads[1]-loads[0]));
  close((await directFins(actions,{speed:.8})).get('finMoment')[axis],torque/4);
  close((await directFins(actions.map(x=>-x))).get('finMoment')[axis],-torque);
  close((await directFins(actions,{speed:3.6,current:2})).get('finMoment')[axis],torque);
  close((await directFins(actions,{speed:2,current:2})).get('finMoment')[axis],0);
  close((await directFins(actions,{z:1})).get('finMoment')[axis],0);
  close((await directFins(actions.map(x=>x*8))).get('finMoment')[axis],torque);
  const spinning=await directFins(neutral,{pitchRate:axis===1?.5:0,yawRate:axis===2?.5:0});
  assert(spinning.get('finMoment')[axis]<0);
  ray.advance(.0001);
  // Compare the initial response against the wet inertia assembled from
  // all three bodies at their neutral posture.
  const properties=ray.get('bodyProperties');
  const effective=axis===1?295+properties[5]+2*properties[12]:
    155+properties[6]+2*(properties[13]+properties[7]*(.48+properties[9])**2);
  close(ray.get('state')[rateIndex]/.0001,torque/effective,.02);
  finTests[label]=torque;
}
const direct=await directFins([.6,.7,-.3,.4,.2]);
const other=await directFins([.6,.7,-.3,.4,.2],{pilot:[1,-1,1,-1,-1]});
other.set('breach',1);other.set('sprint',1);
advance(direct,2);advance(other,2);
assert.deepEqual(direct.get('state'),other.get('state'));
assert(direct.get('thrust')>0);
const capped=await directFins([1,1,0,0,0]),over=await directFins([5,5,0,0,0]);
advance(capped,.5);advance(over,.5);
assert.deepEqual(capped.get('state'),over.get('state'));
console.log('Direct fin moments in a 1.6 m/s glide (N·m)',finTests);

const patrol=await open();
let path=0,glide=0,level=0,minZ=0,maxZ=-Infinity;
let previous=patrol.get('state'),maxRoll=0;
for(let i=0;i<6000;i++){
  patrol.advance(dt);
  const [s,a]=patrol.getMany(['state','activity']);
  assert(s.every(Number.isFinite));
  path+=Math.hypot(s[0]-previous[0],s[1]-previous[1]);
  minZ=Math.min(minZ,s[2]);maxZ=Math.max(maxZ,s[2]);maxRoll=Math.max(maxRoll,Math.abs(s[8]));
  glide+=dt*a[2];level+=a[0]===0?dt:0;
  assert.equal(a[4],0);
  previous=s;
}
assert(path>100 && maxRoll>.25 && minZ> -10 && maxZ< -5 && glide>20 && level>3);
const resumed=await open({initialState:previous,initialWings:patrol.get('wingJoints'),initialWake:patrol.get('wingWake')});
for(let i=0;i<16;i++)close(resumed.get('state')[i],previous[i]);
advance(resumed,1);advance(patrol,1);
assert(maxAbs(resumed.get('state').map((x,i)=>x-patrol.get('state')[i]))<.01);

// Keep moving water separate from ground speed. Changing Shift must alter
// propulsion without introducing an instantaneous jump in position or speed.
async function checkSwimSpeeds(currentVelocity){
  const initialState=[0,0,-6,...currentVelocity,0,0,0,0,0,0,0,.34,0,60];
  const ray=await open({initialState,bedHeight:-100,currentVelocity,pilot:[1,0,0,1,0]});
  const phases=[];
  for(const sprint of [0,1,0]){
    const before=ray.get('state');
    ray.set('sprint',sprint);
    assert.deepEqual(ray.get('state').slice(0,6),before.slice(0,6));
    advance(ray,10);
    let water=0,ground=0,peak=0,count=0;
    for(let i=0;i<1000;i++){
      ray.advance(dt);
      const s=ray.get('state');
      const speed=Math.hypot(...currentVelocity.map((c,k)=>s[3+k]-c));
      water+=speed;ground+=Math.hypot(...s.slice(3,6));peak=Math.max(peak,speed);count++;
    }
    const mean=water/count,target=sprint?7:3.5;
    close(mean,target,.07);
    assert(peak>mean && peak<1.09*target,'natural within-stroke speed ripple');
    phases.push({water:mean,ground:ground/count,peak});
  }
  return phases;
}
const still=await checkSwimSpeeds([0,0,0]);
const following=await checkSwimSpeeds([.92,.43,0]);
for(let i=0;i<still.length;i++){
  close(still[i].water,following[i].water,1e-8);
  assert(following[i].ground>following[i].water+.8);
}

async function checkBreach(automatic){
  const ray=await open();
  const initial=ray.get('state');
  let sim=ray;
  if(automatic){
    initial[14]=69;
    sim=await open({initialState:initial,autoBreach:1});
  }
  let peak=-Infinity,flight=0,prior,lastZ,emerged=false,reentered=false;
  for(let i=0;i<1600;i++){
    if(!automatic && (i===100 || i===105))sim.set('breach',i===100?1:0);
    sim.advance(dt);
    const [s,a,thrust]=sim.getMany(['state','activity','thrust']);
    peak=Math.max(peak,s[2]);lastZ=s[2];
    if(a[3]===0){
      const velocity=sim.get('centerVelocity');
      emerged=true;
      assert.equal(thrust,0);
      if(prior){
        close(velocity[0],prior[0],2e-5);close(velocity[1],prior[1],2e-5);
        close((velocity[2]-prior[2])/dt,-9.80665,.002);
        flight+=dt;
      }
      prior=velocity;
    }else{
      if(emerged && a[3]>.99)reentered=true;
      prior=null;
    }
  }
  assert(peak>.7 && flight>.3 && reentered && lastZ< -2);
  return {peak,flight};
}
const commanded=await checkBreach(false),automatic=await checkBreach(true);

const sample=[0,0,-3,1.2,0,0,0,0,0,0,0,0,0,.34,0,60];
for(const sign of [-1,1]){
  const ray=await open({initialState:sample,pilot:[1,sign,.55*sign,.6,sign]});
  advance(ray,3);
  const s=ray.get('state');
  assert(sign*s[6]>.5 && sign*s[7]>.20 && sign*s[8]>.15);
  ray.set('pilot',[1,0,0,-1,0]);advance(ray,3);
  assert.equal(ray.get('activity')[0],0);assert.equal(ray.get('activity')[2],1);
}
function actor(kind,where){
  const craft=new Array(32*8).fill(0),craftHull=new Array(32*5).fill(0);
  craft.splice(0,8,27,kind,...where,0,0,0);craftHull[0]=kind===2?4:0;
  return {craft,craftHull};
}
const traffic={};
for(const kind of [1,2,3,4]){
  // At the southern tip of the patrol, an undisturbed animal heads east.
  const center=[-12,15,-3];
  const inputs={initialState:[...center,...sample.slice(3)]};
  const position=[center[0]+4,center[1],kind===1||kind===3?0:center[2]];
  const sim=await open({...inputs,...actor(kind,position)});
  const quiet=await open(inputs);
  const [guidance,loads]=sim.getMany(['avoidance','vesselWrench']);
  assert(guidance[3]>.2 && guidance[1]>.15 && guidance[2]<-.1 && maxAbs(loads)===0);
  advance(sim,1);advance(quiet,1);
  const turn=sim.get('state')[6]-quiet.get('state')[6];
  assert(turn>.03,`stationary type ${kind} failed to turn swimmer`);
  const removed=actor(kind,[75,65,0]);sim.set('craft',removed.craft);sim.advance(dt);
  assert.equal(maxAbs(sim.get('avoidance')),0);
  traffic[kind]={strength:guidance[3],turn};
}
const position=[.3,.4,-2.97];
const collision=await open({initialState:sample,...actor(2,position)});
const [contacts,vessels,proxies]=collision.getMany(['contacts','vesselWrench','proxies']);
const radius=proxies[6],wingSpan=2*(proxies[6*7+4]+proxies[6*7+6]);
assert.equal(proxies.length,70);assert(radius>0);close(wingSpan,5.5);
const f=vessels.slice(0,3),torque=cross(position.map((x,i)=>x-sample[i]),f);
assert(Math.hypot(...f)>100);assert.equal(maxAbs(vessels.slice(6)),0);
for(let i=0;i<3;i++){
  close(f[i]+contacts[i],0);
  close(vessels[i+3]+contacts[i+3]+torque[i],0);
}
console.log({still,following,patrolMean:path/120,path,glide,minZ,maxZ,commanded,automatic,traffic,contactN:Math.hypot(...f)});
// Independent torque on one hinge must curl that wing and counter-rotate
// the free trunk, with no lateral or longitudinal acceleration of system COM.
const dry=await open({initialState:[0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,60],bedHeight:-100,
  muscleDrive:1,wingEffort:[.15,0]});
advance(dry,.10);
const [joints,center,comVelocity,props]=dry.getMany(['wingJoints','centerOfMass','centerVelocity','bodyProperties']);
assert(joints[0]>joints[1]+.035 && dry.get('state')[11]<-.01,'unilateral hinge effort must counter-rotate trunk');
close(comVelocity[0],0,1e-5);close(comVelocity[1],0,1e-5);close(comVelocity[2],-.980665,2e-5);
close(center[2],5-.5*9.80665*.1**2,1e-5);
close(props[0]+props[7]+props[14],420);
assert(dry.get('musclePower')>0 && dry.get('thrust')===0);
const tilted=await open({initialWings:[.5,-.3,.1,-.2],muscleDrive:1,bedHeight:-100});
const [caps,qWing]=tilted.getMany(['proxies','wingJoints']);
close(qWing[0],.5);close(qWing[1],-.3);
close(caps[6*7+5],(2.58-.48)*Math.sin(.5));
close(caps[7*7+5],(2.58-.48)*Math.sin(-.3));
console.log('Wing/root reaction, ballistic centre of mass, dry inertia and independent wing collision geometry passed.');
