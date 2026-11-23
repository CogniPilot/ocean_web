import {isCaptainName} from './captains.mjs';

// Each retained finish has its own storage key so simultaneous tabs cannot
// overwrite one another's laps. Only the ten fastest per course and hull survive.
const limit=10;
const classes={Hobie16:'Hobie 16',Sailboat:'Pilothouse sloop',RDD2:'RDD2 drone'};
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
    if(!valid(heat,at)||typeof name!=='string'||!name||name.length>80||results.has(heat))return false;
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
  if(!row||typeof row.id!=='string'||!Number.isSafeInteger(row.tenths)||row.tenths<=0)return false;
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
    rows.sort(compare);
    for(const row of rows.splice(limit)){
      try{storage.removeItem(prefix+row.id);}catch{}
    }
  }
  function add(batch){
    if(!Array.isArray(batch)||batch.length>limit)return false;
    const before=rows.slice();
    for(const row of batch){
      if(valid(row,hull)&&!rows.some(r=>r.id===row.id))rows.push({id:row.id,captain:row.captain,tenths:row.tenths});
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

export function lapLeaderboard(hull,roomName,panel){
  let storage;
  try{storage=window.localStorage;}catch{}
  const panelKey='ocean.racePanel.open';
  try{panel.open=storage.getItem(panelKey)!=='false';}catch{}
  panel.addEventListener('toggle',()=>{
    try{storage.setItem(panelKey,String(panel.open));}catch{}
  });
  const details=panel.querySelector('#bestLaps');
  const personal=new Map(Object.keys(classes).map(kind=>[kind,lapTable(storage,'personal',kind)]));
  const roomTables=name=>new Map(Object.keys(classes).map(kind=>[kind,lapTable(storage,'room/'+name,kind)]));
  let room=roomTables(roomName);
  let channel;
  const finished=new Set();
  const heading=details.querySelector('small'),list=details.querySelector('ol'),empty=details.querySelector('p');
  function render(){
    const rows=(channel?room:personal).get(hull).rows;
    heading.textContent=classes[hull]+' · '+(channel?'Room '+roomName:'This device');
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),time=document.createElement('time');
      item.append(channel||row.id.startsWith('npc-')?(isCaptainName(row.captain)?'Player':row.captain):'Your lap');
      time.textContent=lapClock(row.tenths);
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
    channel=action;
    if(action)action.onMessage=packet=>{
      if(channel!==action)return;
      const table=room.get(packet?.boat);
      if(table?.add(packet.rows)&&packet.boat===hull)render();
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
    const updated=personal.get(boat).add([row]);
    const shared=channel&&room.get(boat).add([row]);
    if(shared)send();
    if((updated||shared)&&boat===hull)render();
  }
  function observeNpc(number,vessel,status,name){
    // Peers and refreshed tabs can observe the same finish. Use the
    // synchronized vessel identity and scheduled heat to keep one entry.
    const spawn=vessel.raceId??Math.round(vessel.started*1000);
    const id='npc-'+number+'-'+status.heatStart+'-'+spawn;
    record('Hobie16',{id,captain:name,tenths:Math.round(status.lapTime*10)});
  }
  window.addEventListener('storage',event=>{
    for(const table of [...personal.values(),...room.values()]){
      if(event.key===null||event.key.startsWith(table.prefix)){
        // Rebuild from the settled storage contents, including deletions.
        table.reload();
        render();
      }
    }
  });
  render();
  return {connect,send,observe,observeNpc,select(kind){if(hull!==kind){hull=kind;render();}}};
}
