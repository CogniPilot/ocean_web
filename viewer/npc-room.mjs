import {validLoads} from './wildlife-loads.mjs';
import {validSchoolSnapshot} from './fish-schools.mjs';
import {racerFrameSize} from './npc-sailing-frame.mjs';
export function gullIndex(id){
  if(id==='gull')return 0;
  const numbered=typeof id==='string'&&/^gull-([1-6])$/.exec(id);
  return numbered?Number(numbered[1])-1:-1;
}


export const vesselNpcNames=Object.freeze({
  hobie:'Hobie 16',sloop:'Pilothouse sloop',motorboat:'Sea Ray Sundancer 320',drone:'RDD2 drone',sub:'Piccard submarine'
});
// Diver packets append the 20 Modelica restart states and four gauge outputs to the swimmer pose.
export const sharkForebodyOffset=321;
export const divePacket={start:23,gauge:43,posture:47,computer:48,log:51,joints:56,rates:66,footLoads:76,lateral:78,lateralRates:82,vest:86,axial:88,axialRates:92,torch:96,length:97};
export const npcVesselLimit=5;
export const npcGullLimit=6;
export const npcAnimalLimit=10;
const legacyFishCount=36,fishCount=72;

// The elected or appointed host runs the NPCs and owns room weather.
// RTTs use local monotonic clocks. Comparing two links needs at least three players.
export function npcRoom(){
  const randomBetween=(low,high)=>low+(high-low)*Math.random();
  const validSpawn=(point,kind)=>Array.isArray(point)&&(point.length===2||kind==='diver'&&point.length===4)&&point.every(v=>Number.isFinite(v)&&Math.abs(v)<1000);
  let channel,self,joined,owner,last,lastPing=-Infinity,pingRound=0,issued=0,localRtt;
  const members=new Map();
  let inspectId=null,inspectHost,latestLoads;
  function inspectLoads(id){
    id=id??null;
    if(inspectId===id&&inspectHost===owner)return;
    latestLoads=undefined;inspectId=id;inspectHost=owner;
    if(owner!==self)send({type:'inspectLoads',id},owner);
  }
  function wantsLoads(id){
    if(id===inspectId)return true;
    for(const m of members.values())if(m.inspectId===id)return true;
    return false;
  }
  function publishLoads(id,values){
    if(id===inspectId)latestLoads=values;
    for(const [peer,m] of members)if(m.inspectId===id)send({type:'bodyLoads',id,values},peer);
  }
  const vesselFrames=new Map(),vesselForestays=new Map(),vesselMastRotations=new Map();
  let appointed,hostRevision=0;
  const maxGulls=npcGullLimit;
  const gullSeed=i=>[4+i*2,-12+i*2,8+i*.6,.6*i,13.4,0,2*i,0,.1,0,0,0];
  const emptyHabitat=()=>({restock:Array(fishCount).fill(0),gulls:[],gullSeats:[],vessels:[],sounds:[],sequence:0,time:0,raceStart:0});
  let habitat=emptyHabitat(),habitatOwner,receivedHabitat=false,session=0,lastCall=-Infinity,callRequested=null;
  const finiteRow=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  const validStart=time=>Number.isSafeInteger(time)&&time>0;
  function validHobieWeights(w){return Array.isArray(w)&&w.length===10&&w.every(row=>Array.isArray(row)&&row.length===14&&row.every(Number.isFinite));}
  function acceptHabitat(h){
    return h&&(h.schoolSnapshot===undefined||validSchoolSnapshot(h.schoolSnapshot))&&(finiteRow(h.restock,fishCount)||finiteRow(h.restock,legacyFishCount))&&Array.isArray(h.gulls)&&h.gulls.length<=maxGulls&&h.gulls.every(r=>[12,19,22,25,86,91,92,98].includes(r?.length)&&finiteRow(r,r.length))&&
      (h.vessels===undefined||(Array.isArray(h.vessels)&&h.vessels.length<=npcVesselLimit&&h.vessels.every(
        v=>v&&Object.hasOwn(vesselNpcNames,v.kind)&&Number.isFinite(v.started)&&
          (v.controller===undefined||['vmg','rl','mppi','nmpc'].includes(v.controller))&&
          (v.weights===undefined||v.controller==='rl'&&validHobieWeights(v.weights))&&
          (v.policyName===undefined||v.weights&&typeof v.policyName==='string'&&v.policyName.length<=80)&&
          (v.raceAt===undefined||validStart(v.raceAt))&&
          (v.lane===undefined||Number.isInteger(v.lane)&&v.lane>=0&&v.lane<5)&&
          (v.patrol===undefined||Number.isInteger(v.patrol)&&v.patrol>=0&&v.patrol<5)&&
          (v.phase===undefined||Number.isFinite(v.phase)&&Math.abs(v.phase)<=Math.PI*2)&&
          (v.raceId===undefined||typeof v.raceId==='string'&&/^[a-f0-9]{16}$/.test(v.raceId))&&
          (v.raceWind===undefined||Number.isFinite(v.raceWind)&&v.raceWind>=0&&v.raceWind<=22))))&&
      (h.gullSeats===undefined||(Array.isArray(h.gullSeats)&&h.gullSeats.length===h.gulls.length&&
        h.gullSeats.every(seat=>seat===null||typeof seat==='string')))&&
      (h.raceStart===undefined||h.raceStart===0||validStart(h.raceStart))&&
      (h.leaderboardEpoch===undefined||validStart(h.leaderboardEpoch))&&
      (h.time===undefined||Number.isFinite(h.time)&&h.time>=0)&&Number.isSafeInteger(h.sequence)&&h.sequence>=0&&Array.isArray(h.sounds)&&h.sounds.length<=16&&
      h.sounds.every(s=>Array.isArray(s)&&s.length===7&&['gull','spout','impact'].includes(s[2])&&s.every((v,i)=>i===2||Number.isFinite(v)));
  }
  let animals=new Map(),controls=new Map(),revision=0;
  const validFrame=f=>Array.isArray(f)&&[65,70,202,203,205,207,319,321,sharkForebodyOffset+2].includes(f.length)&&f.every(Number.isFinite);
  const validKind=kind=>kind==='whale'||kind==='shark'||individualSwimmer(kind);
  const validPolicy = weights => Array.isArray(weights) && weights.length === 8 && weights.every(row => finiteRow(row,15));
  function setDiverMode(animal,auto,learned=false){
    animal.auto=auto;animal.learned=!auto&&learned;
    const f=animal.frame;
    if(auto&&f)animal.patrol=[f[1],f[2],f[3],f[7],f[0]];
    controls.delete(animal.id);
  }
  function release(animal){
    if(animal.player){
      animals.delete(animal.id);
      if(!animals.size)last=undefined;
    }else{if(animal.kind==='diver'&&!animal.auto)setDiverMode(animal,true);animal.seat=null;animal.feedAt=undefined;}
    controls.delete(animal.id);revision++;
  }
  const gullId=index=>'gull-'+(index+1);
  function releaseGull(index){
    habitat.gullSeats[index]=null;
    controls.delete(gullId(index));revision++;
  }
  function releaseSeats(who){
    for(const a of animals.values())if(a.seat===who)release(a);
    habitat.gullSeats.forEach((seat,index)=>{if(seat===who)releaseGull(index);});
  }
  function steer(id,msg){
    if(!Array.isArray(msg.axes)||msg.axes.length!==3||!msg.axes.every(v=>Number.isFinite(v)&&Math.abs(v)<=1))return;
    const bank=Number.isFinite(msg.bank)&&Math.abs(msg.bank)<=1?msg.bank:0;
    controls.set(id,{axes:msg.axes,bank,strafe:Number.isFinite(msg.strafe)?Math.max(-1,Math.min(1,msg.strafe)):0,torch:msg.torch===true,vest:Number.isFinite(msg.vest)?Math.max(-1,Math.min(1,msg.vest)):0,sprint:msg.sprint===true,breach:controls.get(id)?.breach??false,at:performance.now()});
    if(animals.get(id)?.kind==='shark'){
      const shark=msg.shark;
      if(shark?.mode==='deterministic'||shark?.mode==='pretrained')controls.get(id).shark={mode:shark.mode};
      else if(shark?.mode==='saved'&&Array.isArray(shark.weights)&&shark.weights.length===10&&shark.weights.every(Number.isFinite))
        controls.get(id).shark={mode:'saved',weights:shark.weights};
    }
  }
  function addGull(){
    const index=habitat.gulls.length;
    habitat.gulls.push(gullSeed(index));habitat.gullSeats.push(null);revision++;
    return gullId(index);
  }
  function act(who,msg){
    if(msg.type==='gullCall'){
      const index=msg.index??0;
      if(Number.isInteger(index)&&index>=0&&index<habitat.gulls.length&&performance.now()-lastCall>1200){
        callRequested=index;lastCall=performance.now();
      }
      return;
    }
    const index=gullIndex(msg.id);
    if(index>=0){
      if(index===0&&msg.type==='occupy'&&habitat.gulls.length===0)addGull();
      if(index>=habitat.gulls.length)return;
      const seat=habitat.gullSeats[index];
      if(msg.type==='occupy'&&!seat){releaseSeats(who);habitat.gullSeats[index]=who;revision++;}
      if(seat===who){
        if(msg.type==='release')releaseGull(index);
        if(msg.type==='steer')steer(gullId(index),msg);
      }
      return;
    }
    let a=animals.get(msg.id);
    if(!a&&msg.type==='occupy'&&validKind(msg.id)&&animals.size<npcAnimalLimit){
      a={id:msg.id,kind:msg.id,seat:null,player:true};
      animals.set(a.id,a);
    }
    if(!a)return;
    if(msg.type==='occupy'&&!a.seat){
      releaseSeats(who);
      if(a.kind==='diver'&&a.player&&validSpawn(msg.spawn,'diver')){
        a={...a,spawn:msg.spawn.slice(),frame:undefined};animals.set(a.id,a);
      }
      if(a.kind==='diver')setDiverMode(a,false);
      a.seat=who;revision++;
    }
    if(a.seat!==who)return;
    if(msg.type==='feed'&&!individualSwimmer(a.kind)&&last?.frame&&(a.feedAt==null||last.frame[0]-a.feedAt>(a.kind==='whale'?3.2:1.2)))a.feedAt=last.frame[0];
    if(msg.type==='diverMode'&&a.kind==='diver'&&msg.learned===true&&validPolicy(msg.weights)){
      a.swimWeights=msg.weights; a.policyRevision=(a.policyRevision??0)+1;
    }
    if(msg.type==='diverMode'&&a.kind==='diver'&&msg.learned===true&&msg.weights===null){
      delete a.swimWeights;a.policyRevision=(a.policyRevision??0)+1;
    }
    if(msg.type==='diverMode'&&a.kind==='diver'&&typeof msg.auto==='boolean'&&(msg.auto!==a.auto||(!msg.auto&&Boolean(a.learned)!==(msg.learned===true)))){
      setDiverMode(a,msg.auto,msg.learned===true);revision++;
    }
    if(msg.type==='release')release(a);
    if(msg.type==='steer'&&!a.auto)steer(a.id,msg);
    if(msg.type==='breach'&&a.kind!=='diver'){const command=controls.get(a.id)??{axes:[0,0,0],at:performance.now()};command.breach=true;controls.set(a.id,command);}
  }
  function request(msg){if(owner===self){act(self??'local',msg);if(msg.type==='release'||msg.type==='occupy'||msg.type==='diverMode')sync();}else send(msg,owner);}
  function sync(target){
    if(owner!==self)return;
    const items=[...animals.values()],delivery=[];
    for(const [id,m] of members){
      if(target&&id!==target)continue;
      if(m.version===2){
        const shared=m.gullTailDynamics?habitat:m.gullPaddleDynamics?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,92))}:m.gullFlightDynamics?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,86))}:m.gullSwimMode?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,25))}:m.gullWater?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,22))}:
          m.extendedGulls?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,19))}:
          {...habitat,gulls:habitat.gulls.slice(0,2).map(r=>r.slice(0,12)),gullSeats:habitat.gullSeats.slice(0,2)};
        let fishHabitat=m.expandedFish?shared:{...shared,restock:shared.restock.slice(0,legacyFishCount)};
        const frameTime=fishHabitat.schoolSnapshot?.time;
        if(frameTime!==undefined){
          if(!m.schooling||(!target&&m.schoolStamp===frameTime)){
            const {schoolSnapshot,...rest}=fishHabitat;fishHabitat=rest;
          }else m.schoolStamp=frameTime;
        }
        const frameSize=m.sharkForebody?sharkForebodyOffset+2:m.pairedFins?sharkForebodyOffset:m.shapeFrames?319:m.swimReserve?207:m.sharkBank?205:203;
        const frame=last?.frame?.length>frameSize?last.frame.slice(0,frameSize):last?.frame;
        const roster=items.filter(a=>(a.kind!=='manta'||m.manta)&&(a.kind!=='diver'||m.diver)).map(a=>{
          const limit=a.kind==='manta'?(m.mantaJoints?29:23):a.kind!=='diver'?frameSize:m.diverAxial?divePacket.length:m.diverVest?divePacket.axial:m.diverLateral?divePacket.vest:m.diverJoints?divePacket.lateral:
            m.diveMeter?divePacket.joints:m.diveComputer?divePacket.posture:divePacket.start;
          if(a.kind==='diver'&&a.frame?.length>=divePacket.length&&!m.diverAxial&&limit>=divePacket.lateral){
            const row=a.frame.slice(0,limit),offset=(1-row[21])*Math.PI/2;
            for(const j of [2,7])row[divePacket.joints+j]-=offset;
            return {...a,frame:row};
          }
          return a.frame?.length>limit?{...a,frame:a.frame.slice(0,limit)}:a;
        });
        delivery.push(send({type:'harbor',version:2,hostTransfer:true,extendedGulls:true,gullWater:true,gullSwimMode:true,gullFlightDynamics:true,gullPaddleDynamics:true,gullTailDynamics:true,sharkBank:true,swimReserve:true,shapeFrames:true,pairedFins:true,sharkForebody:true,expandedFish:true,diverAxial:true,diverVest:true,diverLateral:true,diverJoints:true,diveMeter:true,diveComputer:true,diver:true,manta:true,mantaJoints:true,schooling:true,joined,frame,items:roster,habitat:fishHabitat},id));
      }else{
        if(last?.frame)send([joined,...last.frame.slice(0,70)],id);
        send({type:'animals',items:items.filter(a=>!individualSwimmer(a.kind)).map(a=>({...a,frame:a.frame?.slice(0,70)}))},id);
      }
    }
    return Promise.all(delivery);
  }
  function elect(){
    const candidates=[[self,joined,localRtt],...[...members].map(([id,m])=>[id,m.joined,m.rtt])];
    const comparable=candidates.length>=3&&candidates.some(c=>c[2]!=null&&c[2]<250);
    const viable=candidates.filter(c=>!comparable||c[2]==null||c[2]<=550);
    viable.sort((a,b)=>a[1]-b[1]||String(a[0]).localeCompare(String(b[0])));
    const elected=viable[0][0];
    owner=appointed&&(appointed===self||members.has(appointed))?appointed:elected;
  }
  function canTransferTo(id){
    return Boolean(channel&&owner===self&&members.has(id)&&[...members.values()].every(m=>m.hostTransfer));
  }
  function receiveHost(data,peerId,m){
    const {host,hostRevision:sequence}=data;
    if(!m.hostTransfer||typeof host!=='string'||host.length<1||host.length>128||
      !Number.isSafeInteger(sequence)||sequence<=hostRevision)return;
    // Joining clients can learn a prior handoff from their initial elected
    // host. Once established, only the current host can advance authority.
    if(peerId!==owner)return;
    if(data.type!=='hello'&&host!==self&&!members.has(host))return;
    appointed=host;hostRevision=sequence;elect();
    if(owner===self)sync();
  }
  function send(data,target){return channel?.send(data,target?{target}:undefined).catch(()=>{});}
  function hello(target){send([joined],target);send({type:'hello',version:2,hostTransfer:true,host:appointed,hostRevision,extendedGulls:true,gullWater:true,gullSwimMode:true,gullFlightDynamics:true,gullPaddleDynamics:true,gullTailDynamics:true,sharkBank:true,swimReserve:true,shapeFrames:true,pairedFins:true,sharkForebody:true,expandedFish:true,diverAxial:true,diverVest:true,diverLateral:true,diverJoints:true,diveMeter:true,diveComputer:true,diver:true,manta:true,mantaJoints:true,schooling:true,joined},target);}
  return {
    vesselFrames,vesselForestays,vesselMastRotations,
    publishVessels(frames){
      if(owner!==self)return;
      for(const {id,data,forestay,mastRotation} of frames){
        vesselFrames.set(id,data);
        if(finiteRow(forestay,9))vesselForestays.set(id,forestay);
        if(Number.isFinite(mastRotation)&&Math.abs(mastRotation)<2)vesselMastRotations.set(id,mastRotation);
      }
      if(members.size)send({type:'vessel-frames',frames});
    },
    connect(action,id){
      channel=action;self=id;appointed=undefined;hostRevision=0;habitatOwner=id;receivedHabitat=false;session++;vesselFrames.clear();vesselForestays.clear();vesselMastRotations.clear();animals=new Map();habitat=emptyHabitat();callRequested=null;lastCall=-Infinity;controls.clear();last=undefined;revision++;joined=Date.now();members.clear();localRtt=undefined;lastPing=-Infinity;elect();
      if(!action)return;
      action.onMessage=(data,{peerId})=>{
        if(action!==channel||!data)return;
        let m=members.get(peerId);
        if((data.type==='hello'||data.type==='harbor')&&data.version===2&&Number.isSafeInteger(data.joined)&&data.joined>0){
          if(!m){m={joined:data.joined,samples:[]};members.set(peerId,m);elect();hello(peerId);}
          m.version=2;m.schooling=data.schooling===true;m.manta=data.manta===true;m.mantaJoints=data.mantaJoints===true;m.diver=data.diver===true;m.diveComputer=data.diveComputer===true;m.diveMeter=data.diveMeter===true;m.diverJoints=data.diverJoints===true;m.diverLateral=data.diverLateral===true;m.diverAxial=data.diverAxial===true;m.diverVest=data.diverVest===true;m.hostTransfer=data.hostTransfer===true;m.extendedGulls=data.extendedGulls===true;m.gullWater=data.gullWater===true;m.gullSwimMode=data.gullSwimMode===true;m.gullFlightDynamics=data.gullFlightDynamics===true;m.gullPaddleDynamics=data.gullPaddleDynamics===true;m.gullTailDynamics=data.gullTailDynamics===true;m.sharkBank=data.sharkBank===true;m.swimReserve=data.swimReserve===true;m.shapeFrames=data.shapeFrames===true;m.pairedFins=data.pairedFins===true;m.sharkForebody=data.sharkForebody===true;m.expandedFish=data.expandedFish===true;
          if(data.type==='hello'){receiveHost(data,peerId,m);sync(peerId);return;}
        }
        if(!Array.isArray(data)){
          if(!m)return;
          if(data.type==='inspectLoads'){
            if(owner===self)m.inspectId=typeof data.id==='string'&&data.id.length<40?data.id:null;
            return;
          }
          if(data.type==='bodyLoads'){
            const kind=gullIndex(data.id)>=0?'gull':animals.get(data.id)?.kind;
            if(peerId===owner&&data.id===inspectId&&validLoads(data.values,kind))latestLoads=data.values;
            return;
          }
          if(data.type==='vessel-frames'){
            if(peerId===owner&&Array.isArray(data.frames)&&data.frames.length<=npcVesselLimit){
              for(const frame of data.frames){
                if(typeof frame?.id==='string'&&frame.id.length<=32&&finiteRow(frame.data,racerFrameSize)){
                  vesselFrames.set(frame.id,frame.data);
                  if(finiteRow(frame.forestay,9))vesselForestays.set(frame.id,frame.forestay);
                  if(Number.isFinite(frame.mastRotation)&&Math.abs(frame.mastRotation)<2)
                    vesselMastRotations.set(frame.id,frame.mastRotation);
                }
              }
            }
            return;
          }
          if(data.type==='host'){receiveHost(data,peerId,m);return;}
          if(data.type==='animals'||data.type==='harbor'){
            if(peerId!==owner||!Array.isArray(data.items)||data.items.length>10)return;
            if(data.type==='harbor'&&data.frame){
              if(!validFrame(data.frame)||(last?.owner===peerId&&last.frame[0]>data.frame[0]))return;
            }
            const next=new Map();
            for(const a of data.items){
              if(!a||!validKind(a.kind)||typeof a.id!=='string'||a.id.length>32||
                (a.seat!==null&&typeof a.seat!=='string')||(a.frame&&!(individualSwimmer(a.kind)?(finiteRow(a.frame,23)||a.kind==='manta'&&finiteRow(a.frame,29)||a.kind==='diver'&&(finiteRow(a.frame,divePacket.posture)||finiteRow(a.frame,divePacket.joints)||finiteRow(a.frame,divePacket.lateral)||finiteRow(a.frame,divePacket.vest)||(finiteRow(a.frame,divePacket.axial)||finiteRow(a.frame,divePacket.torch)||finiteRow(a.frame,divePacket.length)))):validFrame(a.frame))))return;
              const policy=a.kind==='diver'&&validPolicy(a.swimWeights)&&Number.isSafeInteger(a.policyRevision)?{swimWeights:a.swimWeights,policyRevision:a.policyRevision}:{};
              next.set(a.id,{...policy,id:a.id,kind:a.kind,seat:a.seat,spawn:validSpawn(a.spawn,a.kind)?a.spawn:undefined,auto:a.kind==='diver'&&a.auto===true,learned:a.kind==='diver'&&a.seat!==null&&a.auto!==true&&a.learned===true,patrol:a.kind==='diver'&&finiteRow(a.patrol,5)?a.patrol:undefined,player:a.player===true,frame:a.frame,feedAt:Number.isFinite(a.feedAt)?a.feedAt:undefined,lastBite:Number.isFinite(a.lastBite)?a.lastBite:undefined,gape:Math.max(0,Math.min(1,Number(a.gape)||0)),caught:Number.isSafeInteger(a.caught)?a.caught:0,breachAt:Number.isFinite(a.breachAt)?a.breachAt:undefined});
            }
            if([...next.values()].some(a=>!animals.has(a.id)||animals.get(a.id).seat!==a.seat||animals.get(a.id).auto!==a.auto||Boolean(animals.get(a.id).learned)!==Boolean(a.learned))||next.size!==animals.size)revision++;
            animals=next;
            if(data.type==='harbor'&&acceptHabitat(data.habitat)){
              const {gulls,gullSeats=gulls.map(()=>null),vessels=[],restock}=data.habitat;
              if(gullSeats.length!==habitat.gullSeats.length||gullSeats.some((seat,index)=>seat!==habitat.gullSeats[index]))revision++;
              habitat={...data.habitat,schoolSnapshot:data.habitat.schoolSnapshot??(habitatOwner===peerId?habitat.schoolSnapshot:undefined),gullSeats,vessels,restock:Array.from({length:fishCount},(_,i)=>restock[i]??0)};habitatOwner=peerId;receivedHabitat=true;
            }
            if(data.type==='harbor')last=data.frame?{frame:data.frame,owner}:undefined;
            return;
          }
          if(['occupy','release','steer','diverMode','breach','feed','gullCall'].includes(data.type)){
            if(owner===self){act(peerId,data);if(data.type==='occupy'||data.type==='release'||data.type==='diverMode')sync();}
            return;
          }
          if(!Number.isSafeInteger(data.round))return;
          if(data.type==='ping'){
            receiveHost(data,peerId,m);
            m.rtt=Number.isFinite(data.rtt)&&data.rtt>=0?data.rtt:undefined;
            send({type:'pong',round:data.round},peerId);elect();
          }else if(data.type==='pong'&&data.round===pingRound&&m.round!==pingRound){
            m.round=pingRound;m.samples.push(performance.now()-issued);
            if(m.samples.length>5)m.samples.shift();
          }
          return;
        }
        if((data.length!==1&&data.length!==66&&data.length!==71)||!data.every(Number.isFinite)||!Number.isSafeInteger(data[0])||data[0]<=0)return;
        if(!m){members.set(peerId,{joined:data[0],samples:[]});elect();hello(peerId);}
        if(data.length===1&&owner===self)sync(peerId);
        if(peerId===owner&&data.length>1)last={frame:data.slice(1),owner};
      };
    },
    tick(now){
      if(!members.size||now-lastPing<2500)return;
      const samples=[...members.values()].filter(m=>m.samples.length>=3)
        .map(m=>m.samples.slice().sort((a,b)=>a-b)[Math.floor(m.samples.length/2)]).sort((a,b)=>a-b);
      // Use the lower median. One bad connection should not disqualify both endpoints.
      localRtt=samples.length>=2?samples[Math.floor((samples.length-1)/2)]:undefined;
      issued=performance.now();lastPing=now;pingRound++;
      send({type:'ping',round:pingRound,rtt:localRtt??null,host:appointed,hostRevision});elect();
    },
    join:hello,leave(id){
      members.delete(id);
      if(appointed===id)appointed=undefined;
      elect();releaseSeats(id);if(owner===self)sync();
    },
    canTransferTo,
    async handoffOnLeave(){
      const candidates=[...members].sort((a,b)=>a[1].joined-b[1].joined||a[0].localeCompare(b[0]));
      const id=candidates.find(([peer])=>canTransferTo(peer))?.[0];
      if(!id)return;
      async function deliver(){
        await sync();
        if(!canTransferTo(id))return;
        const sequence=++hostRevision;
        appointed=id;elect();
        await send({type:'host',host:id,hostRevision:sequence});
      }
      // Keep the page alive for the final checkpoint and transfer unless the link stalls.
      let timer;
      try{await Promise.race([deliver(),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}
      finally{clearTimeout(timer);}
    },
    transferHost(id){
      if(!canTransferTo(id))return false;
      sync();
      send({type:'host',host:id,hostRevision:++hostRevision});
      appointed=id;elect();
      return true;
    },
    restartRace(start){
      if(owner!==self||!validStart(start))return false;
      habitat.raceStart=start;
      for(const vessel of habitat.vessels)if(vessel.kind==='hobie')vessel.raceAt=start;
      sync();
      return true;
    },
    setLeaderboardEpoch(epoch){
      if(owner!==self||!validStart(epoch)||epoch<=(habitat.leaderboardEpoch??0))return false;
      habitat.leaderboardEpoch=epoch;
      sync();
      return true;
    },
    removeVessel(vessel){
      if(owner!==self)return false;
      const index=habitat.vessels.indexOf(vessel);
      if(index<0)return false;
      const id=vessel.raceId??'v-'+index+'-'+Math.round(vessel.started*1000);
      vesselFrames.delete(id);vesselForestays.delete(id);vesselMastRotations.delete(id);
      habitat.vessels.splice(index,1);revision++;sync();
      return true;
    },
    roster(){return {vessels:habitat.vessels.map(v=>v.kind),hobiePilots:habitat.vessels.map(v=>({controller:v.controller,weights:v.weights})),gulls:habitat.gulls.length,animals:[...animals.values()].filter(a=>!a.player).map(({kind,id})=>({kind,id})),raceStart:habitat.raceStart};},
    reseed(started,boundary,wind,roster=this.roster()){
      if(owner!==self)return;
      habitat.raceStart=validStart(roster.raceStart)?roster.raceStart:0;
      const available=[0,1,2,3,4],phase=randomBetween(0,2*Math.PI);
      habitat.vessels=roster.vessels.filter(kind=>Object.hasOwn(vesselNpcNames,kind)).slice(0,npcVesselLimit).map((kind,patrol)=>{
        if(kind!=='hobie')return {kind,started,patrol,phase};
        const [lane]=available.splice(Math.floor(Math.random()*available.length),1);
        return {...roster.hobiePilots?.[patrol],kind,started,raceAt:boundary,raceWind:wind,lane,
          raceId:Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join('')};
      });
      habitat.gulls=Array.from({length:Math.min(maxGulls,roster.gulls)},(_,i)=>{
        if(habitat.gullSeats[i]&&habitat.gullSeats[i]!==self)return habitat.gulls[i];
        const row=gullSeed(i);
        row[0]=-48+16*i+randomBetween(-3,3);
        row[1]=-55+randomBetween(-6,6);
        row[2]=11+randomBetween(0,5);
        row[3]=randomBetween(-Math.PI,Math.PI);
        return row;
      });
      habitat.gullSeats=habitat.gulls.map((_,i)=>habitat.gullSeats[i]===self?null:habitat.gullSeats[i]??null);
      const next=new Map([...animals].filter(([,a])=>a.seat&&a.seat!==self));
      let index=0;
      for(const {kind,id} of roster.animals.slice(0,npcAnimalLimit)){
        if(!validKind(kind)||next.has(id))continue;
        next.set(id,{kind,id,seat:null,spawn:individualSwimmer(kind)?undefined:[-88+17*index+randomBetween(-3,3),26+randomBetween(-8,8)]});
        index++;
      }
      if(!next.get('whale')?.seat&&!next.get('shark')?.seat)last=undefined;
      animals=next;
      vesselFrames.clear();vesselForestays.clear();vesselMastRotations.clear();
      controls.clear();
      session++;revision++;
      return sync();
    },
    get owner(){return owner;},get host(){return owner===self;},get latest(){return last;},
    get animals(){return animals;},get revision(){return revision;},get self(){return self??'local';},
    seat(id){const index=gullIndex(id);return index<0?animals.get(id)?.seat:habitat.gullSeats[index];},
    select(id,spawn){request({type:'occupy',id,spawn});},release(id){request({type:'release',id});},
    diverMode(id,auto,learned=false,weights){request({type:'diverMode',id,auto,learned,weights});},
    steer(id,axes,bank=0,sprint=false,vest=0,strafe=0,torch=false,shark){request({type:'steer',id,axes,bank,sprint,vest,strafe,torch,shark});},breach(id){request({type:'breach',id});},
    command(id){
      const index=gullIndex(id),c=controls.get(index<0?id:gullId(index));
      if(!c)return {axes:[0,0,0],bank:0,sprint:false,breach:false};
      const fresh=performance.now()-c.at<800;
      const result={axes:fresh?c.axes:[0,0,0],bank:fresh?(c.bank??0):0,sprint:fresh&&c.sprint===true,breach:c.breach};
      if(animals.get(id)?.kind==='diver'){result.vest=fresh?(c.vest??0):0;result.strafe=fresh?(c.strafe??0):0;result.torch=c.torch;}
      if(c.shark)result.shark=c.shark;
      c.breach=false;return result;
    },
    inspectLoads,wantsLoads,publishLoads,loads(id){return id===inspectId?latestLoads:undefined;},
    get synchronized(){return owner===self?members.size>0:receivedHabitat&&habitatOwner===owner;},
    get habitat(){return habitat;},get session(){return session;},get soundOwner(){return owner===self?self:habitatOwner;},
    get hasWildlife(){return animals.size>0||habitat.gulls.length>0;},
    get clock(){return last?.frame[0]??(animals.size||habitat.gulls.length?habitat.time:undefined);},
    feed(id){request({type:'feed',id});},
    gullCall(index){request({type:'gullCall',index});},
    takeCall(){const pending=callRequested;callRequested=null;return pending;},
    sound(kind,time,position,gain){
      if(owner!==self)return;
      habitat.sounds.push([++habitat.sequence,time,kind,...position,gain]);
      if(habitat.sounds.length>16)habitat.sounds.shift();
    },
    canSpawn(kind){return owner===self&&(Object.hasOwn(vesselNpcNames,kind)?habitat.vessels.length<npcVesselLimit:
      kind==='gull'?habitat.gulls.length<maxGulls:validKind(kind)&&animals.size<npcAnimalLimit);},
    spawn(kind,started=0,raceAt,raceWind,site,controller='vmg',weights,policyName){
      if(!this.canSpawn(kind))return;
      if(Object.hasOwn(vesselNpcNames,kind)){
        if(!Number.isFinite(started))return;
        const vessel={kind,started};
        if(kind==='hobie'){
          if(!['vmg','rl','nmpc','mppi'].includes(controller)||weights!==undefined&&!validHobieWeights(weights))return;
          vessel.controller=controller;
          if(controller==='rl'&&weights){
            vessel.weights=weights;
            if(typeof policyName==='string'&&policyName.trim())vessel.policyName=policyName.trim().slice(0,80);
          }
        }
        if(kind==='hobie'){
          if(validStart(raceAt))vessel.raceAt=raceAt;
          vessel.raceId=Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join('');
        }
        if(kind==='hobie'&&Number.isFinite(raceWind))vessel.raceWind=Math.max(0,Math.min(22,raceWind));
        habitat.vessels.push(vessel);revision++;sync();return 'npc-'+habitat.vessels.length;
      }
      if(kind==='gull'){
        const id=addGull();sync();return id;
      }
      let number=2;while(animals.has(kind+'-'+number))number++;
      const id=animals.has(kind)?kind+'-'+number:kind;
      const a={id,kind,seat:null};
      if(kind==='diver'){
        a.auto=true;
        if(validSpawn(site,kind)){
          a.spawn=site.slice();
          // Keep newly added dive buddies beside one another at a shared site.
          const neighbors=[...animals.values()].filter(peer=>peer.kind==='diver').map(peer=>peer.frame?.slice(1,4)??peer.spawn).filter(Boolean);
          const heading=site[3]??Math.PI;
          for(let j=0;j<=2*neighbors.length;j++){
            const offset=(j%2===0?-1:1)*Math.ceil(j/2)*2.4;
            const x=site[0]-offset*Math.sin(heading),y=site[1]+offset*Math.cos(heading);
            if(neighbors.every(p=>Math.hypot(x-p[0],y-p[1],(site[2]??0)-(p[2]??0))>1.8)){
              a.spawn[0]=x;a.spawn[1]=y;break;
            }
          }
        }
      }
      animals.set(id,a);revision++;sync();return id;
    },
    publish(frame){
      if(owner!==self)return;
      last=frame?{frame,owner}:undefined;
      if(members.size)sync();
    }
  };
}

// World contacts reserve the first two slots for the original whale and shark.
export function individualSwimmer(kind){return kind==='manta'||kind==='diver';}

export function writeAnimalContacts(roster,current,animals,joints){
  animals.fill(0);joints?.fill(0);
  const slots=Array.from({length:8},(_,i)=>i+2);
  if(!roster.has('whale'))slots.push(0);
  if(!roster.has('shark'))slots.push(1);
  for(const a of roster.values()){
    if(a.kind==='diver')continue;
    const whale=a.kind==='whale',slot=a.id==='whale'?0:a.id==='shark'?1:slots.shift();
    if(slot===undefined)continue;
    if(a.kind==='manta'){
      const row=a.frame;
      if(row){
        const paired=row.length>=27;
        animals.set([paired?3.1:3,row[1],row[2],row[3],row[7],row[8],row[4],row[5],row[9]],9*slot);
        if(paired&&joints){
          // The existing polar stroke pair carries the common and differential
          // angles. Legacy receivers recover the mean via their strokeAngle.
          const mean=(row[23]+row[24])/2,difference=(row[23]-row[24])/2;
          const common=mean/(mean<0?.45:1.25);
          joints.set([Math.atan2(common,difference),Math.hypot(common,difference),(row[25]+row[26])/2,row[6]],4*slot);
        }else joints?.set([row[13],row[14],row[22],row[6]],4*slot);
      }
      continue;
    }
    const row=a.frame??(a.id===a.kind?current:null);
    if(!row||slot>=10)continue;
    const k=whale?17:9,yaw=row[k+3],c=Math.cos(yaw),s=Math.sin(yaw);
    const surge=row[whale?27:65]??0,sway=row[whale?38:74]??0;
    if(joints)joints.set(whale?[(row[31]??0)-(row[29]??0),row[39]??0,row[40]??0,row[41]??0]:
      [row[202]??0,row[70]??0,row[72]??0,row[201]??0],4*slot);
    animals.set([whale?1:2,row[k],row[k+1],row[k+2],yaw,row[whale?21:67]??0,
      surge*c-sway*s,surge*s+sway*c,row[whale?35:203]??0],9*slot);
  }
  return animals;
}
