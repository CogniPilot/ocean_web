import {sharkExtents} from './shark-contact.mjs';
import {fishBodyShape,baitfishScale} from './fish-body.mjs';
import {loadInstance} from './fmi3/instance.mjs';

const fishCount=12, stride=6, fixedStep=.12, checkpointPeriod=.48;
const arc=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const swimming=(state,k)=>state[k+3]**2+state[k+4]**2>.07**2;
// Conservative finite body envelopes (half axes in metres, plus the alert range).
const clearance={
  sub:[.58,.39,.32,3.3],motorboat:[5.25,1.94,1.38,5.8],boat:[3.5,2.05,.92,4.5],
  sloop:[5.8,2.1,2.4,6.0],whale:[5.50,2.9,1.6,8.0],shark:[...sharkExtents,6.2],
  diver:[1.14,.31,.30,2.1],manta:[3.75,3.14,.66,5.4],gull:[.49,1,.35,1.6],drone:[.45,.45,.30,1.5]
};
function actorBody(a){
  return a.kind==='hobie'?clearance.boat:a.hull===2?clearance.sloop:clearance[a.kind]??(a.hull===3?clearance.motorboat:a.hull===1?clearance.boat:null);
}

export function schoolObstacles(actors,x,y,z,predators){
  const nearest=[];
  predators?.fill(0);
  for(const actor of actors){
    const axes=actorBody(actor);
    if(!axes||![actor.x,actor.y,actor.z].every(Number.isFinite))continue;
    const speed=Math.hypot(actor.ve??0,actor.vn??0,actor.vu??actor.vz??0);
    const distance=Math.hypot(actor.x-x,actor.y-y,actor.z-z);
    if(distance>Math.max(...axes)+8+.65*speed)continue;
    nearest.push({actor,axes,distance});
  }
  nearest.sort((a,b)=>a.distance-b.distance||String(a.actor.id).localeCompare(String(b.actor.id)));
  const rows=new Float64Array(8*13);
  nearest.slice(0,8).forEach(({actor:a,axes},j)=>{
    if(predators)predators[j]=Number(a.kind==='shark'||a.kind==='whale'||a.kind==='gull');
    // The tail projects farther aft than the head. During intake the lips
    // stay open for the FeedingGround mouth-volume test.
    const mouthCut=(a.gape??0)>.3?(a.kind==='whale'?1.05:a.kind==='shark'?.55:0):0;
    const shift=(a.kind==='whale'?-1.3:0)-mouthCut/2;
    const yaw=a.yaw??0,pitch=a.pitch??0,h=shift*Math.cos(pitch);
    rows.set([a.x+h*Math.cos(yaw),a.y+h*Math.sin(yaw),a.z-shift*Math.sin(pitch),
      a.ve??0,a.vn??0,a.vu??a.vz??0,yaw,pitch,a.heel??0,axes[0]-mouthCut/2,axes[1],axes[2],axes[3]],13*j);
  });
  return rows;
}

function schoolCheckpoint(groups,time){
  // Centimetre positions and cm/s velocities cover the harbor in signed Int16.
  const data=new Int16Array(groups.length*fishCount*stride);
  let offset=0;
  for(const g of groups){
    for(const v of g.state)data[offset++]=Math.max(-32767,Math.min(32767,Math.round(100*v)));
  }
  const raw=new Uint8Array(data.buffer);
  const frame={time,count:groups.length,data:btoa(String.fromCharCode(...raw))};
  if(groups.some(g=>g.motion)){
    // An invalid phase marks an uninitialized member. Scale gives 1 mrad
    // orientation/phase resolution and 0.001 rad/s yaw-rate resolution.
    const packed=new Int16Array(groups.length*fishCount*3);
    for(const [id,g] of groups.entries())for(let i=0;i<fishCount;i++){
      const k=3*(fishCount*id+i),m=g.motion,j=4*i;
      if(!m||m[j+3]<.5){packed[k+2]=-1;continue;}
      for(let b=0;b<3;b++)packed[k+b]=Math.max(-32767,Math.min(32767,Math.round(m[j+b]*1000)));
    }
    frame.motion=btoa(String.fromCharCode(...new Uint8Array(packed.buffer)));
  }
  if(groups.some(g=>g.gait)){
    // Millimetres of tail excursion and cycles/second in 1/25 Hz increments.
    const bytes=new Uint8Array(groups.length*fishCount*2);
    for(const [id,g] of groups.entries())if(g.gait)for(let i=0;i<fishCount;i++){
      const k=2*(fishCount*id+i);
      bytes[k]=Math.min(255,Math.round(1000*g.gait[2*i]));
      bytes[k+1]=Math.min(255,Math.round(25*g.gait[2*i+1]));
    }
    frame.gait=btoa(String.fromCharCode(...bytes));
  }
  return frame;
}

