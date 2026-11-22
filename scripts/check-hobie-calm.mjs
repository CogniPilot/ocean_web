// With no incoming seas, the Hobie must not bounce on its own radiation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {sailingStart,windBearing} from '../viewer/sailing-start.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/sailing')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const range=series=>Math.max(...series)-Math.min(...series);

for(const launchSpeed of [0,2.4,6]){
  const launch={...sailingStart(true),launchSpeed};
  const parameters={prevailingBearing:windBearing,
    ...Object.fromEntries(Object.entries(launch).map(([key,value])=>['boat.'+key,value]))};
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters});
  try{
    fmu.set_inputs(JSON.stringify(Object.entries({seaState:0,windSpeed:0,windBearing,sailingManual:1,omitWake:0})));
    const pose=fmu.bind_outputs(JSON.stringify(['boat.heave','boat.heel','boat.pitch','boatWater.tide',
      'boat.vertical','wind.localEast','wind.localNorth','boatWater.surface','boat.surge','waves.waveLoad[1]']));
    const startup=[],heave=[],heel=[],pitch=[];
    let peakWakeLoad=0,maxVertical=0;
    for(let i=1;i<=1600;i++){
      fmu.step(.01);
      if(i%5!==0)continue;
      const [height,roll,trim,tide,vertical,windE,windN,incident,surge,wakeLoad]=fmu.read_bound(pose);
      if(i<=100)startup.push(height-tide);
      if(i>800){
        assert(Math.abs(windE)+Math.abs(windN)+Math.abs(incident-tide)<1e-7);
        heave.push(height-tide);heel.push(roll);pitch.push(trim);
        maxVertical=Math.max(maxVertical,Math.abs(vertical));
      }
      if(surge>.6)peakWakeLoad=Math.max(peakWakeLoad,Math.abs(wakeLoad));
    }
    const metrics={launchSpeed,startupHeave:range(startup),settledHeave:range(heave),settledHeel:range(heel),
      settledPitch:range(pitch),maxVertical,peakWakeLoad};
    console.log(metrics);
    assert(metrics.startupHeave<.06,'Launch begins near flotation');
    assert(metrics.settledHeave<.004&&metrics.settledHeel<.012&&maxVertical<.02,
      'The boat settles and coasts in calm water without self-induced bounce');
    if(launchSpeed>0)assert(peakWakeLoad>1,'A coasting hull still radiates and feels wave pressure');
  }finally{fmu.free();}
}
