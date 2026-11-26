// Compare the live GPU service and the browser FMI on identical inputs, including
// sampled joint loads. Run against the viewer served by tools/serve-training.mjs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=new URL(process.argv[2]??'http://127.0.0.1:18311');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  await page.route('**/device-test',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto(new URL('/device-test',origin).href);
  const result=await page.evaluate(async()=>{
    const {trainingPhysics}=await import('./training-physics.mjs');
    const inputs=Array.from({length:4},(_,i)=>({
      initialState:[0,0,-18,.04*i,-.08,.02,0,.03*i,0,0,0,0,.1*i,0,0,0],
      currentVelocity:[.03,-.04,0],bedHeight:-120,neutralTrim:1,policyMode:1,meshCollision:1,
      pilot:[1,.1,0,.6,0]
    }));
    const keys=['state','jointAngles','jointRates','axialAngles','lateralAngles','vestLitres','mechanicalPower'];
    const cpu=await trainingPhysics('cpu','ScubaDiver'),gpu=await trainingPhysics('cuda','ScubaDiver',()=>{});
    const peak=Object.fromEntries(keys.map(k=>[k,0]));
    try{
      const a=await cpu.reset(inputs,keys),b=await gpu.reset(inputs,keys);
      for(let step=0;step<24;step++){
        for(let i=0;i<a.length;i++)for(const body of [a[i],b[i]]){
          body.set('jointAction',Array.from({length:10},(_,j)=>.12*Math.sin(j+step*.08+i)));
          body.set('lateralAction',[.02,-.04,.06,-.08]);body.set('axialAction',[.01,-.02,.03,-.04]);
        }
        await cpu.advance(a,.01,keys);await gpu.advance(b,.01,keys);
        for(let i=0;i<a.length;i++)for(const key of keys){
          const x=[].concat(a[i].get(key)),y=[].concat(b[i].get(key));
          if(x.length!==y.length)throw Error('Shape mismatch for '+key);
          for(let j=0;j<x.length;j++)peak[key]=Math.max(peak[key],Math.abs(x[j]-y[j]));
        }
      }
      return {peak,dispatches:gpu.dispatches,elapsedSimulation:b[0].get('state')[14]};
    }finally{cpu.close();gpu.close();}
  });
  console.log(JSON.stringify(result));
  assert.equal(result.dispatches,24);assert(Math.abs(result.elapsedSimulation-.24)<1e-6);
  for(const [key,error] of Object.entries(result.peak))assert(error<(key==='mechanicalPower'?1e-3:1e-5),key+' max absolute error '+error);
}finally{await browser.close();}
