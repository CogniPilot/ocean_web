// Pull the production Modelica anchor across the flat seabed with a prescribed bow roller.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/anchor-bed-test/runtime')+'/');
async function read(path){return JSON.parse(await readFile(new URL(path,base)));}
const index=await read((await read('manifest.json')).index);
assert.equal(index.modelName,'CruiserAnchor');
const fmu=await openFmuSession({index,base,fetch:fileFetch});
try{
  const fields=['position[1]','position[3]','grounded','embedment','tension','paid'];
  const handle=fmu.bind_outputs(JSON.stringify(fields));
  const measure=()=>Array.from(fmu.read_bound(handle));
  let x=0;
  function run(seconds,speed,lower=1){
    for(let i=0;i<Math.round(seconds/.01);i++){
      x+=speed*.01;
      fmu.set_inputs(JSON.stringify([['lower',lower],['mount[1]',x],['mount[3]',1],['mountVelocity[1]',speed]]));
      fmu.step(.01);
    }
    const state=measure();
    assert(state.every(Number.isFinite));
    return state;
  }
  const landed=run(25,0);
  assert(landed[2]===1 && landed[3]<.02 && landed[4]<1);
  // Take up the slack, then stop moving the roller once the flukes take load.
  for(let i=0;i<200 && measure()[4]<1300;i++)run(.5,.8);
  const set=run(5,0),held=run(12,0);
  console.log({landed,set,held});
  assert(held[3]>.25 && held[4]>300 && Math.abs(held[0]-set[0])<.01,'Set anchor failed to hold');
  const dragged=run(8,1);
  console.log({dragged});
  assert(dragged[0]-held[0]>4 && dragged[4]>2000,'Overloaded anchor should plough');
  const overhead=dragged[0];
  run(30,(overhead-x)/30);
  const recovered=run(47,0,0);
  console.log({recovered});
  assert(recovered[2]===0 && recovered[3]<.01 && recovered[1]>.75 && recovered[5]<.1,'Vertical recovery failed');
}finally{fmu.free();}

if(process.argv[3]){
  const boatBase=pathToFileURL(resolve(process.argv[3])+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',boatBase)));
  const boatIndex=JSON.parse(await readFile(new URL(manifest.index,boatBase)));
  assert.equal(boatIndex.modelName,'OceanMotorboat');
  const boat=await openFmuSession({index:boatIndex,base:boatBase,fetch:fileFetch,
    parameters:{initialEast:-120,initialNorth:-80,initialHeading:0}});
  try{
    const handle=boat.bind_outputs(JSON.stringify(['anchorState[1]','anchorState[2]','anchorState[11]',
      'anchorState[12]','anchorHolding[1]','anchorHolding[2]','boatPose[1]','boatPose[2]']));
    const state=()=>Array.from(boat.read_bound(handle));
    boat.set_inputs(JSON.stringify([['omitWake',1],['seaState',0],['windSpeed',0],['lowerAnchor',1]]));
    function advance(seconds){for(let i=0;i<Math.round(seconds/.05);i++)boat.step(.05);return state();}
    const bottom=advance(23);
    assert(bottom[2]>60 && bottom[3]===1);
    boat.set_inputs(JSON.stringify([['throttleLever',.25]]));
    const loaded=advance(110);
    const settled=advance(20);
    console.log({coupled:{bottom,loaded,settled}});
    assert(settled[3]===1 && settled[4]>.15 && settled[5]>100,'The cruiser did not take load on its anchor');
    assert(Math.hypot(settled[0]-loaded[0],settled[1]-loaded[1])<.15,'Anchor kept dragging under steady throttle');
    assert(Math.hypot(settled[6]-settled[0],settled[7]-settled[1])<settled[2]+4,'Vessel escaped its rode');
  }finally{boat.free();}
}