export function validSchoolSnapshot(frame){
  return frame&&Number.isFinite(frame.time)&&frame.time>=0&&Number.isInteger(frame.count)&&
    frame.count>=6&&frame.count<=32&&typeof frame.data==='string'&&
    frame.data.length===frame.count*fishCount*stride*2*4/3&&/^[A-Za-z0-9+/]+$/.test(frame.data)&&
    (frame.motion===undefined||(typeof frame.motion==='string'&&frame.motion.length===frame.count*fishCount*8&&/^[A-Za-z0-9+/]+$/.test(frame.motion)))&&
    (frame.gait===undefined||(typeof frame.gait==='string'&&frame.gait.length===frame.count*fishCount*8/3&&/^[A-Za-z0-9+/]+$/.test(frame.gait)));
}

function fromFrame(frame){
  const bytes=Uint8Array.from(atob(frame.data),c=>c.charCodeAt(0)),packed=new Int16Array(bytes.buffer);
  return Array.from({length:frame.count},(_,g)=>Float64Array.from(
    packed.subarray(g*fishCount*stride,(g+1)*fishCount*stride),x=>x*.01));
}

function motionFromFrame(frame){
  if(!frame.motion)return undefined;
  const words=new Int16Array(Uint8Array.from(atob(frame.motion),c=>c.charCodeAt(0)).buffer);
  return Array.from({length:frame.count},(_,id)=>{
    const motion=new Float64Array(fishCount*4);
    for(let i=0;i<fishCount;i++){
      const k=3*(fishCount*id+i),j=4*i;
      if(words[k+2]<0)continue;
      motion[j]=words[k]*.001;motion[j+1]=words[k+1]*.001;motion[j+2]=words[k+2]*.001;motion[j+3]=1;
    }
    return motion;
  });
}

function gaitFromFrame(frame){
  if(!frame.gait)return undefined;
  const bytes=Uint8Array.from(atob(frame.gait),c=>c.charCodeAt(0));
  return Array.from({length:frame.count},(_,id)=>Float64Array.from(
    bytes.subarray(id*fishCount*2,(id+1)*fishCount*2),(value,k)=>k%2?value/25:value/1000));
}

// A peer checkpoint can span several complete beats. Use the measured beat
// rate to choose the correct turn count before interpolating the two phases.
export function schoolStroke(packet,i){
  const j=4*i,k=2*i,frequency=packet.gb?.[k+1];
  if(!(frequency>0&&packet.mb?.[j+3]>.5))return null;
  const tau=2*Math.PI,end=packet.mb[j+2],t=packet.t;
  let phase=end,amplitude=packet.gb[k];
  if(packet.span>0&&packet.ma?.[j+3]>.5){
    const start=packet.ma[j+2],delta=end-start;
    phase=start+t*(delta+tau*Math.round(frequency*packet.span-delta/tau));
    if(packet.ga)amplitude=packet.ga[k]+t*(amplitude-packet.ga[k]);
  }
  // Our authored tail starts by moving starboard. Positive solver phase
  // sweeps the tail to port. A frame unit is one eighth of a full cycle.
  return [(-phase*8/tau%8+8)%8,amplitude,-8*frequency];
}

function reefGuide(s,time,terrain,coral){
  const angle=time*s.speed+s.offset,yaw=Math.atan2(1.28*Math.cos(angle),-2.45*Math.sin(angle));
  const f=Math.cos(yaw),l=Math.sin(yaw),guide=new Float64Array(fishCount*4);
  for(let j=0;j<s.members.length;j++){
    const a=s.members[j],lane=a.cross+.11*Math.sin(1.2*time+a.offset);
    const x=s.cx+2.45*Math.cos(angle)+a.along*f-lane*l;
    const y=s.cy+1.28*Math.sin(angle)+a.along*l+lane*f;
    const z=Math.min(-.65,terrain.height(x,y)+(s.rise??0)+a.up+.22*Math.sin(.6*time+a.offset)+.32);
    const east=terrain.center[0]+x,north=terrain.center[1]+y;
    const crown=coral?.top(east,north,.28)??-Infinity;
    guide.set([east,north,Math.max(z,crown+.22),yaw],4*j);
  }
  return guide;
}

