import {isCaptainName} from './captains.mjs';

// Each retained finish has its own storage key so simultaneous tabs cannot
// overwrite one another's laps. Only the ten fastest per course and hull survive.
const limit=10;
const classes={Hobie16:'Hobie 16',Sailboat:'Pilothouse sloop',RDD2:'RDD2 drone',motorboat:'Cabin cruiser',sub:'Piccard submarine',gull:'Herring gull',whale:'Humpback whale',shark:'Great white shark',manta:'Manta ray',diver:'Scuba diver'};
const feedingKinds=['shark','manta','whale'];
const boards=[...Object.keys(classes),...feedingKinds.map(kind=>kind+'-feeding')];
const feeding=board=>board.endsWith('-feeding');
const controllers={vmg:'VMG autopilot',rl:'RL policy',nmpc:'Scenario NMPC',mppi:'MPPI'};
const playerNumber=/^Player #(?:0|[1-9]\d?)$/;
const npcNumber=/^NPC #(?:0|[1-9]\d?)$/;

export function lapClock(tenths){
  return Math.floor(tenths/600)+':'+((tenths%600)/10).toFixed(1).padStart(4,'0');
}

export function fleetFinishes(){
  const pending=new Map(),results=new Map();
  function valid(heat,at){return Number.isFinite(heat)&&Number.isFinite(at)&&at>heat&&at-heat<3600;}
  function propose(heat,at,id,name,now){
    if(!valid(heat,at)||results.has(heat))return;
    const prior=pending.get(heat);
    if(!prior||at<prior.at||at===prior.at&&id<prior.id)
      pending.set(heat,{heat,at,id,name,since:prior?.since??now});
  }
  function accept(heat,at,name){
    if(!valid(heat,at)||typeof name!=='string'||name.length>40||results.has(heat))return false;
    if(!playerNumber.test(name)&&!npcNumber.test(name)&&!isCaptainName(name)&&
      name!=='Player'&&name!=='NPC'&&!/^NPC [1-5]$/.test(name))return false;
    results.set(heat,{heat,at,name});pending.delete(heat);
    if(results.size>8)results.delete(Math.min(...results.keys()));
    return true;
  }
  return {
    propose,accept,get:heat=>results.get(heat),history:()=>Array.from(results.values()),
    settle(now,delay,announce){
      for(const {heat,at,name,since} of pending.values()){
        if(now-since>=delay&&accept(heat,at,name))announce(heat,at,name);
      }
    },
    clear(){pending.clear();results.clear();}
  };
}
function valid(row,hull){
  if(!row||typeof row.id!=='string'||(feeding(hull)?!Number.isSafeInteger(row.count)||row.count<0:!Number.isSafeInteger(row.tenths)||row.tenths<=0))return false;
  const npc=/^npc-([1-5])-\d{1,15}-(?:[a-f0-9]{16}|-?\d{1,15})$/.exec(row.id);
  if(npc)return hull==='Hobie16'&&(npcNumber.test(row.captain)||row.captain==='NPC '+npc[1]);
  return /^[a-f0-9]{32}$/.test(row.id)&&(row.captain==='You'||playerNumber.test(row.captain)||isCaptainName(row.captain));
}
function compare(a,b){
  return a.tenths-b.tenths || (a.id<b.id?-1:a.id>b.id?1:0);
}
export function lapTable(storage,scope,hull){
  const prefix='ocean.laps.v1.TRI1.'+encodeURIComponent(scope)+'.'+hull+'.';
  let rows=[];
  function read(){
    try{
      for(let i=0;i<storage.length;i++){
        const key=storage.key(i);
        if(!key?.startsWith(prefix))continue;
        let row;
        try{row=JSON.parse(storage.getItem(key));}catch{continue;}
        if(valid(row,hull)&&key===prefix+row.id&&!rows.some(r=>r.id===row.id))rows.push(row);
      }
    }catch{/* Storage may be unavailable in private browsing. */}
    trim();
  }
  function trim(){
    rows.sort(feeding(hull)?(a,b)=>b.count-a.count||a.id.localeCompare(b.id):compare);
    for(const row of rows.splice(limit)){
      try{storage.removeItem(prefix+row.id);}catch{}
    }
  }
  function add(batch){
    if(!Array.isArray(batch)||batch.length>limit)return false;
    const before=rows.slice();
    for(const row of batch){
      if(valid(row,hull)&&!rows.some(r=>r.id===row.id))rows.push({id:row.id,captain:row.captain,...(feeding(hull)?{count:row.count}:{tenths:row.tenths}),...(Object.hasOwn(controllers,row.controller)?{controller:row.controller}:{})});
    }
    trim();
    for(const row of rows){
      if(!before.includes(row)){
        try{storage.setItem(prefix+row.id,JSON.stringify(row));}catch{}
      }
    }
    return rows.some((row,i)=>row!==before[i]);
  }
  read();
  return {
    reload(){rows=[];read();},
    add,prefix,
    get rows(){return rows.slice();}
  };
}

