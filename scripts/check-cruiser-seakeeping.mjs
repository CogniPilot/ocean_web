// Exercise the compiled cruiser in calm water, head seas and beam seas.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/motorboat')+'/');
const readJSON=async name=>JSON.parse(await readFile(new URL(name,base),'utf8'));
const index=await readJSON((await readJSON('manifest.json')).index);
assert.equal(index.modelName,'OceanMotorboat');
const degrees=180/Math.PI;

async function crossing(bearing,sea,throttle,omitWake=1){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters:{swellBearing:bearing}});
  try{
    fmu.set_inputs(JSON.stringify([['seaState',sea],['windBearing',bearing],['windSpeed',sea?9:0],
      ['throttleLever',throttle],['omitWake',omitWake]]));
    const signals=fmu.bind_outputs(JSON.stringify(['boatPose[3]','boatPose[4]','boatPose[5]','engine[2]']));
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    let speed;
    for(let i=0;i<650;i++){
      fmu.step(.05);
      if(i<=210)continue;
      const values=fmu.read_bound(signals);
      for(let j=0;j<3;j++){
        lo[j]=Math.min(lo[j],values[j]);
        hi[j]=Math.max(hi[j],values[j]);
      }
      speed=values[3];
    }
    return {heave:hi[0]-lo[0],roll:(hi[1]-lo[1])*degrees,pitch:(hi[2]-lo[2])*degrees,speed};
  }finally{fmu.free();}
}
const heading=1.5;
const calm=await crossing(heading,0,0);
assert(calm.roll<.001&&calm.pitch<.001&&calm.heave<.01);
console.log('Calm peak-to-peak',calm);
for(const throttle of [0,.7]){
  const beam=await crossing(heading+Math.PI/2,.45,throttle);
  const head=await crossing(heading,.45,throttle);
  assert(beam.roll>4&&beam.roll<30&&head.pitch>4&&head.pitch<30);
  assert(beam.roll>beam.pitch&&head.pitch>head.roll);
  if(throttle)assert(beam.speed>4&&head.speed>4);
  console.log('Moderate peak-to-peak',{throttle,beam,head});
}
const coupled=await crossing(heading+.72,.45,.45,0);
assert(coupled.heave>.25&&coupled.heave<2&&coupled.pitch>3&&coupled.pitch<30&&coupled.roll>2&&coupled.roll<30);
console.log('Coupled waves and hull radiation',coupled);
