// Run with a packaged viewer and Chromium started with --remote-debugging-port=9222.
// node scripts/check-hobie-reflection.mjs http://127.0.0.1:18587 http://127.0.0.1:9222
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';

const [viewer='http://127.0.0.1:18587',cdp='http://127.0.0.1:9222']=process.argv.slice(2);
const target=await(await fetch(cdp+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;
const pending=new Map();
ws.onmessage=({data})=>{
  const {id,result,error}=JSON.parse(data);
  if(!pending.has(id))return;
  const {resolve,reject}=pending.get(id);pending.delete(id);
  if(error)reject(Error(error.message));else resolve(result);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){
  const reply=await send('Runtime.evaluate',{expression,returnByValue:true});
  if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description??reply.exceptionDetails.text);
  return reply.result.value;
}
function installHook(){
  document.addEventListener('load',event=>{
    if(!event.target.src?.includes('atmosphere.js'))return;
    const create=window.atmosphere;
    window.atmosphere=(scene,...args)=>{
      const ocean=create(scene,...args),sky=ocean.updateSky;
      ocean.updateSky=(renderer,...rest)=>{
        window.hobieReflectionTest={ocean,scene,renderer};
        return sky(renderer,...rest);
      };
      return ocean;
    };
  },true);
}
function measure(){
  const {ocean,scene,renderer}=window.hobieReflectionTest,T=window.THREE,U=ocean.U;
  const width=300,height=240,rt=new T.WebGLRenderTarget(width,height);
  const eye=new T.PerspectiveCamera(39,width/height,.045,500),{x,y}=U.boat.value;
  const marker=new T.Mesh(new T.BoxGeometry(1.5,.20,1.50),new T.MeshBasicMaterial({color:0xff0000}));
  scene.add(marker);marker.layers.enable(2);
  for(const obj of scene.children)obj.visible=obj===ocean.water;
  const tile=U.tile.value.image.data;
  tile.fill(0);for(let i=0;i<tile.length;i+=4)tile[i]=tile[i+2]=128;
  U.tile.value.needsUpdate=true;
  for(const key of ['tm','wind','referenceWind','rippleScale','spectrumPeriod','windFieldActive','wakeAvailable','bowAvailable','under'])U[key].value=0;
  U.whitecapBounds.value.z=0;U.tide.value=0;ocean.water.position.set(x,y,0);
  const original=renderer.setRenderTarget.bind(renderer);
  let active=false;
  renderer.setRenderTarget=(target,...args)=>{
    marker.visible=active&&target?.texture===U.reflection.value;
    return original(target,...args);
  };
  function capture(on){
    active=on;ocean.capture(renderer,eye,null,null);
    scene.background=null;ocean.dome.visible=false;renderer.setRenderTarget(rt);renderer.render(scene,eye);
    const pixels=new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(rt,0,0,width,height,pixels);
    return pixels;
  }
  const results=[];
  for(const z of [0,.45,-.45])for(const incline of [false,true])for(const offset of (incline?[-1.02,1.02]:[0]))for(const lifted of [false,true]){
    ocean.water.position.y=y+offset;
    // Translate the marker and the camera with the water, at fixed tide.
    U.swellCenter.value.set(x,y);
    U.swell.value.set(.65,Math.asin(z/.65),0,incline?.22:0);
    const surface=ocean.sampleSurface(x,y,true);
    marker.position.set(x,y,surface+.29+(lifted?.9:0));
    eye.up.set(0,0,1);eye.position.set(x,y-5,surface+1.1);eye.lookAt(x,y,surface+.10);eye.updateMatrixWorld();
    const baseline=capture(false),pixels=capture(true);
    const edge=new T.Vector3(x,y-.10,ocean.sampleSurface(x,y-.10,true)).project(eye);
    const waterline=Math.round((1+edge.y)*height*.5-.5);
    const reflected=row=>{
      const i=4*(row*width+width/2);
      return pixels[i]-baseline[i]>8&&pixels[i+1]<baseline[i+1];
    };
    const rows=Array.from({length:height},(_,i)=>i).filter(reflected);
    results.push({z,incline,offset,lifted,waterline,count:rows.length,contact:rows.some(row=>Math.abs(row-waterline)<=1)});
  }
  renderer.setRenderTarget=original;renderer.setRenderTarget(null);rt.dispose();
  return results;
}
try{
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+installHook.toString()+')()'});
  for(const quality of ['low','balanced','high']){
    const url=new URL(viewer);
    url.searchParams.set('boat','Hobie16');url.searchParams.set('quality',quality);
    await send('Page.navigate',{url:url.href});
    const deadline=Date.now()+120000;
    while(!await evaluate('!!window.hobieReflectionTest && +document.body.dataset.simTime>.1')){
      assert(Date.now()<deadline,'Timed out loading Hobie 16');await sleep(150);
    }
    const results=await evaluate('('+measure.toString()+')()');
    for(const row of results){
      const fixture=quality+' '+JSON.stringify(row);
      assert(row.count>8,fixture+' missing reflected surface');
      assert.equal(row.contact,!row.lifted,fixture+' waterline mismatch');
    }
    console.log(quality+' passed '+results.length+' crest, trough and clearance checks');
  }
}finally{await send('Page.close');ws.close();}
