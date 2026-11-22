// Advertise simulation seconds so a slow or paused host sets the pace of the sea.
// Join order breaks ties by peer ID. All connected peers make the same choice.
export class FleetSeaClock {
  constructor(id,joined=Date.now()){
    this.id=id;
    this.joined=joined;
    this.peers=new Map();
    this.offset=0;
  }
  observe(id,message,now){
    if(!Array.isArray(message)||message.length!==2)return;
    const [joined,phase]=message;
    if(!Number.isSafeInteger(joined)||joined<=0||!Number.isFinite(phase)||phase<0)return;
    const last=this.peers.get(id);
    if(last && (joined!==last.joined || now<=last.now))return;
    const rate=last?Math.max(0,Math.min(1.5,(phase-last.phase)*1000/(now-last.now))):0;
    this.peers.set(id,{joined,phase,now,rate});
  }
  sample(local,now,roomHost){
    let leader=this.id,joined=this.joined;
    for(const [id,peer] of this.peers){
      if(now-peer.now>2000)continue;
      if(peer.joined<joined || (peer.joined===joined && id<leader)){
        leader=id;joined=peer.joined;
      }
    }
    if(roomHost&&(roomHost===this.id||this.peers.has(roomHost)))leader=roomHost;
    this.leader=leader;
    if(leader!==this.id){
      const peer=this.peers.get(leader);
      this.offset=peer.phase+peer.rate*Math.min(500,Math.max(0,now-peer.now))/1000-local;
    }
    return local+this.offset;
  }
}
