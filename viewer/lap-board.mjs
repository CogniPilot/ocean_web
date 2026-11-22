import {isCaptainName} from './captains.mjs';

// Each retained finish has its own storage key so simultaneous tabs cannot
// overwrite one another's laps. Only the ten fastest per course and hull survive.
const limit=10;
const classes={Hobie16:'Hobie 16',Sailboat:'Pilothouse sloop',RDD2:'RDD2 drone'};

export function lapClock(tenths){
  return Math.floor(tenths/600)+':'+((tenths%600)/10).toFixed(1).padStart(4,'0');
}
function valid(row){
  return row && typeof row.id==='string' && /^[a-f0-9]{32}$/.test(row.id) &&
    Number.isSafeInteger(row.tenths) && row.tenths>0 &&
    (row.captain==='You'||isCaptainName(row.captain));
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
        if(valid(row)&&key===prefix+row.id&&!rows.some(r=>r.id===row.id))rows.push(row);
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
      if(valid(row)&&!rows.some(r=>r.id===row.id))rows.push({id:row.id,captain:row.captain,tenths:row.tenths});
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
      item.append(channel?row.captain:'Your lap');
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
  function observe(stage,seconds,captain){
    const entered=stage===5&&!finished.has(hull);
    if(stage===5)finished.add(hull);else finished.delete(hull);
    if(!entered)return;
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const row={id,captain:captain||'You',tenths:Math.round(seconds*10)};
    if(!valid(row))return;
    personal.get(hull).add([row]);
    if(channel&&room.get(hull).add([row]))send();
    render();
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
  return {connect,send,observe,select(kind){if(hull!==kind){hull=kind;render();}}};
}
