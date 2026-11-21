// Sample the actual 25 cm Modelica bow field alongside the metre-scale wake.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/sailing')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const field=await loadInstance('BowWavePatch',{},async url=>new Response(await readFile(url)));
const size=32,spacing=.25;
const wrap=(k,n)=>(k%n+n)%n;
const datum=(field,i,j,n)=>field[wrap(j,n)*n+wrap(i,n)];
function interpolate(field,x,y){
  const i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;
  const at=(dx,dy)=>datum(field,i+dx,j+dy,64);
  return (1-b)*((1-a)*at(0,0)+a*at(1,0))+b*((1-a)*at(0,1)+a*at(1,1));
}

for(const launchSpeed of [3,6,8]){
  const parameters={'boat.launchSpeed':launchSpeed,'boat.launchEast':-130,'boat.launchNorth':-90,
    'boat.launchHeading':0,prevailingBearing:Math.PI/2};
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters});
  function observe(name,shape){
    const binding=fmu.bind_outputs(JSON.stringify(scalarNames(name,shape)));
    return ()=>fmu.read_bound(binding);
  }
  try{
    fmu.set_inputs(JSON.stringify([['sailingManual',1],['windSpeed',11],['windBearing',Math.PI/2],['seaState',0]]));
    const frame=observe('bowFrame',[4]),sources=observe('bowSources',[14,6]),speed=observe('bowSpeed',[2]);
    const wake=observe('waves.wakeHeight',[64,64]);
    const motion=fmu.bind_outputs(JSON.stringify(['boat.surge','waves.driftE','waves.driftN']));
    let peakCoarse=0,peakOverlay=0,peakCombined=0,peakAll=0,meanSpeed=0;
    const samples=24;
    for(let sample=0;sample<samples;sample++){
      for(let j=0;j<10;j++)fmu.step(.01);
      const [east,north,c,s]=frame(),[surge,de,dn]=fmu.read_bound(motion);
      field.set('sources',sources());
      field.set('relativeSpeed',speed());
      field.advance(.01);
      const fine=field.get('height'),coarse=wake();
      assert(fine.every(Number.isFinite));
      assert(Math.abs(c*c+s*s-1)<1e-10);
      meanSpeed+=surge/samples;
      for(let j=-16;j<16;j++)for(let i=-16;i<16;i++){
        const z=datum(fine,i,j,size),x=i*spacing,y=j*spacing;
        if(Math.hypot(x,y)>=3.8)assert.equal(Math.abs(z),0,'The bow field must reach zero before the texture seam');
        peakAll=Math.max(peakAll,Math.abs(z));
        const hullEdge=Math.abs(Math.abs(y)-1.02);
        if(x<1.75||x>3.25||hullEdge<.25||hullEdge>1.25)continue;
        const base=interpolate(coarse,east-de+c*x-s*y,north-dn+s*x+c*y);
        peakCoarse=Math.max(peakCoarse,base);
        peakOverlay=Math.max(peakOverlay,z);
        peakCombined=Math.max(peakCombined,base+z);
      }
    }
    console.log({launchSpeed,meanSpeed,peakCoarse,peakOverlay,peakCombined,peakAll});
    if(launchSpeed>=6)assert(peakOverlay>.025&&peakCombined>peakCoarse+.01,'Expected a visible near-field crest outside the bows');
    fmu.set_inputs(JSON.stringify([['omitWake',1]]));
    for(let i=0;i<11;i++)fmu.step(.01);
    assert(sources().every(x=>x===0)&&frame().every(x=>x===0),'Low must skip the near-field calculation');
  }finally{fmu.free();}
}
