import {applyRiderPose,hookAbovePiccard} from './piccard-hoist.mjs';
// Aft port davit in cruiser forward, port and up metres.
export const liftX=-2.78,hingeY=1.18,subKeel=.09325,davitReach=1.05,tipZ=2.12,bridleHeight=hookAbovePiccard;
const travelSeconds=8, reservationMs=3000;
function smooth(level,begin,end){
  const t=Math.max(0,Math.min(1,(level-begin)/(end-begin)));
  return [t*t*(3-2*t),6*t*(1-t)/(end-begin)];
}

// The nominal hook follows payout at the two stops and slews at constant
// elevation between them. The coupled solver additionally resolves line stretch.
export function liftMechanism(level){
  const [raise,dr]=smooth(level,0,.38),[swing,dt]=smooth(level,.38,.74),[settle,ds]=smooth(level,.74,1);
  const [slack]=smooth(level,.92,1);
  const slew=Math.PI*swing,angular=Math.PI*dt,c=Math.cos(slew),s=Math.sin(slew);
  const padZ=-.34+1.61*raise+(.64+subKeel-1.27)*settle;
  return {padX:liftX-davitReach*s,padY:hingeY+davitReach*c,padZ,slew,
    paid:tipZ-padZ-bridleHeight+.04*slack,dx:-davitReach*c*angular,dy:-davitReach*s*angular,
    dz:1.61*dr+(.64+subKeel-1.27)*ds};
}

export function liftPose(boat,fraction,goal=fraction,rate=Math.sign(goal-fraction)/travelSeconds){
  const mech=liftMechanism(fraction),y=mech.padY,z=mech.padZ,cy=Math.cos(boat.yaw),sy=Math.sin(boat.yaw);
  const cp=Math.cos(boat.pitch),sp=Math.sin(boat.pitch),cr=Math.cos(boat.heel),sr=Math.sin(boat.heel);
  // World directions of the cruiser's forward, port and up body axes.
  const fx=cy*cp,fy=sy*cp,fz=-sp;
  const px=cy*sp*sr-sy*cr,py=sy*sp*sr+cy*cr,pz=cp*sr;
  const nx=cy*sp*cr+sy*sr,ny=sy*sp*cr-cy*sr,nz=cp*cr;
  const dx=fx*mech.padX+px*y+nx*z,dy=fy*mech.padX+py*y+ny*z,dz=fz*mech.padX+pz*y+nz*z;
  const wx=boat.we??0,wy=boat.wn??0,wz=boat.wu??boat.yawRate??0;
  return {x:boat.x+dx,y:boat.y+dy,z:boat.z+dz,yaw:boat.yaw,
    forward:[fx,fy,fz],up:[nx,ny,nz],omega:[wx,wy,wz],
    ve:(boat.ve??0)+wy*dz-wz*dy+rate*(fx*mech.dx+px*mech.dy+nx*mech.dz),
    vn:(boat.vn??0)+wz*dx-wx*dz+rate*(fy*mech.dx+py*mech.dy+ny*mech.dz),
    vu:(boat.vu??0)+wx*dy-wy*dx+rate*(fz*mech.dx+pz*mech.dy+nz*mech.dz)};

}

// Apply the same rigid transform to local and remote riders and to the FMU handoff.
export function seatRider(T,mesh,boat,level,pose){
  if(pose){applyRiderPose(T,mesh,pose);return;}
  const {padX,padY,padZ}=liftMechanism(level);
  mesh.position.set(padX,padY,padZ).applyQuaternion(boat.quaternion).add(boat.position);
  mesh.quaternion.copy(boat.quaternion);
}

