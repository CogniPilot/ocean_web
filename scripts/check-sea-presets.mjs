import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const root=resolve(process.argv[2]??'build/pages');
const cases=[
  {seaState:0,windWaveHeight:.08,swellAmplitude:0},
  {seaState:.45,windWaveHeight:.62,swellAmplitude:.65},
  {seaState:1.1,windWaveHeight:1.15,swellAmplitude:1.20},
  {seaState:1.5,windWaveHeight:.18,swellAmplitude:1.70,wavelength:90},
];
const rms=values=>Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);
const phase=.31,clockOffset=125,trials=[];
for(const role of ['sailing','sloop','world','flight','submarine','motorboat','habitat']){
  const boat=['sailing','sloop','world'].includes(role);
  const base=pathToFileURL(resolve(root,role)+'/');
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(manifest.index,base)));
  for(const preset of cases){
    const waveNumber=2*Math.PI/(preset.wavelength??30.48);
    const omega=Math.sqrt(9.80665*waveNumber*Math.tanh(waveNumber*13.7));
    const fmu=await openFmuSession({index,base,fetch:fileFetch});
    try{
      const tile=fmu.bind_outputs(JSON.stringify(scalarNames('boatWater.tile',[32,32])));
      const wake=fmu.bind_outputs(JSON.stringify(scalarNames('waves.height',[64,64])));
      const swellNames=boat?['boat.swellAmplitude','boat.swellK','boat.swellOmega']:
        ['swell[1]','swell[3]','swell[4]','swell[2]'];
      const swell=fmu.bind_outputs(JSON.stringify(swellNames));
      fmu.set_inputs(JSON.stringify(Object.entries({omitWake:1,windSpeed:11,windBearing:phase,
        seaState:preset.seaState,seaClockOffset:clockOffset})));
      for(let step=0;step<40;step++)fmu.step(.01);
      const shape=fmu.read_bound(tile);
      const [amplitude,k1,k2,phaseAtOrigin]=fmu.read_bound(swell);
      const k=boat?k1:Math.hypot(k1,k2);
      const frequency=boat?k2:-phaseAtOrigin/(fmu.time()+clockOffset);
      assert(Math.abs(amplitude-preset.swellAmplitude)<1e-9);
      assert(Math.abs(k-waveNumber)<1e-9);
      assert(Math.abs(frequency-omega)<1e-9);
      const significant=4*rms(shape);
      assert(Math.abs(significant-preset.windWaveHeight)<.005,'Measured FFT wind-wave height differs from its preset');
      assert(fmu.read_bound(wake).every(x=>x===0),'Low should skip the separate hull radiation field');
      if(role==='sailing')trials.push(shape);
      else assert(Math.max(...shape.map((value,i)=>Math.abs(value-trials[cases.indexOf(preset)][i])))<1e-8,
        'All clients must get the same incident spectrum for the same weather and sea clock');
      console.log({role,sea:preset.seaState,significant,amplitude,wavelength:2*Math.PI/k,period:2*Math.PI/frequency});
    }finally{fmu.free();}
  }
}
