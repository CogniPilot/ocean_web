// Check that an anchored boat samples the same smooth wake window as the water shader.
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
const names=new Map(index.variables.map(v=>[v.name,v.dimensions??[]]));
const requested=['race.stationE','race.stationN','race.water','waves.height','waves.wakeHeight',
  'waves.driftE','waves.driftN','boat.east','boat.north','boatWater.tile','boatWater.tide','bowSources','bowFrame','bowSpeed'];
function get(world,name){
  const binding=world.bind_outputs(JSON.stringify(scalarNames(name,names.get(name))));
  return ()=>world.read_bound(binding);
}
function at(grid,e,n){
  const size=Math.sqrt(grid.length);
  const x=e*size/64,y=n*size/64,i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;
  const wrap=k=>(k%size+size)%size;
  const lookup=(row,col)=>grid[size*wrap(row)+wrap(col)];
  return (1-b)*((1-a)*lookup(j,i)+a*lookup(j,i+1))+b*((1-a)*lookup(j+1,i)+a*lookup(j+1,i+1));
}

// Independently integrate the source segments at their midpoints to check the
// closed-form line integral used by the Modelica receiver at the launch.
function bowHead(e,n,pose,velocity,sources){
  const de=e-pose[0],dn=n-pose[1],distance=Math.hypot(de,dn);
  if(distance>=3.8)return 0;
  const x=pose[2]*de+pose[3]*dn,y=pose[2]*dn-pose[3]*de;
  let sum=0;
  for(let i=0;i<sources.length;i+=6){
    const [lo,side,strength,core,hi,broad]=sources.slice(i,i+6);
    if(!strength)continue;
    const subdivisions=256,dy=y-side;
    for(let j=0;j<subdivisions;j++){
      const dx=x-lo-(j+.5)*(hi-lo)/subdivisions;
      const r2=dx*dx+dy*dy+core;
      sum+=strength*(dx*velocity[0]+dy*velocity[1])*(r2**-1.5-(r2+broad)**-1.5)/subdivisions;
    }
  }
  const t=Math.max(0,(distance-2.9)/.9);
  return sum*(1-t*t*(3-2*t))/(2*Math.PI*9.80665);
}

const stats={near:0,inner:0,transition:0,outer:0,maxError:0,removedAlias:0};
for(const x of [-23,-43,-80]){
  const parameters={'boat.launchEast':x,'boat.launchNorth':12,'boat.launchHeading':0,'boat.launchSpeed':4};
  const world=await openFmuSession({index,base,fetch:fileFetch,parameters});
  try{
    world.set_inputs(JSON.stringify([['sailingManual',1],['windSpeed',0],['seaState',0]]));
    const fields=requested.map(name=>get(world,name));
    for(let frame=0;frame<24;frame++){
      for(let i=0;i<10;i++)world.step(.01);
      const [es,ns,water,total,hull,[de],[dn],[east],[north],background,[tide],sources,pose,velocity]=fields.map(read=>read());
      for(let station=0;station<water.length;station++){
        const e=es[station],n=ns[station],r=Math.hypot(e-east,n-north)/64;
        const t=Math.max(0,Math.min(1,(r-.35)/.14));
        const raw=at(total,e-de,n-dn),height=at(hull,e-de,n-dn),falloff=t*t*(3-2*t);
        const near=bowHead(e,n,pose,velocity,sources);
        stats.near=Math.max(stats.near,Math.abs(near));
        const expected=tide+at(background,e,n)+raw-falloff*height+near;
        stats.maxError=Math.max(stats.maxError,Math.abs(expected-water[station]));
        stats[t===0?'inner':t===1?'outer':'transition']++;
        if(t===1)stats.removedAlias=Math.max(stats.removedAlias,Math.abs(height));
      }
    }
  }finally{world.free();}
}
console.log(stats);
assert(stats.inner&&stats.transition&&stats.outer,'Check must exercise the entire radial range');
assert(stats.removedAlias>.001,'Need a measurable wrapped hull wake in the outside control');
assert(stats.near>.001,'Exercise the near-hull contribution');
assert(stats.maxError<1e-5,'Committee launch water disagrees with the expected wake taper');