function hookCoordinates(sub,boat,fraction,livePose){
  const p=livePose?{x:livePose[0],y:livePose[1],z:livePose[2],up:livePose.slice(9,12)}:liftPose(boat,fraction);
  const {yaw=0,pitch=0,heel=0}=sub,cz=Math.cos(yaw),sz=Math.sin(yaw),spitch=Math.sin(pitch),ch=Math.cos(heel),sh=Math.sin(heel);
  const plateNormal=sub.up??[cz*spitch*ch+sz*sh,sz*spitch*ch-cz*sh,Math.cos(pitch)*ch];
  const facing=plateNormal[0]*p.up[0]+plateNormal[1]*p.up[1]+plateNormal[2]*p.up[2];
  const dx=sub.x-p.x+bridleHeight*(plateNormal[0]-p.up[0]);
  const dy=sub.y-p.y+bridleHeight*(plateNormal[1]-p.up[1]);
  const dz=sub.z-p.z+bridleHeight*(plateNormal[2]-p.up[2]);
  const forward=Math.cos(boat.yaw)*dx+Math.sin(boat.yaw)*dy,port=-Math.sin(boat.yaw)*dx+Math.cos(boat.yaw)*dy;
  const cp=Math.cos(boat.pitch),sp=Math.sin(boat.pitch),cr=Math.cos(boat.heel),sr=Math.sin(boat.heel);
  const x=cp*forward-sp*dz,up=sp*forward+cp*dz;
  const y=cr*port+sr*up,z=-sr*port+cr*up;
  return {x,y,z,facing};
}
function crossesHook(from,to){
  // A tilted-away frame plate cannot mate. Sweep between samples so a fast
  // closing head cannot miss the narrow capture gap between the pole faces.
  if(to.facing<.90||from.z<-.025||to.z>.025)return false;
  const fraction=from.z>to.z?Math.max(0,Math.min(1,from.z/(from.z-to.z))):1;
  return Math.hypot(from.x+fraction*(to.x-from.x),from.y+fraction*(to.y-from.y))<=.065;
}

