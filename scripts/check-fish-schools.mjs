// Exercise the exported Modelica models in the same WASM runtime as the game.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {schoolObstacles,protectWater,harborSchools,validSchoolSnapshot,schoolStroke} from '../viewer/fish-schools.mjs';
import {fishObstacles} from '../viewer/fish-obstacles.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import {gullEscape} from '../viewer/feeding-harbor.mjs';

const read=async url=>new Response(await readFile(url));
const fish=await loadInstance('FishSchool',{},read),ground=await loadInstance('FeedingGround',{},read);
const step=.12,guide=Float64Array.from({length:48},(_,i)=>[1.4*(Math.floor(i/4)%4-1.5)*.47,.46*(Math.floor(i/4)%3-1),-3,0][i%4]);
const initial=Float64Array.from({length:72},(_,i)=>i%6<3?guide[4*Math.floor(i/6)+i%6]:i%6===3?.53:0);
const restingMotion=new Float64Array(48);
let motorState=restingMotion;
function resetMuscles(){motorState=restingMotion;fish.set('previousMotion',motorState);}
function advanceFish(){
  fish.set('previousMotion',motorState);
  const [next,motion]=fish.getMany(['nextState','nextMotion']);motorState=motion;
  return Float64Array.from(next);
}
function iterate(state,actors){
  fish.set('dt',step);fish.set('prior',state);fish.set('guide',guide);
  fish.set('actors',schoolObstacles(actors,0,0,-3));
  return advanceFish();
}
function replay(avoid){
  resetMuscles();
  let state=initial.slice(),minSide=Infinity,minPair=Infinity;
  for(let k=0;k<55;k++){
    const a={id:'piccard',kind:'sub',x:-3+k*.12,y:.07,z:-3,ve:1,vn:0,vu:0};
    state=iterate(state,avoid?[a]:[]);
    for(let i=0;i<12;i++){
      const [x,y,z]=state.slice(6*i,6*i+3);
      minSide=Math.min(minSide,Math.hypot((x-a.x-step*a.ve)/.58,(y-a.y)/.39,(z-a.z)/.32));
      for(let j=i+1;j<12;j++)minPair=Math.min(minPair,Math.hypot(x-state[6*j],y-state[6*j+1],z-state[6*j+2]));
    }
  }
  return {state,minSide,minPair};
}
const control=replay(false),maneuver=replay(true);
assert(control.minSide<1,'unprotected comparison actually intersects the sub');
assert(maneuver.minSide>=.99999,'swarm crossed the submerged moving body');
assert(maneuver.minPair>.17,'overlapping free fish');
assert(maneuver.state.some((v,i)=>Math.abs(v-control.state[i])>.09));
const centered=initial.slice();centered.set([0,0,-3,0,0,0],0);
fish.set('active',[1,...Array(11).fill(0)]);
resetMuscles();
const through=iterate(centered,[{id:'fast',kind:'sub',x:-3,y:0,z:-3,ve:55,vn:0}]);
assert(through[0]>3.6+.57,'fish remained behind a craft that crossed it completely within one tick');
fish.set('active',Array(12).fill(1));
for(const [kind,reach] of [['whale',3.9],['shark',2.0]]){
  const predator={id:kind,kind,x:0,y:0,z:-3,yaw:0};
  const closed=schoolObstacles([predator],0,0,-3),open=schoolObstacles([{...predator,gape:1}],0,0,-3);
  assert(closed[0]+closed[9]>reach&&open[0]+open[9]<reach,'open mouth must admit prey while body remains solid');
}
// A course reversal is a curved swim. Interpolating opposite velocity
// vectors used to turn the fish 180 degrees in a single solver sample.
const turning=new Float64Array(72),turnGuide=new Float64Array(48);
turning.set([0,0,-3,.53,0,0]);
fish.set('active',[1,...Array(11).fill(0)]);fish.set('actors',new Float64Array(104));
resetMuscles();
let lastYaw=0,maxTurn=0;
for(let i=0;i<18;i++){
  turnGuide.set([...turning.subarray(0,3),Math.PI]);
  fish.set('guide',turnGuide);fish.set('prior',turning);turning.set(advanceFish());
  const yaw=Math.atan2(turning[4],turning[3]),difference=yaw-lastYaw;
  maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference))));
  lastYaw=yaw;
}
assert(maxTurn<=2.4*step+1e-7&&Math.cos(lastYaw)<-.98,'unforced U-turn must reach its target continuously');
// Replay the same approaching hull twice, changing only whether the fish
// recognize a predator. Continue swimming with no encounter to test regrouping.
function predatorPass(recognized){
  resetMuscles();
  const state=new Float64Array(72),lanes=new Float64Array(48),flags=new Float64Array(8);
  for(let i=0;i<12;i++)state.set([i%4*.55,(Math.floor(i/4)-1)*.55,-3,.53,0,0],6*i);
  fish.set('active',Array(12).fill(1));let closest=Infinity,earlySide,finalLaneError;
  for(let n=0;n<285;n++){
    const time=n*step,shark={id:'hunter',kind:'shark',x:-9+1.95*time,y:.1,z:-3,yaw:0,ve:1.95};
    for(let i=0;i<12;i++)lanes.set([time*.53+i%4*.55,(Math.floor(i/4)-1)*.55,-3,0],4*i);
    fish.set('guide',lanes);fish.set('prior',state);
    fish.set('actors',schoolObstacles(n<90?[shark]:[],time*.53,0,-3,flags));
    if(!recognized)flags.fill(0);
    fish.set('predator',flags);state.set(advanceFish());
    let side=0,error=0;
    for(let i=0;i<12;i++){
      const k=6*i,l=4*i;
      side+=Math.abs(state[k+1]-lanes[l+1])/12;
      error+=Math.hypot(state[k]-lanes[l],state[k+1]-lanes[l+1],state[k+2]+3)/12;
      if(n<90)closest=Math.min(closest,Math.hypot(state[k]-shark.x,state[k+1]-shark.y,state[k+2]+3));
    }
    if(n===25)earlySide=side;
    finalLaneError=error;
  }
  return {closest,earlySide,finalLaneError};
}
const obstacleOnly=predatorPass(false),escaping=predatorPass(true);
assert(escaping.earlySide>obstacleOnly.earlySide+.55&&escaping.closest>obstacleOnly.closest+1);
assert(escaping.finalLaneError<.35,'school failed to reform after the predator departed');
const kinds=['shark','whale','gull','sub','manta','diver'];
const flags=new Float64Array(8);
schoolObstacles(kinds.map((kind,i)=>({kind,x:i*.1,y:0,z:-1})),0,0,-1,flags);
assert.deepEqual([...flags],[1,1,1,0,0,0,0,0]);
const before=Float64Array.from([0,0,-1,2,0,0]),out=Float64Array.from([.5,.2,-1,2,.8,0]);
const wall=(x,y,z,tx)=>x<.25&&tx>.25?{fraction:(.25-x)/(tx-x),nx:-1,ny:0,nz:0}:null;
assert.equal(protectWater(before,out,1,wall),1);assert(out[0]<.25&&out[1]>.19&&out[3]===0);
const surface=before.slice();surface[2]=1;surface[5]=2;
protectWater(before,surface,1);assert.equal(surface[2],-.12);assert.equal(surface[5],0);
// Probe the physical contact at a 1 ms step so active schooling changes
// positions by much less than the millimetre-scale contact tolerance.
const centeredBody=[0,0,.09], longFish=[.015,.065,.045];
function solverTrial(rows,bodies,actor,dt=.001){
  resetMuscles();
  const prior=new Float64Array(72),lanes=new Float64Array(48),shapes=new Float64Array(36);
  for(let i=0;i<12;i++){
    shapes.set(bodies[i]??centeredBody,3*i);
    if(i>=rows.length)continue;
    const row=rows[i];
    prior.set(row,6*i);
    lanes.set([...row.slice(0,3),Math.atan2(row[4],row[3])],4*i);
  }
  fish.set('prior',prior);fish.set('body',shapes);fish.set('guide',lanes);
  fish.set('active',Array.from({length:12},(_,i)=>Number(i<rows.length)));
  const obstacles=new Float64Array(8*13);
  if(actor)obstacles.set(actor);
  fish.set('actors',obstacles);fish.set('dt',dt);
  return Float64Array.from(fish.get('nextState'));
}
function contactGap(state,bodies,yaws){
  let nearest=Infinity;
  for(const a of [-1,0,1])for(const b of [-1,0,1]){
    const s=bodies[0][0]+a*bodies[0][1],t=bodies[1][0]+b*bodies[1][1];
    nearest=Math.min(nearest,Math.hypot(
      state[0]+s*Math.cos(yaws[0])-state[6]-t*Math.cos(yaws[1]),
      state[1]+s*Math.sin(yaws[0])-state[7]-t*Math.sin(yaws[1]),state[2]-state[8]
    )-bodies[0][2]-bodies[1][2]);
  }
  return nearest;
}
const noseStart=[[-.11,0,-3,.1,0,0],[.11,0,-3,-.1,0,0]],pairBodies=[longFish,longFish];
const initialNoseGap=contactGap(noseStart.flat(),pairBodies,[0,Math.PI]);
assert(initialNoseGap<-.025&&noseStart[1][0]-noseStart[0][0]>2*centeredBody[2]);
const noseResult=solverTrial(noseStart,pairBodies),finalNoseGap=contactGap(noseResult,pairBodies,[0,Math.PI]);
assert(finalNoseGap>=-1e-6,'opposed nose spheres remained overlapped');
assert(Math.abs(noseResult[0]+noseResult[6])<1e-5,'equal-mass nose contact moved the pair midpoint');
const sideStart=[[0,0,-3,.1,0,0],[0,.11,-3,.1,0,0]];
const sideResult=solverTrial(sideStart,pairBodies);
assert(Math.abs((sideResult[7]-sideResult[1])-.11)<.0001,'clear broadside fish repelled as if they had touching noses');
// Staggering by half a sphere spacing leaves a 2 mm gap between the
// lobes even though continuous capsules would overlap by 4 mm.
const staggered=[sideStart[0],[longFish[1]/2,.086,-3,.1,0,0]];
assert(contactGap(staggered.flat(),pairBodies,[0,0])>.001);
const lobeMiss=solverTrial(staggered,pairBodies);
assert(Math.abs((lobeMiss[7]-lobeMiss[1])-.086)<.0001,'the gaps between distinct spheres were filled in');
for(const sizes of [[longFish,[.015,.065,.08]],[[.015,.065,.08],longFish]]){
  assert(contactGap(sideStart.flat(),sizes,[0,0])<-.014);
  const result=solverTrial(sideStart,sizes);
  assert(contactGap(result,sizes,[0,0])>=-1e-6,'member-specific radius failed to separate a mixed-size pair');
}

