// Use a single participant identity across same-browser tabs and WebRTC peers.
export function joinFleetRoom(transport,config,name,callbacks){
  const network=transport.joinRoom(config,name,callbacks);
  let bus;
  try{bus=new BroadcastChannel('ocean-web/'+config.appId+'/'+name);}
  catch{return network;}
  const self=transport.selfId,local=new Map(),online=new Set(),actions=new Map();
  let closed=false;
  const room={
    makeAction(name){
      const remote=network.makeAction(name);
      const action={async send(data,{target}={}){
        if(closed)return;
        if(target){
          if(local.has(target))post('data',target,name,data);
          else await remote.send(data,{target});
        }else if(local.size){
          post('data',null,name,data);
          await Promise.all([...online].filter(id=>!local.has(id)).map(id=>remote.send(data,{target:id})));
        }else await remote.send(data);
      }};
      remote.onMessage=(data,meta)=>{if(!closed)action.onMessage?.(data,meta);};
      actions.set(name,action);
      return action;
    },
    leave(){
      if(closed)return;
      closed=true;
      clearInterval(heartbeat);
      post('bye');
      bus.close();
      return network.leave();
    }
  };
  function post(type,target,action,data){bus.postMessage({type,from:self,target,action,data});}
  function forgetLocal(id){if(local.delete(id)&&!online.has(id))room.onPeerLeave?.(id);}
  network.onPeerJoin=id=>{
    if(!closed&&!online.has(id)){
      online.add(id);
      if(!local.has(id))room.onPeerJoin?.(id);
    }
  };
  network.onPeerLeave=id=>{if(!closed&&online.delete(id)&&!local.has(id))room.onPeerLeave?.(id);};
  bus.onmessage=({data:msg})=>{
    if(closed||!msg||typeof msg.from!=='string'||msg.from===self||(msg.target&&msg.target!==self))return;
    const id=msg.from;
    if(msg.type==='bye'){forgetLocal(id);return;}
    if(msg.type==='hello')post('here',id);
    if(msg.type==='hello'||msg.type==='here'||msg.type==='data'){
      const joined=!local.has(id)&&!online.has(id);
      local.set(id,performance.now());
      if(joined)room.onPeerJoin?.(id);
      if(msg.type==='data')actions.get(msg.action)?.onMessage?.(msg.data,{peerId:id});
    }
  };
  const heartbeat=setInterval(()=>{
    for(const [id,seen] of local)if(performance.now()-seen>15000)forgetLocal(id);
    post('hello');
  },2500);
  post('hello');
  return room;
}
