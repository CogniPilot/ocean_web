// The lobby owns the ten seats. Players connect to the returned WebRTC channel.
export async function reserveFleetSeat(endpoint,room,fleet=1,exact=false){
  const token=crypto.randomUUID();
  async function request(action,fields={}){
    return fetch(endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
      body:JSON.stringify({action,token,...fields}),keepalive:action==='leave',
      signal:AbortSignal.timeout(6000)
    });
  }
  let started=Date.now();
  let data;
  try{
    let response;
    try{response=await request('join',{room,fleet,exact});}
    catch{
      // A lost reply can still have committed the seat. Reuse its token.
      started=Date.now();
      response=await request('join',{room,fleet,exact});
    }
    if(response.status===409)throw Error('Fleet full');
    if(!response.ok)throw Error('Room service unavailable');
    data=await response.json();
  }catch(error){void request('leave').catch(()=>{});throw error;}
  let expires,refreshTurnAt=started+1800000,timer,deadline,closed=false,renewing=false;
  const seat={
    fleet:data.fleet,channel:data.channel,servers:data.iceServers??[],
    check(){
      if(closed)return;
      if(Date.now()>=expires){expire();return;}
      void renew();
    },
    leave(){
      if(closed)return;
      closed=true;
      clearTimeout(timer);clearTimeout(deadline);
      void request('leave').catch(()=>{});
    }
  };
  function expire(){
    if(closed)return;
    seat.leave();
    seat.onExpired?.();
  }
  function schedule(seconds){
    if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)throw Error('Invalid seat lifetime');
    expires=started+seconds*1000;
    clearTimeout(deadline);
    deadline=setTimeout(expire,Math.max(0,expires-Date.now()));
    clearTimeout(timer);
    timer=setTimeout(seat.check,seconds*1000/4);
  }
  async function renew(){
    if(renewing||closed)return;
    renewing=true;
    try{
      started=Date.now();
      const refreshTurn=started>=refreshTurnAt;
      const response=await request('renew',{refreshTurn});
      if(closed)return;
      if(response.status===410){expire();return;}
      if(!response.ok)throw Error('Renewal unavailable');
      const next=await response.json();
      if(closed)return;
      if(next.channel!==seat.channel||next.fleet!==seat.fleet){expire();return;}
      if(refreshTurn&&Array.isArray(next.iceServers)){
        seat.servers.splice(0,seat.servers.length,...next.iceServers);
        refreshTurnAt=started+1800000;
      }
      schedule(next.leaseSeconds);
    }catch{
      if(!closed){clearTimeout(timer);timer=setTimeout(seat.check,3000);}
    }finally{renewing=false;}
  }
  try{
    if(!Number.isSafeInteger(seat.fleet)||seat.fleet<1||typeof seat.channel!=='string'||!seat.channel)
      throw Error('Invalid room assignment');
    schedule(data.leaseSeconds);
    return seat;
  }catch(error){seat.leave();throw error;}
}
