// Drive the real world client with a worker whose replies can be delayed.
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {openWorld} from '../viewer/world-view.mjs';

let worker;
globalThis.document={hidden:false};
globalThis.addEventListener=()=>{};
globalThis.Worker=class {
  requests=[];
  time=0;
  constructor(){worker=this;}
  postMessage(data){this.requests.push(structuredClone(data));}
  reply(){
    const request=this.requests.shift();
    this.time+=(request.steps??0)*.01;
    const frame={id:request.id,time:this.time,values:new Float64Array(),sampled:[Float64Array.of(1)]};
    if(request.type==='open')frame.layout={
      inputs:[...request.inputs,'omitWake'].map((name,offset)=>({name,offset,count:1})),outputs:[],
      sampled:[[{name:'waves.height',offset:0,count:1,shape:[1]}]]
    };
    this.onmessage({data:frame});
    return nextTurn();
  }
};
const opening=openWorld('sailing');
const seaIndex=worker.requests[0].inputs.indexOf('seaState');
await worker.reply();
const world=await opening;
assert.equal(world.advance(4),4);
world.set('seaState',0);
assert.equal(world.advance(4),4);
assert.equal(world.advance(4),2);
assert.equal(world.advance(1),0);
assert.deepEqual(worker.requests.map(r=>r.steps),[4,4]);

assert.equal(worker.requests[0].values[seaIndex],.45);
assert.equal(worker.requests[1].values[seaIndex],0);
await worker.reply();
assert.equal(world.time,.04);
assert.deepEqual(worker.requests.map(r=>r.steps),[4,2]);
await worker.reply();
await worker.reply();
assert.equal(world.time,.10);

assert.deepEqual(world.get('waves.height'),Float64Array.of(1));
world.setWakeEnabled(false);
assert.equal(world.get('waves.height'),undefined);
world.advance(3);
assert.equal(worker.requests[0].surveyView.waveGrid,false);
world.advance(3);
world.advance(3);
world.clearQueued();
document.hidden=true;
assert.equal(world.advance(5),0);
await worker.reply();
await worker.reply();
assert.equal(worker.requests.length,0);
assert.equal(world.time,.16);
assert.equal(world.get('waves.height'),undefined,'An earlier snapshot must not restore a hidden grid');
document.hidden=false;
world.setWakeEnabled(true);
assert.equal(world.advance(20),10);
assert.equal(worker.requests[0].surveyView.waveGrid,true);
assert.deepEqual(worker.requests.map(r=>r.steps),[5,5]);
worker.onmessage({data:{id:worker.requests[0].id,error:'FMU step failed'}});
await nextTurn();
assert.throws(()=>world.advance(1),/FMU step failed/);
console.log('Worker scheduling, control snapshots, pause, visibility and faults passed.');