// A feeding heat uses the race committee's UTC schedule. Catch counters are
// cumulative on the habitat authority, so establish the baseline at the signal.
export function feedingHeat(){
  let last;
  return {
    reset(){last=undefined;},
    sample(utc,start,total,eligible){
      if(!Number.isFinite(utc)||!Number.isFinite(start)||!Number.isSafeInteger(total)||total<0){
        last=undefined;return;
      }
      const heat=start+300*Math.floor((utc-start)/300);
      const continuous=last&&last.start===start&&utc>=last.utc&&utc-last.utc<=2&&total>=last.total;
      const atSignal=utc>=start&&(utc===heat||continuous&&last.heat+300===heat);
      let completed;
      if(continuous&&last.heat+300===heat&&last.eligible&&eligible)completed=last.total-last.base;
      if(!continuous||last.heat!==heat){
        const base=continuous?last.total:total;
        last={heat,start,base,total,utc,eligible:Boolean(atSignal&&eligible)};
      }else{
        last.eligible&&=eligible;
        last.total=total;last.utc=utc;
      }
      return {count:total-last.base,eligible:last.eligible,completed};
    }
  };
}

// A Regatta instance samples only one continuously controlled trajectory.
// Re-seed at the first position of each seat and after discontinuities so a
// change of vehicle cannot become a gate crossing.
export function controlledRace(create){
  let key,pending,model,previous,nextAttempt=0,generation=0;
  function reset(){
    if(key===undefined&&!pending&&!model)return;
    generation++;model?.close();model=undefined;pending=undefined;previous=undefined;key=undefined;nextAttempt=0;
  }
  return {reset,get generation(){return generation;},
    sample(id,position,time,utc,start,course,trajectoryTime=time){
      if(!position||!Number.isFinite(position[0])||!Number.isFinite(position[1])||!Number.isFinite(time)||!Number.isFinite(utc)){
        if(key!==undefined)reset();return;
      }
      const [east,north]=position,dt=previous?time-previous.time:0;
      if(id!==key||previous&&(dt<0||trajectoryTime<previous.trajectoryTime||Math.hypot(east-previous.east,north-previous.north)>12+80*Math.min(dt,.5))){
        reset();key=id;
      }
      if(!model){
        if(!pending&&time>=nextAttempt){
          const ticket=generation;
          previous={time,trajectoryTime,east,north};
          pending=create({east,north,utc,raceStart:start,coursePoints:course()}).then(loaded=>{
            if(generation!==ticket){loaded.close();return;}
            model=loaded;pending=undefined;
          }).catch(error=>{
            if(generation!==ticket)return;
            pending=undefined;nextAttempt=time+5;console.error('Race committee',error);
          });
        }
        return;
      }
      if(dt>=.049){
        model.set('east',east);model.set('north',north);model.set('utc',utc);
        model.set('raceStart',start);model.set('coursePoints',course());
        model.advance(Math.min(dt,.1));previous={time,trajectoryTime,east,north};
      }
      return model;
    }
  };
}

