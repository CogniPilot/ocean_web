import {waterStreaks} from './water-spray.mjs';
import {harborSchools} from './fish-schools.mjs';
import {birdMesh,GullTrack} from './gull.mjs';
import {loadInstance} from './fmi3/instance.mjs';

import {sampleLoads} from './wildlife-loads.mjs';

export function feedingHarbor(T,scene,room,playSound,gullEnvironment,sampleSurface,signal,nearbyActors,fishWaterLimits,sampleMappedCurrent){
  let school,loadingSchool,positions,stamp,hostModels,hostSession,lastSequence,authority,initialSounds;
  const soundPos=new T.Vector3(),birds=[];
  let footSpray,gullProperties;
  const footPoint=new T.Vector3();
  signal?.addEventListener('abort',()=>footSpray?.dispose(),{once:true});
  function takeoffSpray(bird,pose,time,level,push){
    if(push<.14)return;
    const heading=pose[3],forward=Math.cos(heading),port=Math.sin(heading);
    for(const foot of bird.feet){
      foot.getWorldPosition(footPoint);
      const height=footPoint.z-level;
      const elapsed=time-(foot.userData.sampleTime??time);
      const descent=elapsed>0&&elapsed<.15?(foot.userData.height-height)/elapsed:0;
      foot.userData.sampleTime=time;foot.userData.height=height;
      // Current packets carry joint/ankle telemetry. Spray only when the
      // visible web is pressing down through the local wave surface.
      const strength=pose.length>=91?push*Math.max(0,Math.min(1,descent/.8)):push;
      if(strength<.14||Math.abs(height)>.14||time<(foot.userData.nextSpray??0))continue;
      foot.userData.nextSpray=time+.12;
      footSpray??=waterStreaks(T,scene,'Gull takeoff spray',96);
      for(let j=0;j<5;j++){
        const angle=j*2.40+time*7+footPoint.y;
        const aft=.30+.25*strength+.24*Math.cos(angle),across=.48*Math.sin(angle);
        footSpray.emit(footPoint.x,footPoint.y,level+.006,time,-aft*forward-across*port,
          -aft*port+across*forward,.52+.48*strength+.10*j,.0014+j*.00021,level,.020);
      }
    }
  }
  function loadSchool(){
    loadingSchool??=loadInstance('FeedingGround',{}).then(m=>{school=m;}).catch(console.error);
  }
  const fishSchools=harborSchools(room,()=>{if(!school)loadSchool();return school;},nearbyActors,fishWaterLimits,sampleMappedCurrent);
  function setSchool(time){
    // Older recordings and the first loading frame retain their migration lane.
    const swimmers=fishSchools.bait(time,false);
    if(school.has('useSchool')){school.set('useSchool',Number(!!swimmers));if(swimmers)school.set('swimmers',swimmers);}
  }
  function observer(a,row,time){
    const whale=a.kind==='whale',i=whale?17:9;
    school.set('clock',time);setSchool(time);school.set('whale',Number(whale));
    school.set('pose',[row[i],row[i+1],row[i+2],row[i+3],row[whale?21:67]??0,whale?row[35]:0]);
    school.set('feedAge',a.feedAt==null?-1:time-a.feedAt);
  }
  function resetHostModels(){
    if(hostSession===room.session)return;
    hostModels=undefined;
    lastAnimalFrames.clear();
    hostSession=room.session;
  }
  function stepGulls(steps,background){
    resetHostModels();
    const h=room.habitat;
    const models=hostModels??=[],actors=nearbyActors?.()??[];
    h.gulls.forEach((row,i)=>{
      const {wind,gust,windGradient,seaLevel,waterSlope}=gullEnvironment(row[0],row[1],row[2]);
      const local=[0,0,0],current=sampleMappedCurrent?.([row[0],row[1],0],local)?local.slice(0,2):background;
      if(!models[i]){
        const state=row.slice(0,8),c=Math.cos(state[3]),n=Math.sin(state[3]);
        const legacy=row.length<=25;
        if(legacy)state[4]+=wind[0]*c+wind[1]*n;
        const slot=models[i]={level:seaLevel};
        loadInstance('HerringGull',{offset:i%3,startState:state,startSide:legacy?-wind[0]*n+wind[1]*c:row[85],wind,gust,windGradient,seaLevel,waterSlope,waterCurrent:current,
          startWaterMode:row[22]??(row[19]>.45||row[2]<seaLevel+.07?2:0),
          ...(row.length>=98?{startTail:row.slice(93,98)}:{}),
          ...(row.length>=92?{startWake:row[91]}:{}),
          ...(row.length>=89?{startPaddle:row.slice(86,89)}:{}),
          ...(row.length>=86?{startJoints:row.slice(25,37),startFlow:row.slice(37,85)}:{}),
          ...(row.length>=19?{startMemory:row.slice(12,19)}:{})})
          .then(m=>{slot.model=m;}).catch(e=>{console.error(e);delete models[i];});
      }
      const slot=models[i],m=slot.model;
      if(!m||steps===0)return;
      m.set('windGradient',windGradient);m.set('wind',wind);m.set('gust',gust);m.set('waterSlope',waterSlope);m.set('waterCurrent',current);
      const delta=seaLevel-slot.level;
      m.set('surfaceVerticalSpeed',Math.max(-2,Math.min(2,delta/(.01*steps))));
      const id='gull-'+(i+1);
      if(room.seat(id)){
        const {axes:[turn,climb,flap],bank}=room.command(id);
        m.set('pilot',[1,climb,Math.max(-1,Math.min(1,turn-bank)),flap]);
      }else{
        const escape=gullEscape(actors,id,row,seaLevel,slot,steps*.01);
        m.set('pilot',escape);
      }
      for(let j=1;j<=steps;j++){
        m.set('seaLevel',slot.level+j*delta/steps);
        m.advance(.01);
      }
      slot.level=seaLevel;
      if(room.wantsLoads(id))room.publishLoads(id,sampleLoads(m,'gull'));
      h.gulls[i]=m.getMany(['x','wings','memory','surfaceMotion','joints','flowMemory','lateralSpeed','paddleState','webSpread','launchWakePower','tailState']).flat();
    });
  }
  function step(t,row,previous){
    resetHostModels();
    const h=room.habitat,priorTime=h.time??t,animalTime=row?.[0]??t;
    h.time=t;
    const called=room.takeCall(),index=called??Math.floor(t/26)%Math.max(1,h.gulls.length);
    if(h.gulls[index]&&(called!=null||Math.floor(priorTime/26)<Math.floor(t/26)))
      room.sound('gull',t,h.gulls[index].slice(0,3),called!=null?1:.8);
    for(const a of room.animals.values()){
      if(a.kind!=='shark'&&a.kind!=='whale')continue;
      const frame=a.frame??row;
      if(!frame||a.id!==a.kind&&!a.frame)continue;
      const old=lastAnimalFrames.get(a.id)??(a.id===a.kind?previous:null);
      if(a.kind==='whale'&&old){
        if(frame[22]>=0&&old[22]<0)room.sound('spout',t,frame.slice(17,20),1);
        if(frame[60]>old[60]&&frame[64]>1.2)room.sound('impact',t,frame.slice(61,64),Math.min(1.5,frame[64]/3));
      }
      // Extra animals have independent simulation clocks. Keep the prior event
      // sample locally, outside the roster that is sent over the network.
      lastAnimalFrames.set(a.id,frame);
      const attempt=a.feedingAttempt;
      if(!a.seat&&attempt&&(a.feedAt==null||animalTime-a.feedAt>(a.kind==='whale'?5:3)))a.feedAt=animalTime;
      if(a.feedAt==null){a.gape=0;continue;}
      if(!school){loadSchool();continue;}
      observer(a,frame,animalTime);
      const [gape,capture,inside]=school.getMany(['gape','capture','inMouth']);
      a.gape=gape;
      if(!capture||(a.kind==='shark'&&a.lastBite===a.feedAt))continue;
      for(let i=0;i<inside.length;i++){
        if(!inside[i]||h.restock[i]>animalTime)continue;
        h.restock[i]=animalTime+18+1.3*(i%8);a.caught=(a.caught??0)+1;
        if(a.kind==='shark'){a.lastBite=a.feedAt;break;}
      }
    }
  }
  const lastAnimalFrames=new Map();
  function draw(time,now){
    if(!room.host){hostModels=undefined;lastAnimalFrames.clear();}
    const h=room.habitat;
    while(birds.length<h.gulls.length){
      const bird=birdMesh(T,birds.length);
      gullProperties??=loadInstance('HerringGull',{}).then(m=>({bodies:[...m.get('bodyProperties'),...m.get('tailProperties')],products:m.get('wingProducts')}));
      gullProperties.then(({bodies,products})=>bird.setBodyProperties(bodies,products)).catch(error=>console.warn('Gull inertia',error));
      bird.track=new GullTrack();birds.push(bird);scene.add(bird.group);
    }
    for(let i=0;i<birds.length;i++){
      const b=birds[i],next=h.gulls[i];
      if(!next){b.group.visible=false;b.track.clear();b.reset();continue;}
      b.track.receive(next,now);
      const pose=b.track.at(now,room.host?42:150);
      const level=sampleSurface(pose[0],pose[1]);
      takeoffSpray(b,pose,time,level,b.draw(pose,time,level));
    }
    footSpray?.draw(time);
    if(initialSounds!==true||authority!==room.soundOwner){
      lastSequence=h.sequence;authority=room.soundOwner;initialSounds=true;
    }
    for(const [id,t,kind,x,y,z,gain] of h.sounds){
      if(id>lastSequence&&time-t<1.8)playSound(kind,soundPos.set(x,y,z),gain);
    }
    lastSequence=h.sequence;
  }
  function fish(time){
    if(!school){loadSchool();return;}
    if(stamp!==time){school.set('clock',time);positions=fishSchools.bait(time,true)??school.get(school.has('migration')?'migration':'school');stamp=time;}
    return {positions,strokes:fishSchools.baitStrokes,restock:room.habitat.restock,time};
  }
  function prey(a,frame,time){
    if(a.kind!=='shark'&&a.kind!=='whale')return [0,0,0,0,0];
    if(!school){loadSchool();return [0,0,0,0,0];}
    observer(a,frame,time);
    school.set('restock',room.habitat.restock);
    return school.get('prey');
  }
  function ping(a,frame,time){
    if(!school||!frame||(a.kind!=='shark'&&a.kind!=='whale'))return;
    observer(a,frame,time);
    return school.get('returns');
  }
  return {step,stepGulls,draw,fish,ping,prey,fishSchools,advanceSchool:fishSchools.advance,gull(index){return birds[index]?.group;}};
}