export function fleetLifts(){
  const initial=()=>({level:1,rate:0,goal:1,rider:null});
  const remote=new Map(), versions=new Map(), requests=new Map(), released=new Set(), suppressed=new Set();
  let local=initial(),channel,owner=false,lastPublish=-Infinity,pending,offer,riderToken;
  let participants,getKind,self,revision=0,nextToken=0,arrival,lastDrop,parked;
  const drops=new Map(),seenDrops=new Map();
  let lastPositions=new Map();
  const poseFields=['x','y','z','yaw','heel','pitch','ve','vn','vu','we','wn','wu'];
  const send=(packet,target)=>channel?.send(packet,target?{target}:undefined).catch(()=>{});
  const validToken=n=>Number.isSafeInteger(n)&&n>0;
  function publish(target){
    if(owner)send(['state',++revision,local.level,local.goal,local.rider,riderToken!==undefined,lastDrop,local.rate,local.pose,local.poseCarrier,local.cable],target);
  }
  function clearOffer(){
    if(offer)clearTimeout(offer.timer);
    offer=undefined;
  }
  function clearRider(){
    if(local.rider)released.add(local.rider);
    local.rider=null;riderToken=undefined;
  }
  function finish(ok,cancel=false){
    if(!pending)return;
    const {id,token,timer,retry,resolve}=pending;
    pending=undefined;clearTimeout(timer);clearInterval(retry);
    if(cancel)send(['cancel',token],id);
    resolve(ok);
  }
  function bind(room,members,kinds,selfId){
    finish(false,true);clearOffer();
    channel=room?.makeAction('stern-lift');
    participants=members;getKind=kinds;self=selfId;
    local=initial();riderToken=undefined;lastPublish=-Infinity;
    remote.clear();versions.clear();requests.clear();released.clear();suppressed.clear();
    arrival=undefined;lastDrop=undefined;parked=undefined;drops.clear();seenDrops.clear();lastPositions.clear();
    if(!channel)return;
    const active=channel;
    channel.onMessage=(packet,{peerId})=>{
      if(active!==channel||!participants.has(peerId)||!Array.isArray(packet))return;
      const [kind,token,a,b,rider,reserved,bottom,measuredRate,pose,poseCarrier,cable]=packet;
      if(kind==='state'||kind==='inactive'){
        if(!validToken(token))return;
        // Read the endpoint independently of the revision used for the displayed
        // carriage. A later upstroke may have arrived before this message.
        if(kind==='state'&&getKind(peerId)==='motorboat'&&Array.isArray(bottom)){
          const [serial,passenger,pose,measured]=bottom;
          if(validToken(serial)&&serial<=token&&passenger===self&&Array.isArray(pose)&&
            pose.length===poseFields.length&&pose.every(Number.isFinite)){
            if(serial>(seenDrops.get(peerId)??0)&&!suppressed.has(peerId)){
              seenDrops.set(peerId,serial);
              const carrier=Object.fromEntries(poseFields.map((field,i)=>[field,pose[i]]));
              const valid=Array.isArray(measured)&&measured.length===15&&measured.every(Number.isFinite);
              drops.set(peerId,{carrier,pose:valid?measured:undefined,level:0,goal:0,rider:passenger,revision:serial});
            }
            send(['dropAck',serial],peerId);
          }
        }
        if(token<=(versions.get(peerId)??0))return;
        if(kind==='inactive'){
          versions.set(peerId,token);remote.delete(peerId);suppressed.delete(peerId);
          if(pending?.id===peerId)finish(false);
          return;
        }
        if(getKind(peerId)!=='motorboat'||!Number.isFinite(a)||a<0||a>1||(b!==0&&b!==1)||
           (rider!==null&&typeof rider!=='string'))return;
        versions.set(peerId,token);
        if(rider!==self)suppressed.delete(peerId);
        const valid=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
        const activePose=valid(pose,15)&&valid(poseCarrier,poseFields.length);
        const carrier=valid(poseCarrier,poseFields.length)?Object.fromEntries(poseFields.map((field,i)=>[field,poseCarrier[i]])):undefined;
        remote.set(peerId,{level:a,goal:b,pose:activePose?pose:undefined,poseCarrier:carrier,cable:valid(cable,8)?cable:undefined,rate:Number.isFinite(measuredRate)?Math.max(-1,Math.min(1,measuredRate)):Math.sign(b-a)/travelSeconds,rider:suppressed.has(peerId)?null:rider,received:performance.now()});
        if(owner&&rider&&local.rider===rider&&riderToken===undefined&&(reserved===true||peerId<self)){
          clearRider();publish();
        }
        return;
      }
      if(!validToken(token))return;
      if(kind==='offer'||kind==='reply'){
        if(pending?.id!==peerId||pending.token!==token)return;
        if(kind==='offer')send(['confirm',token],peerId);
        else{
          if(a&&validToken(b)){
            seenDrops.set(peerId,Math.max(seenDrops.get(peerId)??0,b));
            if((drops.get(peerId)?.revision??Infinity)<=b)drops.delete(peerId);
          }
          finish(a==='afloat'?'afloat':a===true||a==='mounted'?'mounted':false);
        }
        return;
      }
      if(!owner||getKind(peerId)!=='sub')return;
      if(kind==='dropAck'){
        if(lastDrop?.[0]===token&&lastDrop[1]===peerId)lastDrop=undefined;
        return;
      }
      if(arrival&&performance.now()>=arrival.until)arrival=undefined;
      if(kind==='reserve'){
        const latest=requests.get(peerId)??0;
        if(token<=latest){
          if(local.rider===peerId&&riderToken===token)send(['reply',token,'mounted',revision],peerId);
          else if(arrival?.id===peerId&&arrival.token===token)send(['reply',token,'afloat',revision],peerId);
          else if(offer?.id===peerId&&offer.token===token)send(['offer',token],peerId);
          else send(['reply',token,false],peerId);
          return;
        }
        requests.set(peerId,token);
        if((local.rider&&local.rider!==peerId)||(offer&&offer.id!==peerId)||(arrival&&arrival.id!==peerId)||(parked&&parked!==peerId)){
          send(['reply',token,false],peerId);
          return;
        }
        clearOffer();
        offer={id:peerId,token,timer:setTimeout(clearOffer,reservationMs)};
        send(['offer',token],peerId);
      }else if(kind==='confirm'){
        if(offer?.id===peerId&&offer.token===token){
          clearOffer();
          if(local.level===0&&local.goal===0){
            arrival={id:peerId,token,until:performance.now()+reservationMs};
          }else{
            local.rider=peerId;riderToken=token;released.delete(peerId);arrival=undefined;
          }
          publish();
        }
        const outcome=local.rider===peerId&&riderToken===token?'mounted':
          arrival?.id===peerId&&arrival.token===token?'afloat':false;
        send(['reply',token,outcome,revision],peerId);
      }else if(kind==='cancel'||kind==='abandon'||kind==='release'){
        if(kind==='release'&&(local.level>0||local.goal!==0))return;
        const latest=requests.get(peerId)??0;
        if(token<latest||(kind!=='cancel'&&token===latest))return;
        if(offer?.id===peerId&&(offer.token===token||kind!=='cancel'))clearOffer();
        if(arrival?.id===peerId&&(arrival.token===token||kind!=='cancel'))arrival=undefined;
        requests.set(peerId,token);
        if(local.rider===peerId&&(riderToken===token||(kind!=='cancel'&&token>=(riderToken??0)))){
          clearRider();publish();
        }
      }
    };
  }
  function onOtherLift(id){
    for(const lift of remote.values())if(lift.rider===id)return true;
    return false;
  }
  function depart(id,kind){
    if(pending?.id===id)finish(false,true);
    if(!channel||owner||!participants.has(id))return false;
    if(kind==='abandon'){
      suppressed.add(id);drops.delete(id);
      seenDrops.set(id,Math.max(seenDrops.get(id)??0,versions.get(id)??0));
      const state=remote.get(id);
      if(self&&state?.rider===self)state.rider=null;
    }
    send([kind,++nextToken],id);return true;
  }
  return {bind,remote,get local(){return local;},publish,
    setOwner(value){
      value=Boolean(value);if(owner===value)return;
      if(owner)send(['inactive',++revision]);
      finish(false,true);clearOffer();released.clear();
      owner=value;local=initial();riderToken=undefined;arrival=undefined;lastDrop=undefined;parked=undefined;lastPositions.clear();lastPublish=-Infinity;
      publish();
    },
    leave(id){
      remote.delete(id);versions.delete(id);requests.delete(id);released.delete(id);suppressed.delete(id);
      if(arrival?.id===id)arrival=undefined;
      if(parked===id)parked=undefined;
      if(lastDrop?.[1]===id)lastDrop=undefined;
      seenDrops.delete(id);lastPositions.delete(id);
      if(offer?.id===id)clearOffer();
      if(local.rider===id){clearRider();released.delete(id);publish();}
      if(pending?.id===id)finish(false);
    },
    travel(goal){
      if(!owner||(goal!==0&&goal!==1)||goal===local.goal)return;
      local.goal=goal;publish();
    },
    tick(dt,now,boat,subs,measuredLevel,measuredPose,measuredRate,livePose,cable){
      if(!owner||!Number.isFinite(dt)||!Number.isFinite(now))return;
      const previous=local.level;
      local.pose=livePose?.length===15&&livePose.every(Number.isFinite)?Array.from(livePose):undefined;
      local.poseCarrier=poseFields.map(field=>boat[field]??(field==='wu'?boat.yawRate??0:0));
      local.cable=cable?.length===8&&cable.every(Number.isFinite)?Array.from(cable):undefined;
      local.level=Number.isFinite(measuredLevel)?Math.max(0,Math.min(1,measuredLevel)):
        previous+Math.sign(local.goal-previous)*Math.min(Math.abs(local.goal-previous),Math.max(0,dt)/travelSeconds);
      local.rate=Number.isFinite(measuredRate)?measuredRate:Math.sign(local.goal-local.level)/travelSeconds;
      if(arrival&&performance.now()>=arrival.until)arrival=undefined;
      let changed=false;
      const riderKind=local.rider&&getKind?.(local.rider);
      if(riderKind&&riderKind!=='sub'){clearRider();changed=true;}
      const positions=new Map();parked=undefined;
      let diverAlongside=false;
      for(const sub of subs){
        if(sub.kind!=='sub')continue;
        const point=hookCoordinates(sub,boat,local.level,local.pose);
        positions.set(sub.id,{point,east:sub.x,north:sub.y,up:sub.z,time:now});
        if(local.level===0&&crossesHook(point,point))parked=sub.id;
        if(local.level===0&&Math.hypot(point.x,point.y,point.z)<3)diverAlongside=true;
        // The coil energizes as soon as recovery is requested, even when
        // the owner's actuator has yet to advance its first winch step.
        const pickingUp=local.goal===1&&(local.level>previous||local.level===0&&previous===0);
        if(!pickingUp||local.rider||offer||released.has(sub.id)||
          onOtherLift(sub.id)||(arrival&&arrival.id!==sub.id))continue;
        const last=lastPositions.get(sub.id);
        // A newly launched peer can still have its pre-respawn survey pose in
        // the fleet buffer. Never interpolate a contact through that teleport.
        const moved=last&&Math.hypot(sub.x-last.east,sub.y-last.north,sub.z-last.up);
        const continuous=last&&moved<=Math.max(2.5,.25+.012*(now-last.time));
        const before=local.level===0?point:continuous?last.point:hookCoordinates(sub,boat,previous);
        if(crossesHook(before,point)){
          local.rider=sub.id;riderToken=undefined;arrival=undefined;changed=true;
        }
      }
      lastPositions=positions;
      if(local.level===0&&previous>0){
        if(local.rider){
          const carrier=poseFields.map(field=>boat[field]??(field==='wu'?boat.yawRate??0:0));
          const measured=measuredPose?.length===15&&measuredPose.every(Number.isFinite)?Array.from(measuredPose):null;
          lastDrop=[revision+1,local.rider,carrier,measured];
        }
        // An active reservation can finish as a free spawn after the descent.
        clearRider();released.clear();changed=true;
      }
      if(changed||((local.rider||diverAlongside||arrival)&&now-lastPublish>=100)||(previous!==local.level&&(now-lastPublish>100||local.level===local.goal))||now-lastPublish>1000){
        publish();lastPublish=now;
      }
    },
    reserve(id){
      if(owner||!channel||pending||!participants.has(id)||getKind(id)!=='motorboat')return Promise.resolve(false);
      suppressed.delete(id);drops.delete(id);
      return new Promise(resolve=>{
        const token=++nextToken,timer=setTimeout(()=>finish(false,true),reservationMs);
        // Vehicle presence and reliable reservations use different channels.
        // A recent switch to Piccard can reach the skipper after the request.
        // Repeating the same token is idempotent even if the offer arrived.
        const request=()=>send(['reserve',token],id),retry=setInterval(request,350);
        pending={id,token,resolve,timer,retry};request();
      });
    },
    takeDrop(id){
      const handoff=drops.get(id);drops.delete(id);return handoff;
    },
    abandon(id){return depart(id,'abandon');},
    release(id){
      const state=remote.get(id);
      if(!state||state.level>0||state.goal!==0)return false;
      return depart(id,'release');
    }
  };
}

