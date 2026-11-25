// Exercise recovery without depending on a public signaling relay.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {joinFleetRoom} from '../viewer/fleet-room.mjs';

test('discovery continues with a local sailor and after a WebRTC join',t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const counts={refresh:0,announce:0},network={
    reannounce(){counts.announce++;},getPeers(){return {};},leave(){}
  };
  let bus;
  t.mock.method(globalThis,'BroadcastChannel',function(){
    bus={postMessage(){},close(){}};
    return bus;
  });
  const room=joinFleetRoom({selfId:'a',joinRoom:()=>network,
    refreshRelaySubscriptions(){counts.refresh++;}
  },{appId:'test'},'discovery');
  bus.onmessage({data:{type:'hello',from:'local'}});
  t.mock.timers.tick(6500);
  t.mock.timers.tick(810);
  assert.equal(counts.refresh,1);
  assert.equal(counts.announce,1);
  network.onPeerJoin('remote');
  t.mock.timers.tick(13000);
  t.mock.timers.tick(810);
  assert.equal(counts.announce,2);
  room.leave();
  t.mock.timers.tick(90000);
  assert.equal(counts.announce,2);
});

test('a pending snapshot on a departed link cannot block its replacement',async t=>{
  const sends=[],network={getPeers:()=>({}),reannounce(){},leave(){},
    makeAction:()=>({send:()=>new Promise(resolve=>sends.push(resolve))})
  };
  const room=joinFleetRoom({selfId:'a',joinRoom:()=>network},{appId:'test'},'snapshots');
  t.after(()=>room.leave());
  const action=room.makeAction('pose',{latest:true});
  network.onPeerJoin('b');
  const old=action.send(1);
  network.onPeerLeave('b');
  network.onPeerJoin('b');
  const current=action.send(2);
  assert.equal(sends.length,2);
  sends[0]();
  await old;
  await action.send(3);
  assert.equal(sends.length,2);
  sends[1]();
  await current;
  const next=action.send(4);
  assert.equal(sends.length,3);
  sends[2]();
  await next;
});