function seed(guide,active){
  const state=new Float64Array(fishCount*stride);
  for(let i=0;i<fishCount;i++)if(active[i]){
    const k=4*i;state.set([guide[k],guide[k+1],guide[k+2],.53*Math.cos(guide[k+3]),.53*Math.sin(guide[k+3]),0],stride*i);
  }
  return state;
}

// Hold the body's heading for the synchronous step, as in FishSchool.advanceSchool.
function sweepBody(sweep,x,y,z,tx,ty,tz,cosYaw,sinYaw,center,span,radius){
  if(!sweep)return null;
  let first=null;
  for(let j=span===0?0:-1;j<=(span===0?0:1);j++){
    const offset=center+j*span,dx=cosYaw*offset,dy=sinYaw*offset;
    const hit=sweep(x+dx,y+dy,z,tx+dx,ty+dy,tz,radius);
    if(hit&&(!first||hit.fraction<first.fraction||
       (hit.fraction===first.fraction&&hit.penetration>first.penetration)))first=hit;
  }
  return first;
}

export function protectWater(old,next,count,sweep,bodies,active,motion){

  let collisions=0;
  for(let i=0;i<count;i++){
    if(active&&!active[i])continue;
    const k=i*stride,p=old.subarray(k,k+3),q=next.subarray(k,k+3);
    const center=bodies?.[3*i]??0,span=bodies?.[3*i+1]??0,radius=bodies?.[3*i+2]??.09;
    const heading=motion?.[4*i+3]>.5?motion[4*i]:Math.atan2(old[k+4],old[k+3]);
    const cosYaw=Math.cos(heading),sinYaw=Math.sin(heading);
    const maxZ=-radius-.03;
    if(q[2]>maxZ){q[2]=maxZ;next[k+5]=Math.min(0,next[k+5]);}
    const hit=sweepBody(sweep,p[0],p[1],p[2],q[0],q[1],q[2],cosYaw,sinYaw,center,span,radius);
    if(!hit)continue;
    collisions++;
    const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2];
    const f=Math.max(0,Math.min(1,hit.fraction)-.001);
    const dot=dx*hit.nx+dy*hit.ny+dz*hit.nz;
    const offset=.003+(hit.penetration??0);
    let x=p[0]+f*dx+offset*hit.nx,y=p[1]+f*dy+offset*hit.ny,z=p[2]+f*dz+offset*hit.nz;
    // Continue tangentially along the wall, after checking the redirected sweep too.
    const tx=x+(1-f)*(dx-Math.min(0,dot)*hit.nx);
    const ty=y+(1-f)*(dy-Math.min(0,dot)*hit.ny);
    const tz=z+(1-f)*(dz-Math.min(0,dot)*hit.nz);
    if(!sweepBody(sweep,x,y,z,tx,ty,tz,cosYaw,sinYaw,center,span,radius)){x=tx;y=ty;z=tz;}
    q.set([x,y,z]);
    const vdot=Math.min(0,next[k+3]*hit.nx+next[k+4]*hit.ny+next[k+5]*hit.nz);
    next[k+3]-=vdot*hit.nx;next[k+4]-=vdot*hit.ny;next[k+5]-=vdot*hit.nz;
  }
  return collisions;
}

