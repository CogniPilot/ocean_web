// Verify the refined Hobie hull samples and their transfer to both wake models.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/sailing')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const session=await openFmuSession({index,base,fetch:fileFetch,
  parameters:{'boat.launchSpeed':3.8,'boat.launchEast':-140,'boat.launchNorth':-80}});
const variables=new Map(index.variables.map(variable=>[variable.name,variable]));
function bind(name){
  assert(variables.has(name),'Missing model observation '+name);
  const binding=session.bind_outputs(JSON.stringify(scalarNames(name,variables.get(name).dimensions??[])));
  return ()=>session.read_bound(binding);
}
function elevation(tile,east,north,period){
  const n=Math.sqrt(tile.length),u=east*n/period,v=north*n/period;
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
  const wrap=k=>(k%n+n)%n;
  const at=(x,y)=>tile[wrap(y)*n+wrap(x)];
  return (1-b)*((1-a)*at(i,j)+a*at(i+1,j))+b*((1-a)*at(i,j+1)+a*at(i+1,j+1));
}

try{
  const [geometry,probes,nativeVolume,volume,strips,sources,speed,stations,background,wave]=[
    'boat.hydroStationGeometry','hydroSurfaceProbes','boat.hydroSectionVolume','boat.sectionVolume',
    'waves.sourceStrips','bowSources','bowSpeed','boat.stationX','boatWater.tile','waves.height'
  ].map(bind);
  const pose=session.bind_outputs(JSON.stringify(['sectionStamp','boat.east','boat.north','boat.heading',
    'boat.heel','boat.pitch','boat.halfSpacing','boatWater.tide','waves.driftE','waves.driftN',
    'waves.period','boat.swellAmplitude','swellK','swellBearing','swellOmega','seaClockOffset']));
  session.set_inputs(JSON.stringify([['windSpeed',11],['seaState',.6],['sailingManual',1]]));
  assert.equal(geometry().length,12*6);
  let sampled=0,positionError=0,waterError=0,bandError=0,wakeError=0,bowError=0,maximumFlux=0;
  for(let step=0;step<=90;step++){
    const volumes=nativeVolume(),bands=volume();
    assert.equal(volumes.length,24);
    for(let i=0;i<bands.length;i++)
      bandError=Math.max(bandError,Math.abs(volumes[2*i]+volumes[2*i+1]-bands[i]));
    const [stamp,east,north,heading,heel,pitch,separation,tide,driftE,driftN,period,amp,k,bearing,omega,clock]=session.read_bound(pose);
    if(stamp>0&&Math.abs(stamp-session.time())<1e-6){
      sampled++;
      const nodes=probes(),sections=geometry(),sea=background(),wake=wave();
      for(let i=0;i<24;i++){
        const side=i<12?1:-1,panel=i%12;
        const along=sections[6*panel]*Math.cos(pitch)+side*separation*Math.sin(heel)*Math.sin(pitch);
        const across=side*separation*Math.cos(heel);
        const x=east+along*Math.cos(heading)-across*Math.sin(heading);
        const y=north+along*Math.sin(heading)+across*Math.cos(heading);
        positionError=Math.max(positionError,Math.hypot(nodes[3*i]-x,nodes[3*i+1]-y));
        const swell=amp*Math.sin(k*(x*Math.cos(bearing)+y*Math.sin(bearing))-omega*(stamp+clock));
        const water=tide+swell+elevation(sea,x,y,64)+elevation(wake,x-driftE,y-driftN,period);
        waterError=Math.max(waterError,Math.abs(water-nodes[3*i+2]));
      }
      const sourceStrips=strips(),bow=sources(),xs=stations(),surge=speed()[0];
      for(let i=0;i<bands.length;i++)
        wakeError=Math.max(wakeError,Math.abs(sourceStrips[3*i+2]-bands[i]));
      for(let hull=0;hull<2;hull++){
        const areas=[0];
        for(let panel=0;panel<6;panel++)
          areas.push(sourceStrips[3*(6*hull+panel)+2]/(xs[panel+1]-xs[panel]));
        areas.push(0);
        for(let i=0;i<7;i++){
          const flux=bow[6*(7*hull+i)+2];
          maximumFlux=Math.max(maximumFlux,Math.abs(flux));
          bowError=Math.max(bowError,Math.abs(flux-surge*(areas[i]-areas[i+1])));
        }
      }
    }
    if(step<90)session.step(.01);
  }
  console.log({sampled,positionError,waterError,bandError,wakeError,bowError,maximumFlux});
  assert(sampled>=7,'Expected multiple native water samples');
  assert(positionError<.001&&waterError<.002,'Native buoyancy sites disagree with the modeled water');
  assert(bandError<1e-8&&wakeError<.001,'Refined displaced volume did not reach the FFT source bands');
  assert(maximumFlux>.01&&bowError<1e-7,'Near-hull source flux disagrees with the displacement bands');
}finally{
  session.free();
}
