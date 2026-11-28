import {validRoomName} from './vendor/names.js';

export const fleetRelays=['wss://relay.primal.net','wss://relay.ditto.pub','wss://relay.nostr.net','wss://yabu.me/v2'];
export const publicRoom='regatta';
export const namedRoomId=value=>typeof value==='string'&&/^fleet-[op]-[a-f0-9]{32}$/.test(value);
export const privateRoom=value=>namedRoomId(value)&&value.startsWith('fleet-p-');
export const validFleetRoom=value=>namedRoomId(value)||validRoomName(value);
export const createNamedRoom=locked=>'fleet-'+(locked?'p':'o')+'-'+crypto.randomUUID().replaceAll('-','');

export async function namedRoomChannel(id,password){
  if(!namedRoomId(id))throw Error('Invalid server invitation');
  if(!privateRoom(id))return id;
  if(typeof password!=='string'||!password.length||password.length>128)throw Error('Enter the server password.');
  const text=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',text.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({
    name:'PBKDF2',salt:text.encode('ocean-web/'+id),iterations:310000,hash:'SHA-256'
  },key,256);
  return 'locked-'+Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function publicChannel(number){
  return number===1?publicRoom:'regatta/fleet/'+number;
}

// Public relay messages and same-browser announcements carry occupancy hints only.
// A configured seat service supplies authoritative occupancy and admission instead.
export function observeDirectory({signal,onList,getFleet}){
  const topic='ocean-web-public-fleets-v1',active=new Map(),sockets=new Set();
  let bus,events,lastAnswer=-Infinity;
  function render(){
    const now=Date.now();
    for(const [n,row] of active)if(now-row.time>35000)active.delete(n);
    onList?.([...active.values()]);
  }
  function send(message){
    if(signal.aborted)return;
    bus?.postMessage(message);
    if(events&&sockets.size)void events.createEvent(topic,JSON.stringify(message)).then(wire=>{
      for(const socket of sockets)if(socket.readyState===1)socket.send(wire);
    }).catch(()=>{});
  }
  function announce(){
    const fleet=getFleet?.();
    if(!fleet)return;
    lastAnswer=Date.now();
    send(fleet);
  }
  function receive(row){
    if(row==='list'){
      if(Date.now()-lastAnswer>1200)announce();
      return;
    }
    if(!onList||!Number.isInteger(row?.count)||row.count<1||row.count>10)return;
    const named=namedRoomId(row.id);
    if(named?!validRoomName(row.name):!Number.isSafeInteger(row.fleet)||row.fleet<1||row.fleet>1000000)return;
    const key=named?row.id:row.fleet;
    if(!active.has(key)&&active.size>=128)return;
    const entry=named?{id:row.id,name:row.name.trim()}:{fleet:row.fleet};
    active.set(key,{...entry,count:row.count,time:Date.now()});render();
  }
  try{bus=new BroadcastChannel(topic);bus.onmessage=e=>receive(e.data);}catch{}
  function refresh(){
    if(onList){render();send('list');}
    else announce();
  }
  const timer=setInterval(refresh,12000),timers=new Set();
  signal.addEventListener('abort',()=>{
    clearInterval(timer);for(const t of timers)clearTimeout(t);
    bus?.close();for(const s of sockets)s.close();sockets.clear();
  },{once:true});
  function connect(address){
    if(signal.aborted)return;
    const socket=new WebSocket(address);
    sockets.add(socket);
    socket.onopen=()=>{
      if(signal.aborted)return;
      socket.send(events.subscribe('fleets',topic));refresh();
    };
    socket.onmessage=e=>{
      if(typeof e.data!=='string'||e.data.length>2048)return;
      try{
        const [kind,id,event]=JSON.parse(e.data);
        if(kind==='EVENT'&&id==='fleets'&&event.tags?.some(tag=>tag[0]==='x'&&tag[1]===topic)&&
          Math.abs(Date.now()/1000-event.created_at)<150)receive(JSON.parse(event.content));
      }catch{}
    };
    socket.onclose=()=>{
      sockets.delete(socket);
      if(!signal.aborted){const t=setTimeout(()=>{timers.delete(t);connect(address);},15000);timers.add(t);}
    };
  }
  refresh();
  if(globalThis.crypto?.subtle)void import('./vendor/trystero.mjs').then(module=>{
    events=module;if(!signal.aborted)for(const address of fleetRelays.slice(0,2))connect(address);
  }).catch(()=>{});
}