// Cache the two wireframes once. Both use the FMU's lower-stop body-frame boxes.
export function portLiftWireframes({boxes,movingCount,travel,kinematics}){
  const moving=[],fixed=[],forks=[],carriage=[],middle=[],trolley=[],articulated=kinematics===2;
  for(let i=0;i<boxes.length;i+=15){
    const member=i/15+1,corners=[];
    let wires=member<=movingCount?moving:fixed;
    if(articulated){
      if(member<=44)wires=forks;
      else if(member===45||member===52||member===53)wires=carriage;
      else if(member===50||member===51)wires=middle;
      else if(member!==46&&member!==47)wires=trolley;
    }
    for(let mask=0;mask<8;mask++){
      const p=boxes.slice(i,i+3);
      for(let axis=0;axis<3;axis++){
        const extent=boxes[i+3+axis]*((mask&(1<<axis))?1:-1);
        for(let k=0;k<3;k++)p[k]+=extent*boxes[i+6+axis*3+k];
      }
      corners.push(p);
    }
    for(let mask=0;mask<8;mask++)for(let axis=0;axis<3;axis++){
      const bit=1<<axis;
      if(!(mask&bit))wires.push(...corners[mask],...corners[mask|bit]);
    }
  }
  return {moving,fixed,travel,forks,carriage,middle,trolley,articulated,davit:kinematics===3};
}