// Only autonomous gulls receive escape commands. Once airborne, keep the
// departure course briefly so short gaps in peer snapshots cannot cancel takeoff.
export function gullEscape(actors,id,row,level,memory,dt){
  let nearest,best=Infinity;
  for(const a of actors){
    if(a.id===id||!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Number.isFinite(a.z))continue;
    const dx=row[0]-a.x-.4*(a.ve??0),dy=row[1]-a.y-.4*(a.vn??0),dz=row[2]-a.z;
    const range=a.kind==='gull'?2.4:a.kind==='drone'?7:a.kind==='whale'?11:7;
    const score=Math.hypot(dx,dy,1.4*dz)/range;
    if(score<1&&score<best){nearest={dx,dy};best=score;}
  }
  if(nearest){
    memory.escapeHeading=Math.hypot(nearest.dx,nearest.dy)>.08?Math.atan2(nearest.dy,nearest.dx):row[3]+1.0;
    memory.escapeSeconds=row[2]<level+.65?2.4:1.0;
  }else memory.escapeSeconds=Math.max(0,(memory.escapeSeconds??0)-dt);
  if(!memory.escapeSeconds)return [0,0,0,0];
  const error=memory.escapeHeading-row[3];
  return [1,row[2]<level+2.0?.90:.36,Math.max(-1,Math.min(1,1.3*Math.atan2(Math.sin(error),Math.cos(error)))),1];
}
