// Match four independently initialized and actuated CUDA lanes against the browser's WASM plant.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [runner,cubin,runtime]=process.argv.slice(2);
if(!runtime)throw Error('Usage: node check.mjs RUNNER CUBIN MATCHING_SCUBADIVER_RUNTIME');
const base=pathToFileURL(resolve(runtime)+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const create=inputs=>loadInstance('ScubaDiver',inputs,async url=>new Response(await readFile(url)));
const inputs=Array.from({length:4},(_,i)=>({initialState:[i,-i,-18,.03,-.07,0,0,.01,.08,0,0,0,0,0,0,0],
  bedHeight:-120,currentVelocity:[.02*i,.013,-.017],neutralTrim:1,meshCollision:1,
  pilot:[1,0,0,.2+.15*i,0]}));
const observations=['state','mechanicalPower','jointAngles','jointRates'];
const cpu=await Promise.all(inputs.map(input=>create(input)));
const native=spawn(runner,[cubin,resolve(runtime,'ScubaDiver.json')],{stdio:['pipe','pipe','inherit']});
const lines=createInterface({input:native.stdout})[Symbol.asyncIterator]();
const exit=once(native,'exit');
async function send(op,lanes,outputs=observations){
  native.stdin.write(JSON.stringify({op,lanes:lanes.map(inputs=>({inputs})),dt:.01,outputs})+'\n');
  const line=await lines.next();assert(!line.done,'Runner exited without a response');
  return JSON.parse(line.value);
}
try {
  let snapshot;
  for(let step=0;step<=2;step++){
    const commands=cpu.map((_,i)=>({pilot:[1,step%2*.05*i,0,.2+.15*i,0]}));
    if(step)cpu.forEach((model,i)=>{model.set('pilot',commands[i].pilot);model.advance(.01);});
    const result=step?await send('advance',commands):await send('reset',inputs);
    assert.ok(result.ok,result.error);
    assert.equal(result.dispatches,step);
    assert.equal(result.lanes.length,cpu.length);
    if(!step)snapshot=result.lanes;
    const errors={};
    for(const name of observations){
      let maximum=0;
      cpu.forEach((model,i)=>{
        const expected=[model.get(name)].flat(), actual=[result.lanes[i][name]].flat();
        assert.equal(expected.length,actual.length);
        actual.forEach((v,k)=>{assert.ok(Number.isFinite(v));maximum=Math.max(maximum,Math.abs(v-expected[k]));});
      });
      errors[name]=maximum;
    }
    console.log(JSON.stringify({step,device:result.device,wallSeconds:result.stepSeconds,kernelSeconds:result.kernelSeconds,maxAbsoluteErrors:errors}));
    for(const [name,delta] of Object.entries(errors))assert.ok(delta<1e-5,name+' error '+delta);
  }
  // Exercise simultaneous relation-history allocation beyond the default 8 MiB device heap.
  const turning=Array.from({length:64},(_,i)=>({...inputs[i%4],policyMode:1,pilot:[1,0,0,1,0]}));
  const kick={jointAction:[-.0625,.575,.676,.104,.077,-.0625,.575,.676,.104,-.077],
    lateralAction:[0,0,0,0],axialAction:[0,.155,0,.155],verticalPilot:0,glideAssist:0};
  const cpuLanes=await Promise.all(turning.slice(0,4).map(create));
  try{
    const resized=await send("reset",turning,["state"]);assert.ok(resized.ok,resized.error);
    const solved=await send("advance",turning.map(()=>kick),["state"]);assert.ok(solved.ok,solved.error);
    const references=cpuLanes.map(model=>{
      for(const [name,value] of Object.entries(kick))model.set(name,value);
      model.advance(.01);return model.get("state");
    });
    let maxError=0;
    solved.lanes.forEach(({state},i)=>state.forEach((v,j)=>{maxError=Math.max(maxError,Math.abs(v-references[i%4][j]));}));
    assert.equal(solved.lanes.length,64);assert.ok(maxError<1e-7);
    console.log(JSON.stringify({lanes:64,wallSeconds:solved.stepSeconds,kernelSeconds:solved.kernelSeconds,maxStateError:maxError}));
  }finally{cpuLanes.forEach(model=>model.close?.());}
  const broken=await send('advance',turning.map(()=>({pilot:[1,2]})));
  assert.equal(broken.ok,false);
  const reset=await send('reset',inputs);
  assert.ok(reset.ok,reset.error);assert.deepEqual(reset.lanes,snapshot);
} finally {
  native.stdin.end();
  await exit;
  cpu.forEach(model=>model.close?.());
}
