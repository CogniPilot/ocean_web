// Approach measured hull panels bow-first and obliquely with the free 100 Hz plant.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import bed from '../viewer/bathymetry.js';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import {collisionSurface,contactStepper,loadWreckContacts} from '../viewer/wreck-contact.mjs';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const read=async url=>new Response(await readFile(url));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const plus=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(a,t)=>a.map(x=>x*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rotate(q,v){
  const t=scale(cross(q.slice(1),v),2);
  return plus(v,plus(scale(t,q[0]),cross(q.slice(1),t)));
}
const energy=(m,v)=>.5*dot(m,v.map(x=>x*x));
const quiet={manual:1,manualMode:2,windSpeed:0,seaState:0,'ocean.profile':[0,0,0,8,0,0,16,0,0],'ocean.tidalSpeed':0};
async function openPlant(position,velocity,heading){
  if(!process.argv.includes('--coupled')){
    const {loadInstance}=await import(new URL('instance.mjs',root));
    return loadInstance('Wreck_Plant',{...quiet,spawnPosition:position,spawnVelocity:velocity,spawnHeading:heading},read);
  }
  const {openFmuSession}=await import('../.deps/microduck_web/site/fmu-session.js');
  const {scalarNames}=await import('../.deps/microduck_web/site/fmu-page-contract.js');
  const {fileFetch}=await import('../.deps/microduck_web/scripts/fmu-test-support.mjs');
  const manifest=await (await read(new URL('manifest.json',root))).json();
  const index=await (await read(new URL(manifest.index,root))).json();
  const parameters={'sub.spawnHeading':heading,'sub.ocean.tidalSpeed':0};
  position.forEach((v,i)=>{parameters['sub.spawnPosition['+(i+1)+']']=v;
    parameters['sub.spawnVelocity['+(i+1)+']']=velocity[i];});
  const session=await openFmuSession({index,base:root,fetch:fileFetch,parameters,downloadFirst:true});
  session.set_inputs(JSON.stringify([['subManual',1],['subMode',2],['idleCamera',1],['windSpeed',0],['seaState',0]]));
  const binding=session.bind_inputs(JSON.stringify(scalarNames('scanConstraints',[8,10])));
  const outs=new Map();
  function getMany(names){
    const key=names.join(' ');
    const widths=names.map(name=>name==='orientation'?4:3);
    if(!outs.has(key))outs.set(key,session.bind_outputs(JSON.stringify(names.flatMap((name,i)=>scalarNames('sub.'+name,[widths[i]])))));
    const result=session.read_bound(outs.get(key));let off=0;
    return widths.map(n=>{off+=n;return result.slice(off-n,off);});
  }
  return {getMany,get:n=>getMany([n])[0],set:(_n,v)=>session.write_bound(binding,v),advance:d=>session.step(d),close:()=>session.free()};
}
for(const site of wreckSites){
  const file=new URL('../viewer/assets/red-sea/'+site.id+'/collision.json',import.meta.url);
  const mesh=collisionSurface(await (await read(file)).json());
  const panel=mesh.nearest(site.id==='yatush'?[-2.93,-4.1,2.36]:[-7.08,-6,3.43],4);
  const normal=panel.normal;
  const witness=plus(panel.point,[site.east,site.north,bed.height(site.east,site.north)-site.burial]);
  for(const angle of [0,.59])for(const speed of [.2,.5]){
    const yaw=Math.atan2(-normal[1],-normal[0])+angle,q=[Math.cos(yaw/2),0,0,Math.sin(yaw/2)];
    const scan=await loadWreckContacts({fetchAsset:read});
    // Start 15 mm before first contact for each attitude. Limit free approach
    // time, so all four trials encounter the same panel and ambient flow.
    let distance=.6;
    for(;distance>.1;distance-=.001){
      const pos=plus(witness,scale(normal,distance)),s=scan(pos,q);
      if(s){
        const n=s.slice(3,6),guard=plus(pos,rotate(q,s.slice(6,9)));
        if(dot(guard.map((x,i)=>x-s[i]),n)-s[9]<0)break;
      }
    }
    assert(distance>.1,'Scan panel not located');
    const plant=await openPlant(plus(witness,scale(normal,distance+.015)),scale(normal,-speed),yaw);
    const update=contactStepper(scan,()=>plant.getMany(['position','orientation']),a=>plant.set('scanConstraints',a));
    let approach,arrivalEnergy,peak=0,peakMoment=0,rebound=0,contactWork=0,endEnergy,minimum=1;
    let prevPower=0,previous=plant.get('worldVelocity');
    const [mass,inertia]=plant.getMany(['effectiveMass','angularInertia']);
    let previousEnergy=energy(mass,plant.get('velocity'));
    for(let i=0;i<70;i++){
      update();plant.advance(.01);
      const [p,quat,v,w,f,m,worldV]=plant.getMany(['position','orientation','velocity','rates','contactForce','contactMoment','worldVelocity']);
      const fn=dot(f,normal),ke=energy(mass,v)+energy(inertia,w);
      if(fn>.5&&approach===undefined){approach=-dot(previous,normal);arrivalEnergy=previousEnergy;}
      if(approach!==undefined){
        peak=Math.max(peak,fn);peakMoment=Math.max(peakMoment,Math.hypot(...m));
        rebound=Math.max(rebound,dot(worldV,normal));
        const power=dot(f,worldV)+dot(m,rotate(quat,w));
        contactWork+=(power+prevPower)*.005;prevPower=power;
        minimum=Math.min(minimum,dot(p.map((x,k)=>x-witness[k]),normal));
        endEnergy=ke;
      }
      previous=worldV;previousEnergy=ke;
    }
    plant.close?.();
    assert(approach>.15&&peak>5&&minimum>0,'Real hull collision did not engage');
    const result={site:site.id,angle,speed,approach,peak,peakMoment,rebound,ratio:rebound/approach,
      arrivalEnergy,endEnergy,contactWork,minimum};
    console.log(JSON.stringify(result));
    if(!process.argv.includes('--baseline')){
      assert(result.ratio<.4,'Excessive normal rebound');
      assert(contactWork<=.015*arrivalEnergy,'Static scan generated net kinetic energy');
    }
  }
}

