// Keep the fleet session intact while an isolated WebRTC room rediscovers peers.
export function joinFleetRoom(transport,config,name,callbacks){
  let bus;
  try{bus=new BroadcastChannel('ocean-web/'+config.appId+'/'+name);}catch{}
  const self=transport.selfId,local=new Map(),online=new Map(),actions=new Map();
  let closed=false,network,recovery;
  const room={
    makeAction(name,{latest=false}={}){
      const pending=new Map();
      const action={
        async send(data,{target}={}){
          if(closed)return;
          if(bus&&(!target?local.size:local.has(target)))post('data',target,name,data);
          const remote=entry.remote;
          if(!remote||local.has(target))return;
          if(!latest){
            if(target)await remote.send(data,{target});
            else if(!local.size)await remote.send(data);
            else await Promise.all([...online.keys()].filter(id=>!local.has(id)).map(id=>remote.send(data,{target:id})));
            return;
          }
          // Avoid queuing stale positions or letting a slow peer stall the rest.
          const targets=target?[target]:online.keys();
          await Promise.all([...targets].map(async id=>{
            if(local.has(id)||pending.get(id)===remote)return;
            pending.set(id,remote);
            try{await remote.send(data,{target:id});}
            finally{if(pending.get(id)===remote)pending.delete(id);}
          }));
        }
      };
      const entry={action,remote:null};
      actions.set(name,entry);
      if(network)bindAction(network,name,entry);
      return action;
    },
    recover(delay=800){
      if(closed||!network||online.size||navigator.onLine===false)return;
      clearTimeout(recovery);
      recovery=setTimeout(async()=>{
        if(closed||!network||online.size||navigator.onLine===false)return;
        const old=network;
        network=null;
        for(const entry of actions.values())entry.remote=null;
        room.onRecover?.();
        try{await old.leave();}
        finally{if(!closed)openNetwork();}
      },delay+Math.random()*800);
    },
    leave(){
      if(closed)return;
      closed=true;
      clearTimeout(recovery);
      clearInterval(heartbeat);
      if(bus){post('bye');bus.close();}
      return network?.leave();
    }
  };
  function bindAction(active,name,entry){
    const remote=active.makeAction(name);
    entry.remote=remote;
    remote.onMessage=(data,meta)=>{if(!closed&&network===active)entry.action.onMessage?.(data,meta);};
  }
  function openNetwork(){
    let active;
    active=network=transport.joinRoom(config,name,{
      onJoinError(error){if(!closed&&network===active)callbacks?.onJoinError?.(error);}
    });
    active.onPeerJoin=id=>{
      if(closed||network!==active||online.has(id))return;
      clearTimeout(recovery);
      online.set(id,active.getPeers()[id]);
      if(!local.has(id))room.onPeerJoin?.(id);
    };
    active.onPeerLeave=id=>{
      if(closed||network!==active||!online.has(id))return;
      const connection=online.get(id);
      online.delete(id);
      // Close the old link at both ends before announcing a replacement.
      connection?.close();
      if(!local.has(id))room.onPeerLeave?.(id);
      if(!online.size)room.recover(2400);
    };
    for(const [name,entry] of actions)bindAction(active,name,entry);
  }
  function post(type,target,action,data){bus.postMessage({type,from:self,target,action,data});}
  function forgetLocal(id){if(local.delete(id)&&!online.has(id))room.onPeerLeave?.(id);}
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
  openNetwork();
  return room;
}
