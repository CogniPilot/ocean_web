export function gullIndex(id){
  if(id==='gull')return 0;
  const numbered=typeof id==='string'&&/^gull-([1-6])$/.exec(id);
  return numbered?Number(numbered[1])-1:-1;
}

export const vesselNpcNames=Object.freeze({
  hobie:'Hobie 16',sloop:'Pilothouse sloop',motorboat:'Cabin cruiser',drone:'RDD2 drone',sub:'Piccard submarine'
});
const vesselLimit=5;

// The earliest connected participant runs the NPCs and owns room weather.
// RTTs use local monotonic clocks. Comparing two links needs at least three players.
export function npcRoom(){
  let channel,self,joined,owner,last,lastPing=-Infinity,pingRound=0,issued=0,localRtt;
  const members=new Map();
  const maxGulls=6;
  const gullSeed=i=>[4+i*2,-12+i*2,8+i*.6,.6*i,13.4,0,2*i,0,.1,0,0,0];
  const emptyHabitat=()=>({restock:Array(36).fill(0),gulls:[],gullSeats:[],vessels:[],sounds:[],sequence:0,time:0});
  let habitat=emptyHabitat(),habitatOwner,session=0,lastCall=-Infinity,callRequested=null;
  const finiteRow=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  function acceptHabitat(h){
    return h&&finiteRow(h.restock,36)&&Array.isArray(h.gulls)&&h.gulls.length<=maxGulls&&h.gulls.every(r=>[12,19,22,25].includes(r?.length)&&finiteRow(r,r.length))&&
      (h.vessels===undefined||(Array.isArray(h.vessels)&&h.vessels.length<=vesselLimit&&h.vessels.every(
        v=>v&&Object.hasOwn(vesselNpcNames,v.kind)&&Number.isFinite(v.started)&&
          (v.raceAt===undefined||Number.isSafeInteger(v.raceAt)&&v.raceAt%300===0)&&
          (v.raceWind===undefined||Number.isFinite(v.raceWind)&&v.raceWind>=0&&v.raceWind<=22))))&&
      (h.gullSeats===undefined||(Array.isArray(h.gullSeats)&&h.gullSeats.length===h.gulls.length&&
        h.gullSeats.every(seat=>seat===null||typeof seat==='string')))&&
      (h.time===undefined||Number.isFinite(h.time)&&h.time>=0)&&Number.isSafeInteger(h.sequence)&&h.sequence>=0&&Array.isArray(h.sounds)&&h.sounds.length<=16&&
      h.sounds.every(s=>Array.isArray(s)&&s.length===7&&['gull','spout','impact'].includes(s[2])&&s.every((v,i)=>i===2||Number.isFinite(v)));
  }
  let animals=new Map(),controls=new Map(),revision=0;
  const validFrame=f=>Array.isArray(f)&&[65,70,202,203,205,207].includes(f.length)&&f.every(Number.isFinite);
  const validKind=kind=>kind==='whale'||kind==='shark';
  function release(animal){
    if(animal.player){
      animals.delete(animal.id);
      if(!animals.size)last=undefined;
    }else{animal.seat=null;animal.feedAt=undefined;}
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
    controls.set(id,{axes:msg.axes,bank,breach:controls.get(id)?.breach??false,at:performance.now()});
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
    if(!a&&msg.type==='occupy'&&validKind(msg.id)&&animals.size<10){
      a={id:msg.id,kind:msg.id,seat:null,player:true};animals.set(a.id,a);
    }
    if(!a)return;
    if(msg.type==='occupy'&&!a.seat){
      releaseSeats(who);
      a.seat=who;revision++;
    }
    if(a.seat!==who)return;
    if(msg.type==='feed'&&last?.frame&&(a.feedAt==null||last.frame[0]-a.feedAt>(a.kind==='whale'?3.2:1.2)))a.feedAt=last.frame[0];
    if(msg.type==='release')release(a);
    if(msg.type==='steer')steer(a.id,msg);
    if(msg.type==='breach'){const command=controls.get(a.id)??{axes:[0,0,0],at:performance.now()};command.breach=true;controls.set(a.id,command);}
  }
  function request(msg){if(owner===self){act(self??'local',msg);if(msg.type==='release'||msg.type==='occupy')sync();}else send(msg,owner);}
  function sync(target){
    if(owner!==self)return;
    const items=[...animals.values()];
    for(const [id,m] of members){
      if(target&&id!==target)continue;
      if(m.version===2){
        const shared=m.gullSwimMode?habitat:m.gullWater?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,22))}:
          m.extendedGulls?{...habitat,gulls:habitat.gulls.map(r=>r.slice(0,19))}:
          {...habitat,gulls:habitat.gulls.slice(0,2).map(r=>r.slice(0,12)),gullSeats:habitat.gullSeats.slice(0,2)};
        const frameSize=m.swimReserve?207:m.sharkBank?205:203;
        const frame=last?.frame?.length>frameSize?last.frame.slice(0,frameSize):last?.frame;
        const roster=items.map(a=>a.frame?.length>frameSize?{...a,frame:a.frame.slice(0,frameSize)}:a);
        send({type:'harbor',version:2,extendedGulls:true,gullWater:true,gullSwimMode:true,sharkBank:true,swimReserve:true,joined,frame,items:roster,habitat:shared},id);
      }else{
        if(last?.frame)send([joined,...last.frame.slice(0,70)],id);
        send({type:'animals',items:items.map(a=>({...a,frame:a.frame?.slice(0,70)}))},id);
      }
    }
  }
  function elect(){
    const candidates=[[self,joined,localRtt],...[...members].map(([id,m])=>[id,m.joined,m.rtt])];
    const comparable=candidates.length>=3&&candidates.some(c=>c[2]!=null&&c[2]<250);
    const viable=candidates.filter(c=>!comparable||c[2]==null||c[2]<=550);
    viable.sort((a,b)=>a[1]-b[1]||String(a[0]).localeCompare(String(b[0])));
    owner=viable[0][0];
  }
  function send(data,target){channel?.send(data,target?{target}:undefined).catch(()=>{});}
  function hello(target){send([joined],target);send({type:'hello',version:2,extendedGulls:true,gullWater:true,gullSwimMode:true,sharkBank:true,swimReserve:true,joined},target);}
  return {
    connect(action,id){
      channel=action;self=id;habitatOwner=id;session++;animals=new Map();habitat=emptyHabitat();callRequested=null;lastCall=-Infinity;controls.clear();last=undefined;revision++;joined=Date.now();members.clear();localRtt=undefined;lastPing=-Infinity;elect();
      if(!action)return;
      action.onMessage=(data,{peerId})=>{
        if(action!==channel||!data)return;
        let m=members.get(peerId);
        if((data.type==='hello'||data.type==='harbor')&&data.version===2&&Number.isSafeInteger(data.joined)&&data.joined>0){
          if(!m){m={joined:data.joined,samples:[]};members.set(peerId,m);elect();hello(peerId);}
          m.version=2;m.extendedGulls=data.extendedGulls===true;m.gullWater=data.gullWater===true;m.gullSwimMode=data.gullSwimMode===true;m.sharkBank=data.sharkBank===true;m.swimReserve=data.swimReserve===true;
          if(data.type==='hello'){sync(peerId);return;}
        }
        if(!Array.isArray(data)){
          if(!m)return;
          if(data.type==='animals'||data.type==='harbor'){
            if(peerId!==owner||!Array.isArray(data.items)||data.items.length>10)return;
            if(data.type==='harbor'&&data.frame){
              if(!validFrame(data.frame)||(last?.owner===peerId&&last.frame[0]>data.frame[0]))return;
            }
            const next=new Map();
            for(const a of data.items){
              if(!a||!validKind(a.kind)||typeof a.id!=='string'||a.id.length>32||
                (a.seat!==null&&typeof a.seat!=='string')||(a.frame&&!validFrame(a.frame)))return;
              next.set(a.id,{id:a.id,kind:a.kind,seat:a.seat,player:a.player===true,frame:a.frame,feedAt:Number.isFinite(a.feedAt)?a.feedAt:undefined,lastBite:Number.isFinite(a.lastBite)?a.lastBite:undefined,gape:Math.max(0,Math.min(1,Number(a.gape)||0)),caught:Number.isSafeInteger(a.caught)?a.caught:0,breachAt:Number.isFinite(a.breachAt)?a.breachAt:undefined});
            }
            if([...next.values()].some(a=>!animals.has(a.id)||animals.get(a.id).seat!==a.seat)||next.size!==animals.size)revision++;
            animals=next;
            if(data.type==='harbor'&&acceptHabitat(data.habitat)){
              const {gulls,gullSeats=gulls.map(()=>null),vessels=[]}=data.habitat;
              if(gullSeats.length!==habitat.gullSeats.length||gullSeats.some((seat,index)=>seat!==habitat.gullSeats[index]))revision++;
              habitat={...data.habitat,gullSeats,vessels};habitatOwner=peerId;
            }
            if(data.type==='harbor')last=data.frame?{frame:data.frame,owner}:undefined;
            return;
          }
          if(['occupy','release','steer','breach','feed','gullCall'].includes(data.type)){
            if(owner===self){act(peerId,data);if(data.type==='occupy'||data.type==='release')sync();}
            return;
          }
          if(!Number.isSafeInteger(data.round))return;
          if(data.type==='ping'){
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
      send({type:'ping',round:pingRound,rtt:localRtt??null});elect();
    },
    join:hello,leave(id){members.delete(id);elect();releaseSeats(id);if(owner===self)sync();},
    get owner(){return owner;},get host(){return owner===self;},get latest(){return last;},
    get animals(){return animals;},get revision(){return revision;},get self(){return self??'local';},
    seat(id){const index=gullIndex(id);return index<0?animals.get(id)?.seat:habitat.gullSeats[index];},
    select(id){request({type:'occupy',id});},release(id){request({type:'release',id});},
    steer(id,axes,bank=0){request({type:'steer',id,axes,bank});},breach(id){request({type:'breach',id});},
    command(id){
      const index=gullIndex(id),c=controls.get(index<0?id:gullId(index));
      if(!c)return {axes:[0,0,0],bank:0,breach:false};
      const fresh=performance.now()-c.at<800;
      const result={axes:fresh?c.axes:[0,0,0],bank:fresh?(c.bank??0):0,breach:c.breach};
      c.breach=false;return result;
    },
    get habitat(){return habitat;},get session(){return session;},get soundOwner(){return owner===self?self:habitatOwner;},
    get hasWildlife(){return animals.size>0||habitat.gulls.length>0;},
    get clock(){return animals.size?last?.frame[0]:habitat.gulls.length?habitat.time:undefined;},
    feed(id){request({type:'feed',id});},
    gullCall(index){request({type:'gullCall',index});},
    takeCall(){const pending=callRequested;callRequested=null;return pending;},
    sound(kind,time,position,gain){
      if(owner!==self)return;
      habitat.sounds.push([++habitat.sequence,time,kind,...position,gain]);
      if(habitat.sounds.length>16)habitat.sounds.shift();
    },
    canSpawn(kind){return owner===self&&(Object.hasOwn(vesselNpcNames,kind)?habitat.vessels.length<vesselLimit:
      kind==='gull'?habitat.gulls.length<maxGulls:validKind(kind)&&animals.size<10);},
    spawn(kind,started=0,raceAt,raceWind){
      if(!this.canSpawn(kind))return;
      if(Object.hasOwn(vesselNpcNames,kind)){
        if(!Number.isFinite(started))return;
        const vessel={kind,started};
        if(kind==='hobie'&&Number.isSafeInteger(raceAt)&&raceAt%300===0)vessel.raceAt=raceAt;
        if(kind==='hobie'&&Number.isFinite(raceWind))vessel.raceWind=Math.max(0,Math.min(22,raceWind));
        habitat.vessels.push(vessel);revision++;sync();return 'npc-'+habitat.vessels.length;
      }
      if(kind==='gull'){
        const id=addGull();sync();return id;
      }
      let number=2;while(animals.has(kind+'-'+number))number++;
      const id=animals.has(kind)?kind+'-'+number:kind;
      animals.set(id,{id,kind,seat:null});revision++;sync();return id;
    },
    publish(frame){
      if(owner!==self)return;
      last=frame?{frame,owner}:undefined;
      if(members.size)sync();
    }
  };
}

// World contacts reserve the first two slots for the original whale and shark.
export function writeAnimalContacts(roster,current,animals){
  animals.fill(0);
  if(!current)return animals;
  let extra=2;
  for(const a of roster.values()){
    const whale=a.kind==='whale',slot=a.id===a.kind?(whale?0:1):extra++;
    const row=a.frame??(a.id===a.kind?current:null);
    if(!row||slot>=10)continue;
    const k=whale?17:9,yaw=row[k+3],c=Math.cos(yaw),s=Math.sin(yaw);
    const surge=row[whale?27:65]??0,sway=row[whale?38:74]??0;
    animals.set([whale?1:2,row[k],row[k+1],row[k+2],yaw,row[whale?21:67]??0,
      surge*c-sway*s,surge*s+sway*c,row[whale?35:203]??0],9*slot);
  }
  return animals;
}