// At rest, compare acceleration on either side of applying a known off-axis
// normal load. Subtracting the free-body acceleration removes buoyancy and trim.
if(!process.argv.includes('--coupled')&&!process.argv.includes('--baseline')){
  const origin=[-5,0,-5],plant=await openPlant(origin,[0,0,0],0);
  const fields=['body.a_0','der(body.w_a)','contactForce','contactMoment','effectiveMass','angularInertia'];
  const [linearBefore,angularBefore,,,mass,inertia]=plant.getMany(fields);
  for(const [normal,arm] of [[[1,0,0],[.15,.06,-.05]],[[0,1,0],[.13,.08,.07]],[[0,0,1],[-.11,.05,.12]]]){
    const gap=-.002,radius=.00001,rows=new Float64Array(80);
    const plane=plus(plus(origin,arm),scale(normal,-gap)),guard=plus(arm,scale(normal,radius));
    rows.set([...plane,...normal,...guard,radius]);plant.set('scanConstraints',rows);
    const [acceleration,angularAcceleration,force,moment]=plant.getMany(fields);
    const expectedMoment=cross(arm,force);
    assert(Math.abs(dot(force,normal)-10.4)<1e-8,'2 mm compression on the stationary spring');
    for(let i=0;i<3;i++){
      assert(Math.abs(moment[i]-expectedMoment[i])<1e-8,'Off-centre force must act at the witness');
      assert(Math.abs((acceleration[i]-linearBefore[i])*mass[i]-force[i])<1e-8,'Directional wet mass mismatch');
      assert(Math.abs((angularAcceleration[i]-angularBefore[i])*inertia[i]-moment[i])<1e-8,'Principal inertia mismatch');
    }
  }
}