// A narrow craft sweeps from x=−.36 to +.36 m at 6 m/s in one tick. Both ends
// clear all probes. Only the nose crosses the side of the moving hull.
const crossingActor=[-.36,0,-3,6,0,0,0,0,0,.20,.14,.14,.1];
const swimmer=[[0,.26,-3,0,-.10,0]],noseBody=[.025,.10,.05],pointBody=[0,0,.05];
const away=solverTrial(swimmer,[noseBody],undefined,.12);
const missed=solverTrial(swimmer,[pointBody],crossingActor,.12);
const hit=solverTrial(swimmer,[noseBody],crossingActor,.12);
assert(Math.hypot(missed[0]-away[0],missed[1]-away[1])<.015,'centered control unexpectedly hit the swept craft');
const sweptNoseDeflection=Math.hypot(hit[0]-missed[0],hit[1]-missed[1]);
assert(sweptNoseDeflection>.04,'craft traversed the nose between disjoint endpoints');

// Both centres clear this concrete plane even after inflation. The first
// fish faces +Y and reaches it with its leading sphere, the shorter fish
// continues swimming. The collision must preserve motion along the wall.
const wallY=.28;
function sphereWall(x,y,z,tx,ty,tz,radius){
  const limit=wallY-radius;
  if(y>=limit)return {fraction:0,nx:0,ny:-1,nz:0,penetration:y-limit};
  if(ty<=limit)return null;
  return {fraction:(limit-y)/(ty-y),nx:0,ny:-1,nz:0};
}
const wallStart=Float64Array.of(0,0,-3,0,.65,0,1,0,-3,0,.65,0);
const wallEnd=Float64Array.of(.08,.12,-3,.3,.65,0,1.08,.12,-3,.3,.65,0);
const wallBodies=Float64Array.of(...noseBody,0,.035,.035);
assert.equal(sphereWall(0,0,-3,.08,.12,-3,noseBody[2]),null);
assert.equal(protectWater(wallStart,wallEnd,2,sphereWall,wallBodies),1,'only the long fish nose should hit the wall');
assert(wallEnd[1]+noseBody[0]+noseBody[1]+noseBody[2]<=wallY+1e-6&&wallEnd[1]>.095);
assert(Math.abs(wallEnd[0]-.08)<.001&&Math.abs(wallEnd[3]-.3)<1e-9&&Math.abs(wallEnd[4])<1e-9);
assert.deepEqual([...wallEnd.slice(6)],[1.08,.12,-3,.3,.65,0]);