export function harborSchools(room,ground,nearbyActors,sweep,sampleMappedCurrent){
  let solver,loading,nextRetry=0,layout=[],terrain,coral,groups=[],session=-1,clock,checkpoint=-Infinity;
  let previousPacket,latestPacket,arrival=0,wasHost=false;
  const display=[],predators=new Float64Array(8);
  const projection=new Float64Array(72*4),baitStrokes=new Float32Array(72*3).fill(-1);
  const all=Array(fishCount).fill(1);
  function prepare(){
    if(!loading&&performance.now()>=nextRetry){
      loading=loadInstance('FishSchool',{}).then(m=>{solver=m;})
        .catch(error=>{console.warn('Fish schooling unavailable',error);loading=undefined;nextRetry=performance.now()+3000;});
    }
  }
  function receive(){
    const shot=room.habitat.schoolSnapshot;
    if(shot&&(!latestPacket||shot.time!==latestPacket.time)){
      const states=fromFrame(shot);
      previousPacket=latestPacket;latestPacket={time:shot.time,states,motion:motionFromFrame(shot),gait:gaitFromFrame(shot)};arrival=performance.now();
    }
  }
  function run(at,step,feeding,actors,current){
    const articulated=solver.has('previousMotion');
    const background=[current?.[0]??0,current?.[1]??0,current?.[2]??0],local=[0,0,0];
    feeding.set('clock',at);const lanes=feeding.get('migration');
    for(let id=0;id<6+layout.length;id++){
      const reef=id>=6?layout[id-6]:null,count=reef?reef.members.length:12;
      const guide=reef?reefGuide(reef,at,terrain,coral):lanes.slice(id*48,(id+1)*48);
      const active=reef?all.map((_,i)=>Number(i<count)):all.map((_,i)=>Number(room.habitat.restock[12*id+i]<=at));
      if(!groups[id]){
        const stored=latestPacket?.states[id];
        const bodies=new Float64Array(fishCount*3);
        for(let i=0;i<count;i++){
          const shape=reef?fishBodyShape(reef.species,reef.members[i].scale):fishBodyShape('bait',baitfishScale(id*fishCount+i));
          bodies.set(shape,i*3);
        }
        groups[id]={state:stored??seed(guide,all),before:null,count,bodies,gait:latestPacket?.gait?.[id],motion:articulated?(latestPacket?.motion?.[id]??new Float64Array(fishCount*4)):undefined};
      }
      const g=groups[id],last=g.state;
      if(g.active&&active.some((v,i)=>v&&!g.active[i])){
        const restocked=seed(guide,active);
        for(let i=0;i<count;i++)if(active[i]&&!g.active[i]){last.set(restocked.subarray(i*6,i*6+6),i*6);g.motion?.fill(0,4*i,4*i+4);}
      }
      g.active=active;
      let x=0,y=0,z=0,live=0;
      for(let i=0;i<count;i++)if(active[i]){x+=last[i*6];y+=last[i*6+1];z+=last[i*6+2];live++;}
      if(!live){g.before=g.state;continue;}
      if(articulated){
        const mapped=sampleMappedCurrent?.([x/live,y/live,z/live],local);
        solver.set('waterVelocity',mapped?local:background);
      }
      if(sweep&&(!g.wallThreat||at>=g.lookAgain)){
        const wall=g.wallThreat??=new Float64Array(36);
        wall.fill(0);g.lookAgain=at+.24-1e-7;
        for(let i=0;i<count;i++)if(active[i]){
          const k=i*6,px=last[k],py=last[k+1],pz=last[k+2];
          // A single enclosing sphere is sufficient for the anticipatory steering cue.
          const b=3*i,reach=Math.abs(g.bodies[b])+g.bodies[b+1]+g.bodies[b+2];
          const hit=sweep(px,py,pz,px+.72*last[k+3],py+.72*last[k+4],pz+.72*last[k+5],reach);
          if(hit){
            const weight=1-hit.fraction;
            wall.set([hit.nx*weight,hit.ny*weight,hit.nz*weight],3*i);
          }
        }
      }
      if(g.wallThreat)solver.set('wallThreat',g.wallThreat);
      solver.set('body',g.bodies);
      solver.set('guide',guide);solver.set('prior',last);solver.set('active',active);
      solver.set('actors',schoolObstacles(actors,x/live,y/live,z/live,predators));
      if(solver.has('predator'))solver.set('predator',predators);
      solver.set('dt',step);
      if(articulated)solver.set('previousMotion',g.motion);
      const [state,pose,gait]=articulated?solver.getMany(solver.has('tailActuation')?
        ['nextState','nextMotion','tailActuation']:['nextState','nextMotion']):[solver.get('nextState')];
      const next=Float64Array.from(state);
      protectWater(last,next,count,sweep,g.bodies,active,g.motion);
      g.beforeMotion=g.motion;g.motion=pose;g.beforeGait=g.gait;g.gait=gait;
      g.before=last;g.state=next;
    }
  }
  function advance(time,current){
    if(!room.host){wasHost=false;return false;}
    if(!Number.isFinite(time))return false;
    if(session!==room.session||clock!==undefined&&time<clock-.3){
      session=room.session;clock=undefined;groups=[];checkpoint=-Infinity;latestPacket=previousPacket=null;
      display.length=0;
    }
    if(!wasHost){clock=undefined;groups=[];checkpoint=-Infinity;wasHost=true;}
    const feeding=ground();if(!feeding?.has('migration'))return false;
    if(!solver){prepare();return false;}
    // Resumption after a hidden/background tab cannot request unbounded catchup.
    const prior=clock??(time-fixedStep);
    if(time-prior<fixedStep-1e-7)return false;
    clock=Math.max(prior,time-.48);
    const actors=nearbyActors?.()??[];
    if(!groups.length)receive();
    while(clock+fixedStep<=time+1e-7){clock+=fixedStep;run(clock,fixedStep,feeding,actors,current);}
    if(clock-checkpoint<checkpointPeriod-1e-7)return false;
    checkpoint=clock;room.habitat.schoolSnapshot=schoolCheckpoint(groups,clock);return true;
  }
  function read(id,now,interpolate){
    const track=interpolate?(display[id]??=Array(fishCount)):null;
    if(room.host){
      const g=groups[id];if(!g)return null;
      const t=Math.max(0,Math.min(1,(now-clock)/fixedStep));
      return {a:interpolate?g.before:g.state,b:g.state,ma:interpolate?g.beforeMotion:g.motion,mb:g.motion,ga:g.beforeGait,gb:g.gait,span:fixedStep,t:interpolate?t:1,track,now};
    }
    wasHost=false;receive();const b=latestPacket?.states[id];if(!b)return null;
    const a=previousPacket?.states[id]??b;
    const span=latestPacket.time-(previousPacket?.time??latestPacket.time);
    const wall=performance.now()/1000;
    const t=span>0?Math.max(0,Math.min(1,(wall-arrival/1000)/span)):1;
    return {a,b,ma:previousPacket?.motion?.[id],mb:latestPacket.motion?.[id],ga:previousPacket?.gait?.[id],gb:latestPacket.gait?.[id],span,t:interpolate?t:1,track,now:wall};
  }
  function position(p,i){
    const a=p.a??p.b,b=p.b,k=6*i,t=p.t;
    const lerp=j=>a[k+j]+t*(b[k+j]-a[k+j]);
    const j=4*i;
    if(p.mb?.[j+3]>.5){
      const bYaw=p.mb[j],aYaw=p.ma?.[j+3]>.5?p.ma[j]:bYaw;
      return [lerp(0),lerp(1),lerp(2),aYaw+t*arc(bYaw-aYaw)];
    }
    const yawB=Math.atan2(b[k+4],b[k+3]);
    if(!p.track)return [lerp(0),lerp(1),lerp(2),yawB];
    const previous=p.track[i];
    // Interpolate directions across the shortest arc. Opposing velocity
    // vectors interpolate through a standstill, where atan2 is undefined.
    const yawA=swimming(a,k)?Math.atan2(a[k+4],a[k+3]):previous?.yaw??yawB;
    const target=swimming(b,k)?yawA+t*arc(yawB-yawA):yawA;
    let yaw=target;
    if(previous&&p.now>=previous.time&&p.now-previous.time<.6){
      const dt=p.now-previous.time;
      // Contact impulses may reverse velocity in one tick. Allow the visible
      // body to turn through the collision instead of flipping instantaneously.
      const turn=arc(target-previous.yaw)*(1-Math.exp(-dt/.07));
      yaw=previous.yaw+Math.max(-4.8*dt,Math.min(4.8*dt,turn));
    }
    if(previous){previous.time=p.now;previous.yaw=yaw;}
    else p.track[i]={time:p.now,yaw};
    return [lerp(0),lerp(1),lerp(2),yaw];
  }
  function bait(time,smooth){
    for(let j=0;j<6;j++){
      const packet=read(j,time,smooth);if(!packet)return null;
      for(let i=0;i<12;i++){
        const index=j*12+i;
        projection.set(position(packet,i),4*index);
        if(smooth){
          const stroke=schoolStroke(packet,i);
          if(stroke)baitStrokes.set(stroke,3*index);
          else baitStrokes[3*index+1]=-1;
        }
      }
    }
    return projection;
  }
  return {advance,bait,baitStrokes,stroke:schoolStroke,registerReef(shoals,ground,obstacles){layout=shoals;terrain=ground;coral=obstacles;},
    reef(id,time){return read(6+id,time,true);},position};
}
