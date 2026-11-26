// Run against a served viewer containing the training assets. DIVER_BENCH=1
// additionally runs three seeded full physical rounds per backend, interleaved.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=new URL(process.argv[2]??'http://localhost:18416/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,
  args:['--no-sandbox','--ignore-gpu-blocklist','--disable-gpu-sandbox','--ozone-platform=headless','--enable-features=Vulkan','--use-angle=vulkan','--disable-vulkan-surface','--enable-unsafe-webgpu']});
try{
  const page=await browser.newPage();
  await page.route('**/training-check.html',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto(new URL('training-check.html',origin).href);
  const result=await page.evaluate(async()=>{
    const {openTrainingUpdate}=await import('./diver-training-update.mjs');
    const batch=Array.from({length:12},(_,lane)=>Array.from({length:6},(_,t)=>({
      features:Array.from({length:15},(_,i)=>Math.cos(.2*t+.1*lane+.03*i)),
      eps:Array.from({length:8},(_,i)=>(lane%2?1:-1)*Math.sin(1+.2*i+.1*t)),reward:Math.sin(lane+.3*t)})));
    const zeros=Array.from({length:8},()=>Array(15).fill(0));
    const outputs={};
    for(const backend of ['cpu','gpu']){
      const update=await openTrainingUpdate(backend);
      try{
        const r=await update.update(batch,{weights:zeros,m:zeros,v:zeros,step:0});
        outputs[backend]={weights:r.weights.flat(),gradient:r.gradient.flat(),adapter:update.adapter,dispatches:update.dispatches};
      }finally{update.close();}
    }
    const {cpu,gpu}=outputs;
    const err=name=>Math.max(...cpu[name].map((x,i)=>Math.abs(x-gpu[name][i])));
    return {adapter:gpu.adapter,dispatches:gpu.dispatches,weight:gpu.weights[0],weightError:err('weights'),gradientError:err('gradient')};
  });
  assert.equal(result.dispatches,1);assert.ok(Math.abs(result.weight)>.01);
  assert.ok(result.weightError<1e-6);assert.ok(result.gradientError<1e-5);
  console.log(JSON.stringify(result));
  if(process.env.DIVER_BENCH){
    for(let run=0;run<3;run++){
      const order=run%2?['gpu','cpu']:['cpu','gpu'];
      for(const backend of order){
        const report=await page.evaluate(backend=>new Promise((resolve,reject)=>{
          const start=performance.now(),worker=new Worker('./diver-training-worker.mjs',{type:'module'});
          const limit=setTimeout(()=>{worker.terminate();reject(Error('Training timed out after five minutes'));},300000);
          const finish=(callback,value)=>{clearTimeout(limit);worker.terminate();callback(value);};
          worker.onerror=e=>finish(reject,Error(e.message));
          worker.onmessage=({data})=>{
            if(data.type==='error')finish(reject,Error(data.message));
            if(data.type==='progress'&&data.round===1){
              const {adapter,dispatches,steps,score,candidateScore,updateMs,roundMs}=data;
              finish(resolve,{backend,adapter,dispatches,steps,score,candidateScore,updateMs,roundMs,wallMs:performance.now()-start});
            }
          };
          worker.postMessage({type:'start',backend,lanes:4,rounds:1,seed:58429});
        }),backend);
        assert.equal(report.steps,2880);assert.equal(report.dispatches,backend==='gpu'?1:0);
        console.log(JSON.stringify({run:run+1,...report}));
      }
    }
  }
}finally{await browser.close();}