// An external policy commands muscles, without prescribing speed or heading.
// Exercise the public WASM interface with a free swimmer clear of all contacts.
function muscleTrial({effort=0,turn=0,elevation=0,current=[0,0,0],speed=0,phase=0,seconds=2,dt=.02}={}){
  const command=new Float64Array(48),shape=new Float64Array(36),motion=new Float64Array(48),state=new Float64Array(72);
  command.set([1,effort,turn,elevation]);shape.set([0,.075,.085]);motion.set([0,0,phase,1]);
  state.set([0,0,-3,speed+current[0],current[1],current[2]]);
  fish.set('active',[1,...Array(11).fill(0)]);fish.set('body',shape);fish.set('dt',dt);
  fish.set('actors',new Float64Array(104));fish.set('muscle',command);fish.set('waterVelocity',current);
  const mass=1025*.014*.32**3,inertia=.11*mass*.32**2;
  let peakForce=0,tail;
  for(let n=0;n<Math.round(seconds/dt);n++){
    fish.set('prior',state);fish.set('previousMotion',motion);
    const [next,pose,reaction,actuation]=fish.getMany(['nextState','nextMotion','waterReaction','tailActuation']);
    tail=actuation;
    for(let axis=0;axis<3;axis++)
      assert(Math.abs(mass*(next[3+axis]-state[3+axis])+dt*reaction[axis])<1e-10,'unbalanced fluid impulse');
    assert(Math.abs(inertia*(pose[1]-motion[1])+dt*reaction[3])<1e-10,'unbalanced yaw impulse');
    peakForce=Math.max(peakForce,Math.hypot(...reaction.slice(0,3)));
    state.set(next);motion.set(pose);
  }
  return {state,motion,peakForce,tail};
}
const resting=muscleTrial(),coast=muscleTrial({speed:1}),easy=muscleTrial({effort:.32});
const strong=muscleTrial({effort:.75}),turnPort=muscleTrial({effort:.52,turn:.18}),turnStarboard=muscleTrial({effort:.52,turn:-.18});
const climb=muscleTrial({elevation:.65}),descend=muscleTrial({elevation:-.65});
assert(resting.peakForce===0&&resting.state[0]===0&&coast.state[3]>0&&coast.state[3]<.6);
assert.equal(resting.tail[0],0);assert(Math.abs(easy.tail[0]-.2*.32*.32)<1e-10);
assert(Math.abs(strong.tail[0]-.2*.32*.75)<1e-10&&Math.abs(easy.tail[1]-1.65/.32)<1e-10);
const span=.48,tau=2*Math.PI,end=(.8+span*tau*easy.tail[1])%tau;
const frame={ma:[0,0,.8,1],mb:[0,0,end,1],ga:resting.tail,gb:easy.tail,span,t:.5};
const halfway=schoolStroke(frame,0),expected=(8-((.8/tau+.5*span*easy.tail[1])*8)%8)%8;
assert(Math.abs(halfway[0]-expected)<1e-10&&Math.abs(halfway[1]-.5*easy.tail[0])<1e-10);
assert.equal(schoolStroke({...frame,gb:null},0),null,'old checkpoint uses authored animation');
assert(easy.state[3]>.4&&strong.state[3]>easy.state[3]+.5,'stronger muscle activation should propel a faster fish');
assert(turnPort.state[1]>.4&&turnStarboard.state[1]<-.4&&turnPort.motion[1]>0&&turnStarboard.motion[1]<0);
assert(climb.state[2]>-2.8&&descend.state[2]<-3.2);
const along=[.31,-.14,.03],drifting=muscleTrial({effort:.32,current:along});
for(let i=0;i<3;i++){
  assert(Math.abs(drifting.state[i]-easy.state[i]-2*along[i])<1e-8,'uniform current should advect the trajectory');
  assert(Math.abs(drifting.state[i+3]-easy.state[i+3]-along[i])<1e-8);
}
const strokePeak=muscleTrial({effort:.55,phase:0,seconds:.001,dt:.001});
const strokeReversal=muscleTrial({effort:.55,phase:Math.PI/2,seconds:.001,dt:.001});
assert(strokePeak.peakForce>20*strokeReversal.peakForce,'tail phase must influence actual thrust');
fish.set('muscle',new Float64Array(48));fish.set('waterVelocity',[0,0,0]);
const memory={};
assert.equal(gullEscape([{id:'gull-1',kind:'gull',x:0,y:0,z:0}],'gull-1',[0,0,0,0],0,memory,.1)[0],0);
assert.deepEqual(gullEscape([{id:'boat',kind:'motorboat',x:-1,y:0,z:0}],'gull-1',[0,0,0,0],0,memory,.1),[1,.90,0,1]);
assert.equal(gullEscape([],'gull-1',[0,0,1.5,0],0,memory,.1)[0],1);
assert.equal(gullEscape([],'gull-1',[0,0,2,0],0,memory,4)[0],0);

