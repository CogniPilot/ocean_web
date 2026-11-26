// Release the real submerged plant from its carrier with prescribed angular
// momentum. An empty battery isolates the passive response from gyro control.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const coupled=process.argv.includes('--coupled');
const read=url=>readFile(url).then(bytes=>new Response(bytes));
const origin=[-5,0,-8];
async function openPlant(){
  const parameters={spawnPosition:origin,spawnHeading:0,'battery.initialSoc':0,
    'ocean.profile':[0,0,0,8,0,0,16,0,0],'ocean.tidalSpeed':0};
  const inputs={manual:1,manualMode:2,windSpeed:0,seaState:0};
  if(!coupled){
    const {loadInstance}=await import(new URL('instance.mjs',root));
    return loadInstance('Wreck_Plant',{...parameters,...inputs},read);
  }
  const {openFmuSession}=await import('../.deps/microduck_web/site/fmu-session.js');
  const {scalarNames}=await import('../.deps/microduck_web/site/fmu-page-contract.js');
  const {fileFetch}=await import('../.deps/microduck_web/scripts/fmu-test-support.mjs');
  const manifest=await (await read(new URL('manifest.json',root))).json();
  const index=await (await read(new URL(manifest.index,root))).json();
  const names=(name,values,shape)=>scalarNames(name,shape??[values.length]).map((key,i)=>[key,values[i]]);
  const settings=Object.fromEntries(Object.entries(parameters).flatMap(([key,v])=>Array.isArray(v)
    ?names('sub.'+key,v,key==='ocean.profile'?[3,3]:undefined):[['sub.'+key,v]]));
  const fmu=await openFmuSession({index,base:root,parameters:settings,fetch:fileFetch,downloadFirst:true});
  fmu.set_inputs(JSON.stringify([['subManual',1],['subMode',2],['windSpeed',0],['seaState',0],['idleCamera',1]]));
  const inputsByName={hoist:'subHoist',hoistQuaternion:'subHoistQuaternion',hoistAngularVelocity:'subHoistAngularVelocity'};
  const observed=new Map();
  return {
    has(name){return index.variables.some(v=>v.name==='sub.'+name);},
    get(name){
      if(!observed.has(name)){
        const variable=index.variables.find(v=>v.name==='sub.'+name);
        observed.set(name,fmu.bind_outputs(JSON.stringify(scalarNames(variable.name,variable.dimensions))));
      }
      const values=Array.from(fmu.read_bound(observed.get(name)));
      return values.length===1?values[0]:values;
    },
    set(name,values){fmu.set_inputs(JSON.stringify(names(inputsByName[name],values)));},
    advance(dt){fmu.step(dt);},close(){fmu.free();}
  };
}
const results=[];
const baseline=process.argv.includes('--baseline');
const throughSpeed=process.argv.includes('--through-flow')?1:0;
for(const [axis,name] of ['roll','pitch','yaw'].entries()){
  for(const sign of [-1,1]){
    const plant=await openPlant();
    const initial=[0,0,0];initial[axis]=sign;
    plant.set('hoistQuaternion',[1,0,0,0]);
    plant.set('hoistAngularVelocity',initial);
    plant.set('hoist',[2,...origin,0,0,0,0]);
    plant.advance(.02);
    assert.deepEqual(plant.get('rates'),initial,'Rigid carrier angular velocity');
    // Release comoving with the residual wind-driven current. The water
    // column initializes its low-pass wind before it decays toward zero.
    const current=plant.get('current');
    plant.set('hoist',[-1,...origin,current[0]+throughSpeed,current[1],current[2],0]);
    const inertia=plant.get('angularInertia')[axis];
    const dry=plant.has('dryInertia')?plant.get('dryInertia')[axis]:plant.get(['body.I_11','body.I_22','body.I_33'][axis]);
    let halfTime=null,early=null,quarter=null,peak=0,initialDuctTorque;
    for(let tick=1;tick<=200;tick++){
      plant.advance(.005);
      const rate=sign*plant.get('rates')[axis];
      const t=tick*.005;
      if(tick===2)early=rate;
      if(!baseline && tick===2){
        const moment=plant.get('ductWaterMoment'),rates=plant.get('rates');
        initialDuctTorque=moment[axis];
        assert(moment.reduce((power,m,i)=>power+m*rates[i],0)<0,'Duct drag must dissipate rotational energy');
      }
      if(tick===50)quarter=rate;
      if(halfTime===null&&rate<=.5)halfTime=t;
      peak=Math.max(peak,rate);
      assert(plant.get('appliedThrust').every(f=>Math.abs(f)<1e-10),'Unpowered coast');
    }
    assert((baseline||inertia>dry) && early>0 && early<1,name+' must lose angular speed after release');
    // With forward translation, the coupled added-mass moment also exchanges
    // translational and rotational energy. Its yaw transient need not halve in 1 s.
    if(!throughSpeed)assert(peak<=1.001&&halfTime>0&&halfTime<.9,'Comoving passive decay');
    if(throughSpeed&&!baseline&&axis===2)assert(quarter<.74&&Math.abs(initialDuctTorque)>1,
      'Yawing at 1 m/s needs rotational drag at the actual duct centres');
    assert(quarter<early,'Passive angular decay');
    results.push({name,sign,throughSpeed,dry,inertia,quarter,halfTime,initialDuctTorque});
    plant.close?.();
  }
}
console.table(results);
