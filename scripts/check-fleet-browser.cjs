const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {join}=require('node:path');
const playwright=require('playwright');
const {WebSocketServer}=require('ws');

async function verify(engine){
  const modules=new Set(['/fleet-room.mjs','/vendor/trystero.mjs']);
  const server=createServer(async(req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Fleet WebRTC test</title>');return;}
    if(!modules.has(req.url)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','text/javascript');
    res.end(await readFile(join(__dirname,'../viewer',req.url)));
  });
  // Run the production Nostr client against a deterministic signaling relay.
  const relay=new WebSocketServer({server});
  const subscriptions=new Map(),history=new Map();
  function deliver(socket,id,filter,event){
    if(filter.kinds.includes(event.kind)&&event.created_at>=(filter.since??0)&&
      event.tags.some(([type,tag])=>type==='x'&&filter['#x'].includes(tag)))
      socket.send(JSON.stringify(['EVENT',id,event]));
  }
  relay.on('connection',socket=>{
    const filters=new Map();subscriptions.set(socket,filters);
    socket.on('close',()=>subscriptions.delete(socket));
    socket.on('message',data=>{
      const [action,value,filter]=JSON.parse(data);
      if(action==='REQ'){
        filters.set(value,filter);
        for(const event of history.values())deliver(socket,value,filter,event);
        socket.send(JSON.stringify(['EOSE',value]));
      }else if(action==='CLOSE')filters.delete(value);
      else if(action==='EVENT'){
        socket.send(JSON.stringify(['OK',value.id,true,'']));
        if(history.has(value.id))return;
        history.set(value.id,value);
        for(const [client,topics] of subscriptions)
          for(const [id,filter] of topics)deliver(client,id,filter,value);
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const host='127.0.0.1:'+server.address().port,channel='fleet-ci-'+randomUUID(),browsers=[];
  async function open(browserType){
    const isChromium=browserType==='chromium',executablePath=isChromium?process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE:undefined;
    const browser=await playwright[browserType].launch({executablePath,
      ...(isChromium?{args:['--disable-features=WebRtcHideLocalIpsWithMdns']}:{}),
      ...(browserType==='firefox'?{firefoxUserPrefs:{'media.peerconnection.ice.obfuscate_host_addresses':false}}:{})});
    browsers.push(browser);
    const page=await browser.newPage();
    await page.addInitScript(()=>{globalThis.BroadcastChannel=undefined;});
    await page.goto('http://'+host+'/');
    await page.evaluate(async({host,channel})=>{
      const transport=await import('/vendor/trystero.mjs');
      const {joinFleetRoom}=await import('/fleet-room.mjs');
      window.received=[];
      window.joinErrors=[];
      window.fleet=joinFleetRoom(transport,{appId:'ocean-fleet-ci',relayConfig:{urls:['ws://'+host]}},channel,
        {onJoinError({error}){window.joinErrors.push(String(error));}});
      window.peers=new Set();
      fleet.onPeerJoin=id=>peers.add(id);
      fleet.onPeerLeave=id=>peers.delete(id);
      window.pose=fleet.makeAction('sail-pose',{latest:true});
      pose.onMessage=data=>received.push(Array.from(data));
    },{host,channel});
    return page;
  }
  try{
    const first=await open('chromium'),second=await open(engine);
    await Promise.all([first,second].map(page=>page.waitForFunction(()=>peers.size===1,null,{timeout:30000})
      .catch(async error=>{throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>joinErrors)));})));
    await first.evaluate(()=>pose.send(Uint8Array.of(1,2,3)));
    await second.evaluate(()=>pose.send(Uint8Array.of(4,5,6)));
    await Promise.all([first,second].map(page=>page.waitForFunction(()=>received.length===1)));
    assert.deepEqual(await first.evaluate(()=>received),[[4,5,6]]);
    assert.deepEqual(await second.evaluate(()=>received),[[1,2,3]]);
    await second.evaluate(()=>fleet.leave());
    await first.waitForFunction(()=>peers.size===0,null,{timeout:10000});
    console.log('Chromium and '+engine+' joined, exchanged binary data and handled departure through native WebRTC.');
  }finally{
    await Promise.all(browsers.map(browser=>browser.close()));
    for(const socket of relay.clients)socket.terminate();
    relay.close();server.close();
  }
}
verify(process.argv[2]??'chromium').catch(error=>{console.error(error);process.exitCode=1;});