const savedFetch=globalThis.fetch;globalThis.fetch=read;
const signal=new AbortController();
const floor=(x,y)=>-20;
const sweep=fishObstacles(floor,{height:floor},signal.signal);
const scanHits=[];
for(let trial=0;trial<100&&scanHits.length<2;trial++){
  await new Promise(r=>setTimeout(r,10));
  scanHits.length=0;
  for(const s of wreckSites){
    // Approach the midships plating broadside from open water above level bed.
    const z=floor()+1.8,hit=sweep(s.east,s.north-10,z,s.east,s.north,z,.1);
    if(hit){assert(hit.fraction>.1&&hit.fraction<.99);scanHits.push([s.id,hit.fraction]);}
  }
}
assert.equal(scanHits.length,2,'actual Satil and Yatush scan colliders loaded');
const bedHit=sweep(120,120,-19,120,120,-21,.1);
assert(Math.abs(bedHit.fraction-.45)<.002&&bedHit.nz>.99);
signal.abort();
const room={host:true,session:0,habitat:{restock:Array(72).fill(0)}},schools=harborSchools(room,()=>ground,()=>[]);
let t=0;while(!schools.advance(t)){await new Promise(r=>setTimeout(r,10));if(t>2)throw Error('school FMU not ready');t+=.01;}
const startTime=t;
for(let i=0;i<50;i++){t+=step;schools.advance(t);}
const snap=room.habitat.schoolSnapshot;
assert(validSchoolSnapshot(snap));assert(snap.motion.length===snap.count*12*8);assert.equal(snap.gait.length,snap.count*12*8/3);
assert(!validSchoolSnapshot({...snap,gait:'A'}));assert(!validSchoolSnapshot({...snap,motion:'A'}));assert(!validSchoolSnapshot({...snap,data:'A'}));
const actual=schools.bait(t,false),response=Float64Array.from(actual);
ground.set('useSchool',1);ground.set('swimmers',response);ground.set('clock',t);
assert.deepEqual([...ground.get('school')],[...response]);
ground.set('pose',[response[0]-2,response[1],response[2]+.14,0,0,0]);
ground.set('whale',0);assert.equal(ground.get('inMouth')[0],1);
const other=harborSchools({host:false,habitat:{schoolSnapshot:snap}},()=>ground,()=>[]);
const copied=other.bait(snap.time,false);
other.bait(snap.time,true);
assert(other.baitStrokes[1]>0&&other.baitStrokes[2]<-20,'received real actuator values');
assert.equal(copied.length,288);
for(const v of copied)assert(Number.isFinite(v));
// Exercise the actual peer presentation API with quantized velocity samples.
// A fish crosses the atan2 seam near west, then stops against a wall.
const makeFrame=(vx,vy,time)=>{
  const rows=new Int16Array(6*12*6);
  rows[3]=vx;rows[4]=vy;
  return {count:6,time,data:Buffer.from(rows.buffer).toString('base64')};
};
const peerRoom={host:false,habitat:{schoolSnapshot:makeFrame(-58,2,1)}};
const peer=harborSchools(peerRoom,()=>ground,()=>[]);
let stamp=0;
try{
  Object.defineProperty(performance,'now',{value:()=>stamp,configurable:true});
  const initialHeading=peer.bait(1,true)[3];
  peerRoom.habitat.schoolSnapshot=makeFrame(-58,-2,1.48);
  for(let i=0;i<=24;i++){stamp+=20;assert(Math.cos(peer.bait(1.48,true)[3])<-.99);}
  peerRoom.habitat.schoolSnapshot=makeFrame(0,0,1.96);
  for(let i=0;i<=30;i++){stamp+=20;assert(Math.cos(peer.bait(1.96,true)[3])<-.99);}
  const held=peer.bait(1.96,true)[3];
  assert(Math.abs(Math.sin(held-initialHeading))<.08);
}finally{delete performance.now;}
globalThis.fetch=savedFetch;
console.log({minScaledDistanceBaseline:control.minSide,minScaledDistanceAvoiding:maneuver.minSide,
  maxTurnDegrees:maxTurn*180/Math.PI,obstacleOnly,escaping,minFishSeparation:maneuver.minPair,initialNoseGap,finalNoseGap,sweptNoseDeflection,scanHits,fastCrossingEndX:through[0],checkpointBase64Chars:snap.data.length+snap.motion.length+snap.gait.length,coastSpeed:coast.state[3],easySpeed:easy.state[3],strongSpeed:strong.state[3],strokeForceRatio:strokePeak.peakForce/strokeReversal.peakForce,simulatedSeconds:t-startTime});
