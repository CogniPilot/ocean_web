// Same-origin local training API for a Rumoca batch runner. The runner takes
// one JSON request per line on stdin and emits one JSON reply per line.
import http from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
const [portText,viewerUrl,plant,executable,...args]=process.argv.slice(2);
if(!executable)throw Error('Usage: node tools/serve-training.mjs PORT VIEWER_URL PLANT RUNNER [args...]');
const port=Number(portText),viewer=new URL(viewerUrl),sessions=new Map(),prefix='/api/training';
const execute=promisify(execFile);
let cached,pendingProbe,expires=0;
async function capabilities(){
  if(cached&&Date.now()<expires)return cached;
  pendingProbe??=execute(executable,[...args,'--capabilities'],{timeout:30000}).then(({stdout})=>{
    const info=JSON.parse(stdout);
    if(!Number.isSafeInteger(info.maxLanes)||info.maxLanes<1)throw Error(info.error??'GPU capacity unavailable');
    expires=Date.now()+15000;
    cached={plants:[plant],backend:'CUDA',device:info.device,maxCount:info.maxLanes,freeBytes:info.freeBytes,bytesPerLane:info.bytesPerLane};
    return cached;
  }).catch(error=>{throw Error(error.stderr?.trim()||error.message);}).finally(()=>{pendingProbe=null;});
  return pendingProbe;
}
function end(id,reason='GPU training session ended'){
  const session=sessions.get(id);if(!session)return;
  sessions.delete(id);clearTimeout(session.timeout);session.proc.kill();
  session.pending?.reject(Error(reason));
}
function timeout(id){
  const session=sessions.get(id);clearTimeout(session.timeout);
  session.timeout=setTimeout(()=>end(id),120000);
}
function create(maxCount){
  const id=randomUUID(),proc=spawn(executable,args,{stdio:['pipe','pipe','pipe']});
  const session={proc,maxCount};sessions.set(id,session);timeout(id);
  let diagnostic='';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-2048);process.stderr.write(chunk);});
  createInterface({input:proc.stdout}).on('line',line=>{
    const pending=session.pending;if(!pending)return;
    session.pending=null;
    try{const result=JSON.parse(line);if(!result.ok)throw Error(result.error??'GPU step failed');pending.resolve(result);}
    catch(error){pending.reject(error);end(id);}
  });
  proc.stdin.on('error',error=>end(id,diagnostic.trim()||error.message));
  proc.on('error',error=>end(id,error.message));
  proc.on('close',(code,signal)=>end(id,diagnostic.trim()||'GPU physics process exited ('+(signal??code)+')'));
  return id;
}
async function read(req,maxBytes=2_000_000){
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;if(bytes>maxBytes)throw Error('Training request too large');chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const server=http.createServer(async(req,res)=>{
  const path=req.url.split('?')[0];
  if(!path.startsWith(prefix+'/')){
    const upstream=http.request({hostname:viewer.hostname,port:viewer.port||80,path:req.url,method:req.method,headers:{...req.headers,host:viewer.host}},r=>{
      res.writeHead(r.statusCode,r.headers);r.pipe(res);
    });
    upstream.on('error',()=>res.writeHead(502).end());req.pipe(upstream);return;
  }
  const reply=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
  try{
    const host=req.headers.host;
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)||(req.headers.origin&&req.headers.origin!=='http://'+host))
      return reply(403,{error:'Local origin required'});
    if(req.method==='GET'&&path===prefix+'/capabilities')return reply(200,await capabilities());
    if(req.method==='POST'&&req.headers['content-type']!=='application/json')return reply(415,{error:'Expected JSON'});
    if(req.method==='POST'&&path===prefix+'/sessions'){
      const request=await read(req);if(request.plant!==plant)return reply(400,{error:'Unknown plant'});
      if(sessions.size>=4)return reply(429,{error:'GPU training sessions are occupied'});
      const {maxCount}=await capabilities();return reply(201,{id:create(maxCount),maxCount});
    }
    const id=path.slice((prefix+'/sessions/').length),session=sessions.get(id);
    if(!session)return reply(404,{error:'GPU training session unavailable'});
    if(req.method==='DELETE'){end(id);return reply(200,{ok:true});}
    if(req.method!=='POST')return reply(405,{error:'Expected POST or DELETE'});
    const request=await read(req,Math.max(2_000_000,session.maxCount*4096));
    if(!['reset','advance'].includes(request.op)||!Array.isArray(request.lanes)||request.lanes.length<1||request.lanes.length>session.maxCount||
       !Array.isArray(request.outputs)||request.outputs.length>64||request.outputs.some(n=>typeof n!=='string'))
      return reply(400,{error:'Invalid batch'});
    if(session.pending)return reply(409,{error:'Previous GPU step still running'});
    clearTimeout(session.timeout);
    res.once('close',()=>{if(!res.writableEnded)end(id);});
    const result=await new Promise((resolve,reject)=>{
      session.pending={resolve,reject};session.proc.stdin.write(JSON.stringify(request)+'\n');
    });
    if(sessions.has(id))timeout(id);
    return reply(200,result);
  }catch(error){return reply(400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log('Training on http://127.0.0.1:'+port));
process.on('exit',()=>{for(const id of sessions.keys())end(id);});