export function lapLeaderboard(hull,roomName,panel,signal){
  let storage;
  try{storage=window.localStorage;}catch{}
  const details=panel.querySelector('#bestLaps');
  const personal=new Map(boards.map(kind=>[kind,lapTable(storage,'personal',kind)]));
  const roomTables=name=>new Map(boards.map(kind=>[kind,lapTable(storage,'room/'+name,kind)]));
  let room=roomTables(roomName);
  let channel;
  const finished=new Set();
  const selection=details.querySelector('select');
  selection.replaceChildren();
  for(const board of boards){
    const name=classes[board.replace(/-feeding$/,'')];
    selection.add(new Option(name+(feeding(board)?' · 5 min feeding':' · Lap time'),board));
  }
  selection.value=hull;selection.onchange=render;
  const heading=details.querySelector('small'),list=details.querySelector('ol'),empty=details.querySelector('p');
  function render(){
    const board=selection.value||hull;
    const rows=(channel?room:personal).get(board).rows;
    heading.textContent=channel?'Room '+roomName:'This device';
    empty.textContent=feeding(board)?'No completed feeding heats yet.':'No finished laps yet.';
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),time=document.createElement('time');
      item.append(channel||row.id.startsWith('npc-')?(isCaptainName(row.captain)?'Player':row.captain):'You');
      if(row.controller)item.append(' · '+controllers[row.controller]);
      time.textContent=feeding(board)?row.count+' caught':lapClock(row.tenths);
      item.append(time);
      list.append(item);
    }
    empty.hidden=rows.length>0;
  }
  function send(target){
    if(!channel)return;
    for(const [boat,table] of room){
      const rows=table.rows;
      if(rows.length)channel.send({boat,rows},target?{target}:undefined).catch(()=>{});
    }
  }
  function connect(action,name=roomName){
    if(name!==roomName){roomName=name;room=roomTables(name);}
    if(action!==channel)finished.clear();
    channel=action;
    if(action)action.onMessage=packet=>{
      if(channel!==action)return;
      const table=room.get(packet?.boat);
      if(table?.add(packet.rows)&&packet.boat===selection.value)render();
    };
    render();
  }
  function observe(stage,seconds,captain,eligible=true){
    const entered=stage===5&&!finished.has(hull);
    if(stage===5)finished.add(hull);else finished.delete(hull);
    if(!entered||!eligible)return;
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const row={id,captain:captain||'You',tenths:Math.round(seconds*10)};
    record(hull,row);
  }
  function record(boat,row){
    if(!valid(row,boat))return;
    const updated=!channel&&personal.get(boat).add([row]);
    const shared=channel&&room.get(boat).add([row]);
    if(shared)send();
    if((updated||shared)&&boat===selection.value)render();
  }
  function observeNpc(number,vessel,status,name){
    // Peers and refreshed tabs can observe the same finish. Use the
    // synchronized vessel identity and scheduled heat to keep one entry.
    const spawn=vessel.raceId??Math.round(vessel.started*1000);
    const id='npc-'+number+'-'+status.heatStart+'-'+spawn;
    record('Hobie16',{id,captain:name,controller:vessel.controller??'vmg',tenths:Math.round(status.lapTime*10)});
  }
  window.addEventListener('storage',event=>{
    for(const table of [...personal.values(),...room.values()]){
      if(event.key===null||event.key.startsWith(table.prefix)){
        // Rebuild from the settled storage contents, including deletions.
        table.reload();
        render();
      }
    }
  },{signal});
  render();
  return {connect,send,observe,observeNpc,
    recordFeeding(kind,count,captain){
      if(!feedingKinds.includes(kind))return;
      const id=crypto.randomUUID().replaceAll('-','');
      record(kind+'-feeding',{id,captain:captain||'You',count});
    },
    select(kind){if(classes[kind]&&hull!==kind){hull=kind;selection.value=kind;render();}}
  };
}
