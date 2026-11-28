// Keep existing peer links while the WebRTC room rediscovers other sailors.
export function joinFleetRoom(transport,config,name,callbacks){
  let bus;
  try{bus=new BroadcastChannel('ocean-web/'+config.appId+'/'+name);}catch{}
  const self=transport.selfId,local=new Map(),online=new Map(),actions=new Map();
  let closed=false,recovery,recoverAt=Infinity,discovery;
  // Normal pose traffic is 10 Hz. Leave room for habitat snapshots and
  // reliable updates while bounding gameplay handler work for each peer.
  function receive(action,data,meta){
    const link=online.get(meta.peerId)??local.get(meta.peerId);
    if(!link||!action?.onMessage)return;
    const now=performance.now();
    link.tokens=Math.min(96,(link.tokens??96)+.18*(now-(link.received??now)));
    link.received=now;
    if(link.tokens<1)return;
    link.tokens--;
    action.onMessage(data,meta);
  }
  const network=transport.joinRoom(config,name,{
    onJoinError(error){if(!closed)callbacks?.onJoinError?.(error);}
  });
  const room={
    makeAction(name,{latest=false}={}){
      const pending=new Map();
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
            const link=online.get(id);
            if(local.has(id)||!link||pending.get(id)===link)return;
            pending.set(id,link);
            try{await remote.send(data,{target:id});}
            finally{if(pending.get(id)===link)pending.delete(id);}
          }));
        }
      };
      remote.onMessage=(data,meta)=>{if(!closed)receive(action,data,meta);};
      actions.set(name,action);
      return action;
    },
    recover(delay=800){
      if(closed||navigator.onLine===false)return;
      const wait=delay+Math.random()*800,deadline=performance.now()+wait;
      if(recoverAt<=deadline)return;
      recoverAt=deadline;
      clearTimeout(recovery);
      recovery=setTimeout(()=>{
        recoverAt=Infinity;
        if(closed||navigator.onLine===false)return;
        transport.refreshRelaySubscriptions?.();
        room.onRecover?.();
        network.reannounce();
      },wait);
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
  // A healthy link to one sailor says nothing about discovery of the next.
  function retryDiscovery(delay=6500){
    clearTimeout(discovery);
    if(closed)return;
    discovery=setTimeout(()=>{
      if(navigator.onLine!==false){
        if(online.size)network.reannounce();
        else room.recover(0);
      }
      retryDiscovery(online.size?60000:Math.min(30000,delay*2));
    },delay);
  }
  network.onPeerJoin=id=>{
    if(closed||online.has(id))return;
    online.set(id,{connection:network.getPeers()[id]});
    if(!local.has(id))room.onPeerJoin?.(id);
  };
  network.onPeerLeave=id=>{
    if(closed||!online.has(id))return;
    const {connection}=online.get(id);
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
        const link=local.get(id)??{};
        link.seen=performance.now();
        local.set(id,link);
        if(joined)room.onPeerJoin?.(id);
        if(msg.type==='data')receive(actions.get(msg.action),msg.data,{peerId:id});
      }
    };
    heartbeat=setInterval(()=>{
      for(const [id,link] of local)if(performance.now()-link.seen>15000)forgetLocal(id);
      post('hello');
    },2500);
    post('hello');
  }
  retryDiscovery();
  return room;
}
