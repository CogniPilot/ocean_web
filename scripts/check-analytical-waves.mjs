// Compare the shipped wave component with the Fourier Green function for a surface impulse.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/flight')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const n=64, g=9.80665, period=64, decay=.04, pulseTime=.2;
const source=[-4,2], displacement=.1, step=.1;
const wrap=k=>(k%n+n)%n;
function analyticalModes(depth){
  const modes=[];
  for(let my=1-n/2;my<n/2;my++)for(let mx=1-n/2;mx<n/2;mx++){
    if(mx===0&&my===0)continue;
    const kx=2*Math.PI/period*mx,ky=2*Math.PI/period*my,k=Math.hypot(kx,ky);
    modes.push([kx,ky,Math.sqrt(g*k*Math.tanh(k*depth)),decay*(1+.08*k*k)]);
  }
  return modes;
}
function calculateElevation(modes,east,north,age){
  let sum=0;
  for(const [kx,ky,omega,loss] of modes){
    sum+=Math.exp(-loss*age)*Math.cos(kx*(east-source[0])+ky*(north-source[1])-omega*age);
  }
  return displacement/(period*period)*sum;
}
function advance(fmu,count){
  for(let i=0;i<count;i++)fmu.step(.01);
}

for(const depth of [14,1.5]){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters:{'waves.depth':depth}});
  try{
    fmu.set_inputs(JSON.stringify([['windSpeed',0],['seaState',0]]));
    const wave=fmu.bind_outputs(JSON.stringify(scalarNames('waves.wakeHeight',[n,n])));
    const observation=fmu.bind_outputs(JSON.stringify(['waterStamp','waves.driftE','waves.driftN','waves.depth']));
    const input=fmu.bind_inputs(JSON.stringify(scalarNames('peerWake',[4,38])));
    const hull=new Float64Array(152);
    hull[0]=1;
    fmu.write_bound(input,hull);
    advance(fmu,11);
    const [before,de,dn,actualDepth]=fmu.read_bound(observation);
    assert.equal(actualDepth,depth);
    assert(Math.abs(before-step)<1e-8,'Expected to have sampled the initial empty source');
    assert(fmu.read_bound(wave).every(z=>z===0),'Empty source excited a wave');

    // Imprint one cell in the current-relative frame. Holding this input after
    // the pulse leaves the free-surface solution to propagate without forcing.
    hull[1]=step;
    hull[2]=source[0]+de/fmu.time()*pulseTime;
    hull[3]=source[1]+dn/fmu.time()*pulseTime;
    hull[4]=displacement;
    fmu.write_bound(input,hull);
    const modes=analyticalModes(depth);
    let worst=0,peak=0,checked=0;
    for(let frame=0;frame<16;frame++){
      advance(fmu,10);
      const grid=fmu.read_bound(wave),[sample]=fmu.read_bound(observation);
      assert(Math.abs(sample-pulseTime-step*frame)<1e-8);
      for(let north=-8;north<=10;north+=2)for(let east=-12;east<=8;east+=2){
        const z=grid[n*wrap(north)+wrap(east)],expected=calculateElevation(modes,east,north,sample-pulseTime);
        assert(Number.isFinite(z));
        peak=Math.max(peak,Math.abs(z));
        worst=Math.max(worst,Math.abs(z-expected));
        checked++;
      }
    }
    console.log({depth,checked,peak,maxError:worst});
    assert(peak>.09&&worst<1e-9,'Wave solution disagrees with the finite-depth impulse response');
  }finally{fmu.free();}
}
