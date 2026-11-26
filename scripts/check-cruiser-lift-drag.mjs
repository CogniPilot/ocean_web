// Compare the actual cruiser at matched throttle after the lift has reached its endpoint.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/motorboat')+'/');
const read=async name=>JSON.parse(await readFile(new URL(name,base)));
const index=await read((await read('manifest.json')).index);
async function underway(level){
  const parameters={initialEast:-130,initialNorth:-100,initialHeading:0};
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters,downloadFirst:true});
  try{
    fmu.set_inputs(JSON.stringify([['seaState',0],['windSpeed',0],['omitWake',1],['sternLiftGoal',level]]));
    for(let i=0;i<85;i++)fmu.step(.1);
    const cols=['sternLiftState[1]','engine[2]','boatPose[6]','liftWaterWrench[1]','liftWaterWrench[2]','liftWaterWrench[6]',
      'sternHoistCable[7]','sternHoistCable[8]','sternLiftWrench[1]','sternLiftWrench[2]'];
    const binding=fmu.bind_outputs(JSON.stringify(cols));
    assert(Math.abs(fmu.read_bound(binding)[0]-level)<1e-6);
    fmu.set_inputs(JSON.stringify([['throttleLever',.55],['helmLever',0]]));
    let bareDrag=0,hookDrag=0,tension=0,surge=0,samples=0,paid=0;
    for(let i=0;i<400;i++){
      fmu.step(.05);
      if(i<360)continue;
      const values=fmu.read_bound(binding);
      assert(values.every(Number.isFinite));
      const [,u,psi,e,n,mz,length,lineForce,he,hn]=values;
      assert(Math.max(Math.abs(e),Math.abs(n),Math.abs(mz))<1e-6,
        'The socket, boom and cradle must clear calm water at both endpoints');
      assert(lineForce>=0&&length>0);
      bareDrag+=-(e*Math.cos(psi)+n*Math.sin(psi));
      hookDrag+=-(he*Math.cos(psi)+hn*Math.sin(psi));
      tension+=lineForce;surge+=u;paid=length;samples++;
    }
    return {speedMps:surge/samples,bareDavitDragN:bareDrag/samples,
      hookDragN:hookDrag/samples,tensionN:tension/samples,paidM:paid};
  }finally{fmu.free();}
}
const stowed=await underway(1),alongside=await underway(0);
assert(alongside.paidM>stowed.paidM+.9,'The winch pays out for the water pickup');
console.log({stowed,alongside});
