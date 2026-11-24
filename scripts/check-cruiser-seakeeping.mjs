// Exercise the compiled cruiser's buoyancy, displacement wake and coast contact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {cruiserBowLength} from '../viewer/bow-grid.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

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
    const wake=omitWake?null:fmu.bind_outputs(JSON.stringify(scalarNames('waves.wakeHeight',[64,64])));
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    let speed,wakePeak=0;
    for(let i=0;i<650;i++){
      fmu.step(.05);
      if(wake!==null&&i%2===1){
        for(const elevation of fmu.read_bound(wake))wakePeak=Math.max(wakePeak,Math.abs(elevation));
      }
      if(i<=210)continue;
      const values=fmu.read_bound(signals);
      for(let j=0;j<3;j++){
        lo[j]=Math.min(lo[j],values[j]);
        hi[j]=Math.max(hi[j],values[j]);
      }
      speed=values[3];
    }
    return {heave:hi[0]-lo[0],roll:(hi[1]-lo[1])*degrees,pitch:(hi[2]-lo[2])*degrees,speed,wakePeak};
  }finally{fmu.free();}
}

async function approachIsland(){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters:{initialEast:36,initialNorth:22,initialHeading:Math.PI/2}});
  try{
    fmu.set_inputs(JSON.stringify([['seaState',0],['windSpeed',0],['throttleLever',.7],['omitWake',1]]));
    const signals=fmu.bind_outputs(JSON.stringify(['boatPose[1]','boatPose[2]','boatPose[3]','shoreWrench[3]']));
    let peakSupport=0,farthestNorth=22;
    for(let i=0;i<480;i++){
      fmu.step(.025);
      const values=fmu.read_bound(signals);
      assert(values.every(Number.isFinite));
      farthestNorth=Math.max(farthestNorth,values[1]);
      peakSupport=Math.max(peakSupport,values[3]);
    }
    return {peakSupport,farthestNorth};
  }finally{fmu.free();}
}

async function wakeAtThrottle(throttle){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters:{initialEast:-120,initialNorth:-80,initialHeading:0}});
  try{
    fmu.set_inputs(JSON.stringify([['seaState',0],['windSpeed',0],['throttleLever',throttle],['omitWake',0]]));
    const observe=(name,shape=[])=>{
      const binding=fmu.bind_outputs(JSON.stringify(scalarNames(name,shape)));
      return ()=>fmu.read_bound(binding);
    };
    const engineSpeed=observe('engine[2]'),trail=observe('sternFoamTrail',[44,4]);
    const bowSources=observe('bowSources',[14,6]),bowSpeed=observe('bowSpeed',[2]);
    const field=await loadInstance('BowWavePatch',{breakingBows:1,singleBow:1,length:cruiserBowLength},async url=>new Response(await readFile(url)));
    for(let i=0;i<240;i++)fmu.step(.05);
    const [speed]=engineSpeed(),plume=trail();
    field.set('sources',bowSources());
    field.set('relativeSpeed',bowSpeed());
    field.advance(.01);
    const [height,foam,spray]=field.getMany(['height','foamCoverage','sprayRelease']);
    const coverage=plume[2],halfWidth=plume[3];
    const forwardRise=Math.max(...height.filter((_,i)=>{
      const x=(i%32)*cruiserBowLength/32;
      return x>=1.75&&x<=3.75;
    }));
    assert(Math.abs(height[11])>1e-6,'The near field should extend past the cruiser stem');
    const sprayFlux=spray[5]+spray[11];
    assert(spray[17]===0&&spray[23]===0,'A single stem has two spray shoulders');
    assert(spray[1]>0&&spray[7]<0&&spray[3]>0&&spray[9]<0,'The shoulders must throw spray outward on both sides');
    assert(plume[43]>halfWidth&&plume[42]<coverage,'A one-second-old parcel should spread and lose coverage');
    fmu.set_inputs(JSON.stringify([['omitWake',1]]));
    for(let i=0;i<3;i++)fmu.step(.05);
    assert(trail().every(value=>value===0)&&bowSources().every(value=>value===0)&&bowSpeed().every(value=>value===0),
      'Wake-disabled mode must publish no plume or bow sources');
    return {speed,coverage,halfWidth,forwardRise,breakingFoam:Math.max(...foam),sprayFlux};
  }finally{fmu.free();}
}

const displacement=await wakeAtThrottle(.38);
const fast=await wakeAtThrottle(.90);
assert(displacement.speed>1.5&&displacement.speed<3.4);
assert(fast.speed>6&&fast.speed>2*displacement.speed);
assert(displacement.coverage<.12&&displacement.breakingFoam<.05&&displacement.sprayFlux<.001);
assert(fast.coverage>.50&&fast.halfWidth>.8&&fast.breakingFoam>.25&&fast.sprayFlux>.01);
assert(displacement.forwardRise>0&&fast.forwardRise>2*displacement.forwardRise,
  'The high-speed bow should generate a taller physical crest');
console.log('Displacement and fast wake regimes',{displacement,fast});

const heading=1.5;
const calm=await crossing(heading,0,0,0);
assert(calm.roll<.001&&calm.pitch<.001&&calm.heave<.01&&calm.wakePeak<.03&&Math.abs(calm.speed)<1e-6);
console.log('Calm peak-to-peak',calm);
for(const throttle of [0,.7]){
  const beam=await crossing(heading+Math.PI/2,.45,throttle);
  const head=await crossing(heading,.45,throttle);
  assert(beam.roll>4&&beam.roll<30&&head.pitch>4&&head.pitch<30);
  assert(beam.roll>beam.pitch&&head.pitch>head.roll);
  if(throttle)assert(beam.speed>4&&head.speed>4);
  console.log('Moderate peak-to-peak',{throttle,beam,head});
}
const underway=await crossing(heading+.72,.45,.45,0);
assert(underway.heave>.25&&underway.heave<2&&underway.pitch>3&&underway.pitch<30&&underway.roll>2&&underway.roll<30);
assert(underway.wakePeak>calm.wakePeak+.01);
console.log('Incident waves and hull radiation underway',underway);
const landfall=await approachIsland();
assert(landfall.peakSupport>1000&&landfall.farthestNorth>27&&landfall.farthestNorth<35);
console.log('Island approach',landfall);
