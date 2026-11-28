const clockTimeout=2000;
const extrapolationLimit=500;
const correctionRate=.25;

// Keep the shared sea on the host's simulation clock while it is available.
export class FleetSeaClock {
  constructor(id,joined=Date.now()){
    this.id=id;
    this.joined=joined;
    this.peers=new Map();
    this.pausedPeers=new Set();
    this.offset=0;
    this.correction=0;
    this.followedPeer=false;
  }
  observe(id,message,now){
    if(!Array.isArray(message)||message.length!==2)return;
    const [joined,phase]=message;
    if(!Number.isSafeInteger(joined)||joined<=0||!Number.isFinite(phase)||phase<0)return;
    const last=this.peers.get(id);
    if(last && (joined!==last.joined || now<=last.now || phase<last.phase))return;
    const rate=last?Math.max(0,Math.min(1.5,(phase-last.phase)*1000/(now-last.now))):0;
    const progressAt=last&&phase===last.phase?last.progressAt:now;
    this.peers.set(id,{joined,phase,now,rate,progressAt});
  }
  observePause(id,paused,now){
    if(paused===true)this.pausedPeers.add(id);
    else if(paused===false && this.pausedPeers.delete(id)){
      const peer=this.peers.get(id);
      if(peer)peer.progressAt=now;
    }
  }
  remove(id){
    this.peers.delete(id);
    this.pausedPeers.delete(id);
  }
  resume(offset){
    this.offset=offset;
    this.phase=this.sampledAt=this.leader=undefined;
    this.correction=0;
  }
  isFresh(id,now){
    const peer=this.peers.get(id);
    return peer && now-peer.now<=clockTimeout &&
      (this.pausedPeers.has(id) || now-peer.progressAt<=clockTimeout);
  }
  sample(local,now,roomHost){
    let leader=this.id;
    if(roomHost){
      // Echoes of a stalled host's phase from other clients cannot lead.
      if(this.isFresh(roomHost,now))leader=roomHost;
    }else{
      let joined=this.joined;
      for(const [id,peer] of this.peers){
        if(this.isFresh(id,now) && (peer.joined<joined || (peer.joined===joined && id<leader))){
          leader=id;joined=peer.joined;
        }
      }
    }
    const handoff=this.leader!==leader;
    // Joining a room establishes its phase before any subsequent handoff.
    const firstRemote=leader!==this.id && !this.followedPeer;
    let phase=local+this.offset;
    if(leader===this.id){
      if(handoff && this.phase!==undefined)phase=this.phase;
    }else{
      const peer=this.peers.get(leader);
      const paused=this.pausedPeers.has(leader);
      const elapsed=Math.max(0,now-peer.now);
      phase=peer.phase+(paused?0:peer.rate*Math.min(extrapolationLimit,elapsed)/1000);
      if(handoff)this.correction=firstRemote || this.phase===undefined?0:this.phase-phase;
      else if(!paused){
        const correction=Math.min(Math.abs(this.correction),correctionRate*Math.max(0,now-this.sampledAt)/1000);
        this.correction-=Math.sign(this.correction)*correction;
      }
      phase+=this.correction;
      this.followedPeer=true;
    }
    this.phase=Math.max(firstRemote?0:this.phase??0,phase);
    this.offset=this.phase-local;
    this.sampledAt=now;
    this.leader=leader;
    return this.phase;
  }
}
