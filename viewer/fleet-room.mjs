// Keep existing peer links while the WebRTC room rediscovers other sailors.
export function joinFleetRoom(transport,config,name,callbacks){
  let bus;
  try{bus=new BroadcastChannel('ocean-web/'+config.appId+'/'+name);}catch{}
  const self=transport.selfId,local=new Map(),online=new Map(),actions=new Map();
  let closed=false,recovery,discovery;
  const network=transport.joinRoom(config,name,{
    onJoinError(error){if(!closed)callbacks?.onJoinError?.(error);}
  });
  const room={
    makeAction(name,{latest=false}={}){
      const pending=new Set();
      const remote=network.makeAction(name);
      const action={
        async send(data,{target}={}){
          if(closed)return;
          if(bus&&(!target?local.size:local.has(target)))post('data',target,name,data);
          if(local.has(target))return;
          if(!latest){
            if(target)await remote.send(data,{target});
            else if(!local.size)await remote.send(data);
            else await Promise.all([...online.keys()].filter(id=>!local.has(id)).map(id=>remote.send(data,{target:id})));
            return;
          }
          // Avoid queuing stale positions or letting a slow peer stall the rest.
          const targets=target?[target]:online.keys();
          await Promise.all([...targets].map(async id=>{
            if(local.has(id)||pending.has(id))return;
            pending.add(id);
            try{await remote.send(data,{target:id});}
            finally{pending.delete(id);}
          }));
        }
      };
      remote.onMessage=(data,meta)=>{if(!closed)action.onMessage?.(data,meta);};
      actions.set(name,action);
      return action;
    },
    recover(delay=800){
      if(closed||navigator.onLine===false)return;
      clearTimeout(recovery);
      recovery=setTimeout(()=>{
        if(closed||navigator.onLine===false)return;
        transport.refreshRelaySubscriptions?.();
        room.onRecover?.();
        network.reannounce();
      },delay+Math.random()*800);
    },
    leave(){
      if(closed)return;
      closed=true;
      clearTimeout(recovery);
      clearTimeout(discovery);
      clearInterval(heartbeat);
      if(bus){post('bye');bus.close();}
      return network.leave();
    }
  };
  // Restore discovery if every peer is gone, including after a missed join.
  function retryDiscovery(delay=6500){
    clearTimeout(discovery);
    if(closed||local.size||online.size)return;
    discovery=setTimeout(()=>{
      room.recover(0);
      retryDiscovery(Math.min(30000,delay*2));
    },delay);
  }
  network.onPeerJoin=id=>{
    if(closed||online.has(id))return;
    online.set(id,network.getPeers()[id]);
    clearTimeout(discovery);
    if(!local.has(id))room.onPeerJoin?.(id);
  };
  network.onPeerLeave=id=>{
    if(closed||!online.has(id))return;
    const connection=online.get(id);
    online.delete(id);
    connection?.close();
    if(!local.has(id))room.onPeerLeave?.(id);
    room.recover();
    retryDiscovery();
  };
  function post(type,target,action,data){bus.postMessage({type,from:self,target,action,data});}
  function forgetLocal(id){
    if(!local.delete(id)||online.has(id))return;
    room.onPeerLeave?.(id);
    retryDiscovery();
  }
  let heartbeat;
  if(bus){
    bus.onmessage=({data:msg})=>{
      if(closed||!msg||typeof msg.from!=='string'||msg.from===self||(msg.target&&msg.target!==self))return;
      const id=msg.from;
      if(msg.type==='bye'){forgetLocal(id);return;}
      if(msg.type==='hello')post('here',id);
      if(msg.type==='hello'||msg.type==='here'||msg.type==='data'){
        const joined=!local.has(id)&&!online.has(id);
        local.set(id,performance.now());
        clearTimeout(discovery);
        if(joined)room.onPeerJoin?.(id);
        if(msg.type==='data')actions.get(msg.action)?.onMessage?.(msg.data,{peerId:id});
      }
    };
    heartbeat=setInterval(()=>{
      for(const [id,seen] of local)if(performance.now()-seen>15000)forgetLocal(id);
      post('hello');
    },2500);
    post('hello');
  }
  retryDiscovery();
  return room;
}
