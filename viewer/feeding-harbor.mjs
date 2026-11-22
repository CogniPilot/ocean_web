import {birdMesh} from './gull.mjs';
import {loadInstance} from './fmi3/instance.mjs';

export function feedingHarbor(T,scene,room,playSound){
  let school,loadingSchool,positions,stamp,hostModels,hostSession,lastSequence,authority,initialSounds;
  const soundPos=new T.Vector3(),birds=[];
  function loadSchool(){
    loadingSchool??=loadInstance('FeedingGround',{}).then(m=>{school=m;}).catch(console.error);
  }
  function observer(a,row,time){
    const whale=a.kind==='whale',i=whale?17:9;
    school.set('clock',time);school.set('whale',Number(whale));
    school.set('pose',[row[i],row[i+1],row[i+2],row[i+3],row[whale?21:67]??0,whale?row[35]:0]);
    school.set('feedAge',a.feedAt==null?-1:time-a.feedAt);
  }
  function step(t,row,previous,steps,wind,level){
    const h=room.habitat,priorTime=h.time??t;
    const animalTime=row?.[0]??t;
    h.time=t;
    if(hostSession!==room.session){hostModels=undefined;lastAnimalFrames.clear();hostSession=room.session;}
    const models=hostModels??=[];
    h.gulls.forEach((row,i)=>{
      if(!models[i]){
        const slot=models[i]={};
        loadInstance('HerringGull',{offset:i%3,startState:row.slice(0,8),...(row.length===19?{startMemory:row.slice(12)}:{})})
          .then(m=>{slot.model=m;}).catch(e=>{console.error(e);delete models[i];});
      }
      const m=models[i].model;if(!m)return;
      m.set('wind',wind);m.set('seaLevel',level);
      for(let j=0;j<steps;j++)m.advance(.01);
      h.gulls[i]=m.getMany(['x','wings','memory']).flat();
    });
    const called=room.takeCall(),index=called??Math.floor(t/26)%Math.max(1,h.gulls.length);
    if(h.gulls[index]&&(called!=null||Math.floor(priorTime/26)<Math.floor(t/26)))
      room.sound('gull',t,h.gulls[index].slice(0,3),called!=null?1:.8);
    for(const a of room.animals.values()){
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
      if(!a.seat||a.feedAt==null){a.gape=0;continue;}
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
  function draw(time,f){
    if(!room.host){hostModels=undefined;lastAnimalFrames.clear();}
    const h=room.habitat;
    while(birds.length<h.gulls.length){
      const bird=birdMesh(T);birds.push(bird);scene.add(bird.group);
    }
    for(let i=0;i<birds.length;i++){
      const next=h.gulls[i];if(!next){birds[i].group.visible=false;continue;}
      const b=birds[i];
      if(next!==b.next){b.old=b.next??next;b.next=next;}
      b.draw(next.slice(0,12).map((x,j)=>b.old[j]+(x-b.old[j])*f));
    }
    if(initialSounds!==true||authority!==room.soundOwner){
      lastSequence=h.sequence;authority=room.soundOwner;initialSounds=true;
    }
    for(const [id,t,kind,x,y,z,gain] of h.sounds){
      if(id>lastSequence&&time-t<1.8)playSound(kind,soundPos.set(x,y,z),gain);
    }
    lastSequence=h.sequence;
  }
  function fish(time){
    if(!room.animals.size)return;
    if(!school){
      for(const animal of room.animals.values())if(!animal.player){loadSchool();break;}
    }
    if(!school)return;
    if(stamp!==time){school.set('clock',time);positions=school.get('school');stamp=time;}
    return {positions,restock:room.habitat.restock,time};
  }
  function ping(a,frame,time){
    if(!school||!frame)return;
    observer(a,frame,time);
    return school.get('returns');
  }
  return {step,draw,fish,ping,gull(index){return birds[index]?.group;}};
}
