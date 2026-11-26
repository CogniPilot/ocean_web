// Drive the actual Piccard plant into an exposed plate on each registered scan.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {collisionSurface,contactStepper,hoistTransferPose,loadWreckContacts} from '../viewer/wreck-contact.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import {piccardScale} from '../viewer/piccard-geometry.mjs';
import bed from '../viewer/bathymetry.js';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const [mode='standalone',runtime='viewer/fmi3',assets='viewer/assets/red-sea']=process.argv.slice(2);
assert(['standalone','coupled'].includes(mode));
const base=pathToFileURL(resolve(runtime)+'/');
const fetchAsset=async url=>new Response(await readFile(resolve(assets,url.pathname.split('/').at(-2),'collision.json')));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
// Sweep an overhead plate past the surface of the small magnetic pickup plate. This
// checks the scan-contact broad phase, merged witness and guard radius together.
const roofHeight=.150;
const overhead=await loadWreckContacts({
  sites:[{id:'overhead',east:0,north:0,burial:0}],bed:{height:()=>0},
  fetchAsset:async()=>Response.json({positions:[-1,-1,roofHeight,1,-1,roofHeight,1,1,roofHeight,-1,1,roofHeight],indices:[0,1,2,0,2,3]})
});
assert.equal(overhead([0,0,-.07],[1,0,0,0]),null);
const roof=overhead([0,0,.001],[1,0,0,0]);
assert(roof&&roof[5]<-.9999,'The pickup plate must contact an overhanging wreck surface');
assert(Math.abs(roof[8]+roof[9]-roofHeight)<1e-9,'Guard top must match the pickup face height');

async function plantAt(position,velocity,yaw){
  if(mode==='standalone'){
    const {loadInstance}=await import(new URL('instance.mjs',base));
    const p=await loadInstance('Wreck_Plant',{spawnPosition:position,spawnVelocity:velocity,spawnHeading:yaw,manual:1,manualMode:2},fileFetch);
    return {pose:()=>p.getMany(['position','orientation']),force:()=>p.get('contactForce'),
      motion:()=>p.getMany(['velocity','rates']),fork:p.has('hoistQuaternion')&&((up,q,w)=>{
        p.set('hoistUp',up);p.set('hoistQuaternion',q);p.set('hoistAngularVelocity',w);
      }),
      hoist:v=>p.set('hoist',v),constraints:v=>p.set('scanConstraints',v),step:()=>p.advance(.01),close(){}};
  }
  const {index:name}=JSON.parse(await readFile(new URL('manifest.json',base)));
  const index=JSON.parse(await readFile(new URL(name,base)));
  const params={'sub.spawnHeading':yaw};
  for(let i=0;i<3;i++){params['sub.spawnPosition['+(i+1)+']']=position[i];params['sub.spawnVelocity['+(i+1)+']']=velocity[i];}
  const p=await openFmuSession({index,base,parameters:params,fetch:fileFetch,downloadFirst:true});
  const pose=p.bind_outputs(JSON.stringify([...scalarNames('sub.position',[3]),...scalarNames('sub.orientation',[4])]));
  const force=p.bind_outputs(JSON.stringify(scalarNames('sub.contactForce',[3])));
  const contacts=p.bind_inputs(JSON.stringify(scalarNames('scanConstraints',[8,10])));
  const hoist=p.bind_inputs(JSON.stringify(scalarNames('subHoist',[8])));
  const motion=p.bind_outputs(JSON.stringify([...scalarNames('sub.velocity',[3]),...scalarNames('sub.rates',[3])]));
  const fork=index.variables.some(v=>v.name==='subHoistQuaternion')&&
    p.bind_inputs(JSON.stringify([...scalarNames('subHoistUp',[3]),...scalarNames('subHoistQuaternion',[4]),...scalarNames('subHoistAngularVelocity',[3])]));
  p.set_inputs(JSON.stringify([['idleCamera',1],['subManual',1],['subMode',2]]));
  return {pose(){const q=p.read_bound(pose);return [q.slice(0,3),q.slice(3,7)];},
    force:()=>p.read_bound(force),hoist:v=>p.write_bound(hoist,Float64Array.from(v)),constraints:v=>p.write_bound(contacts,v),
    motion(){const v=p.read_bound(motion);return [v.slice(0,3),v.slice(3)];},
    fork:fork&&((up,q,w)=>p.write_bound(fork,Float64Array.from([...up,...q,...w]))),
    step:()=>p.step(.01),close:()=>p.free()};
}

const patch=collisionSurface({positions:[0,-3,-3,0,3,-3,0,0,3],indices:[0,1,2]});
for(const side of [-1,1]){
  const hit=patch.nearest([.2*side,0,0],1);
  assert(Math.abs(hit.normal[0]-side)<1e-8&&Math.abs(hit.distance-.2)<1e-8);
}
for(const site of wreckSites){
  const surface=collisionSurface(await (await fetchAsset(new URL('/'+site.id+'/collision.json','file:///'))).json());
  const query=site.id==='yatush'?[-2.93,-4.1,2.36]:[-7.08,-6,3.43];
  const hit=surface.nearest(query,4);
  assert(hit&&hit.normal[1]<-.8,'Expected an exposed port or starboard hull plate on '+site.name);
  const normal=hit.normal,origin=[site.east,site.north,bed.height(site.east,site.north)-site.burial];
  const witness=origin.map((x,i)=>x+hit.point[i]),position=witness.map((v,i)=>v+1.05*normal[i]);
  const velocity=normal.map(v=>-1.4*v),yaw=Math.atan2(-normal[1],-normal[0]);
  const distances=[];
  for(const enabled of [false,true]){
    const p=await plantAt(position,velocity,yaw);
    try{
      const pose=p.pose();assert(Math.hypot(...pose[0].map((v,i)=>v-position[i]))<1e-5,'Spawn translation');
      assert(Math.abs(Math.sin(yaw/2)-pose[1][3])<1e-5,'Spawn orientation');
      const update=contactStepper(await loadWreckContacts({fetchAsset}),p.pose,p.constraints);
      let peakForce=0,minimum=Infinity,firstContactDistance;
      for(let i=0;i<120;i++){
        if(enabled)update();p.step();
        const force=dot(p.force(),normal),distance=dot(p.pose()[0].map((v,j)=>v-witness[j]),normal);
        if(force>1&&firstContactDistance===undefined)firstContactDistance=distance;
        peakForce=Math.max(peakForce,force);
        minimum=Math.min(minimum,distance);
      }
      distances.push(minimum);
      console.log({mode,site:site.name,enabled,minimumCentreToPlate:minimum,peakNormalForce:peakForce,firstContactDistance});
      if(enabled){
        assert(peakForce>5,'Expected physical reaction force');
        assert(firstContactDistance>.48*piccardScale&&firstContactDistance<.76*piccardScale,
          'Impact should begin at the approach-facing bow');
      }
      else assert(peakForce<.01,'Uncontrolled scan test hit an unrelated obstacle');
    }finally{p.close();}
  }
  // The free body can yaw side-on under the reaction. Its centre must remain
  // on the approach side throughout the impact.
  assert(distances[1]>distances[0]+.12&&distances[1]>.20*piccardScale,'The hull must stay outside the plate');
}

// Above the surface the hoist must support the full dry sub. This also covers
// the body-to-world conversion used when spawning at a nonzero heading.
const raised=[-24,20,2.1],heading=1;
const lifted=await plantAt(raised,[0,0,0],heading);
try{
  lifted.hoist([1,...raised,0,0,0,heading]);
  let worst=0;
  for(let i=0;i<240;i++){
    lifted.step();
    worst=Math.max(worst,Math.abs(lifted.pose()[0][2]-raised[2]));
  }
  console.log({mode,hoistHeight:raised[2],maxHeightError:worst});
  assert(worst<.06,'The unloaded hoist should hold the target height to within 6 cm');
}finally{lifted.close();}

if(process.argv.includes('--handoff')){
  const normal=[.12,-.18,Math.sqrt(1-.12**2-.18**2)],heading=Math.PI/2;
  const cradle=await plantAt(raised,[0,0,0],heading);
  function rotate(q,v){
    const [w,x,y,z]=q,[a,b,c]=v;
    return [(1-2*(y*y+z*z))*a+2*(x*y-w*z)*b+2*(x*z+w*y)*c,
      2*(x*y+w*z)*a+(1-2*(x*x+z*z))*b+2*(y*z-w*x)*c,
      2*(x*z-w*y)*a+2*(y*z+w*x)*b+(1-2*(x*x+y*y))*c];
  }
  const miss=(a,b)=>Math.hypot(...Array.from(a,(v,i)=>v-b[i]));
  try{
    assert(cradle.fork,'Expected a physical launch handoff');
    cradle.fork(normal,[0,0,0,0],[0,0,0]);
    cradle.hoist([1,...raised,0,0,0,heading]);
    for(let i=0;i<250;i++)cradle.step();
    const [,carried]=cradle.pose();
    const deckAngle=Math.acos(Math.max(-1,Math.min(1,dot(rotate(carried,[0,0,1]),normal))));
    assert(deckAngle<.05,'The carried sub should roll and pitch with the deck');
    // Deliberately release from a different pose than the old integrated body.
    const launch=[-21,24,2.5],velocity=[1.2,-.7,.35],omega=[.14,-.23,.28];
    const q=[.69,-.09,.13,.70],length=Math.hypot(...q);for(let i=0;i<4;i++)q[i]/=length;
    cradle.fork(rotate(q,[0,0,1]),q,omega);
    if(process.argv.includes('--rigid')){
      // Motion, the navigation sensor payload and inertial display all read
      // these body-frame channels, including while a tilted carrier moves.
      cradle.hoist([1,...launch,...velocity,heading]);cradle.step();
      const [at,orientation]=cradle.pose(),[bodyVelocity,bodyRate]=cradle.motion();
      assert(miss(at,launch)<1e-8&&Math.abs(dot(q,orientation))>1-1e-10,'Rigid mount pose');
      assert(miss(rotate(orientation,bodyVelocity),velocity)<1e-8,'Rigid mount linear velocity');
      assert(miss(rotate(orientation,bodyRate),omega)<1e-8,'Rigid mount angular velocity');
    }
    cradle.hoist([-1,...launch,...velocity,heading]);
    cradle.step();
    const [position,attitude]=cradle.pose(),[speed,rate]=cradle.motion();
    const handoffDistance=miss(position,launch.map((p,i)=>p+.01*velocity[i]));
    const handoffAngle=2*Math.acos(Math.min(1,Math.abs(dot(attitude,q))));
    assert(handoffDistance<.004&&handoffAngle<.012,'Release must transfer the authoritative position and orientation');
    assert(miss(rotate(attitude,speed),velocity)<.12,'Release must preserve carrier ENU velocity');
    assert(miss(rotate(attitude,rate),omega)<.10,'Release must preserve carrier angular velocity');
    for(let i=0;i<20;i++)cradle.step();
    assert(miss(cradle.pose()[0],launch)>.15,'Holding the release command must hand off only once');
    console.log({mode,deckAngleDeg:deckAngle*180/Math.PI,handoffDistance,handoffAngleDeg:handoffAngle*180/Math.PI});
  }finally{cradle.close();}
  // A stale latch packet while the vehicle is swimming beneath a raised fork
  // must have exactly the free-swimming trajectory.
  const below=[raised[0],raised[1],raised[2]-2],swimming=[];
  for(const latch of [0,1]){
    const p=await plantAt(below,[.2,0,0],heading);
    try{
      p.hoist([latch,...raised,0,0,0,heading]);
      for(let i=0;i<25;i++)p.step();
      swimming.push(p.pose()[0]);
    }finally{p.close();}
  }
  assert(miss(...swimming)<1e-8,'A raised fork pulled the vehicle from below');

  if(process.argv.includes('--mount')){
    const jump=raised.map((v,i)=>v+[1.15,-.35,.85][i]);
    for(const command of [1,2]){
      const start=command===1?raised:below;
      const p=await plantAt(start,[0,0,0],heading);
      try{
        p.fork([0,0,1],[0,0,0,0],[0,0,0]);
        p.hoist([0,...raised,0,0,0,heading]);p.step();
        p.hoist([command,...raised,0,0,0,heading]);p.step();
        assert(miss(p.pose()[0],raised)<.01,'Mount at accepted spawn or ordinarily capture on the forks');
        for(let i=0;i<10;i++)p.step();
        p.hoist([command,...jump,0,0,0,heading]);p.step();
        if(process.argv.includes('--rigid'))assert(miss(p.pose()[0],jump)<1e-8,'The mounted hull must occupy the prescribed carrier frame on the first step');
        else assert(miss(p.pose()[0],jump)>1,'Repeated carrier packets must not teleport the integrator');
        for(let i=0;i<115;i++)p.step();
        const delayedMargin=miss(p.pose()[0],jump);
        assert(delayedMargin<.09,'A secured sub must follow a delayed heaving and moving carrier');
        p.hoist([0,...jump,0,0,0,heading]);for(let i=0;i<40;i++)p.step();
        assert(p.pose()[0][2]<jump[2]-.20,'A released sub should fall independently');
        console.log({mode,capture:command===2?'confirmed carrier spawn':'ordinary approach',delayedMargin});
      }finally{p.close();}
    }

    const site=wreckSites.find(site=>site.id==='yatush');
    const mesh=collisionSurface(await (await fetchAsset(new URL('/yatush/collision.json','file:///'))).json());
    const face=mesh.nearest([-2.93,-4.1,2.36],4),normal=face.normal;
    const origin=[site.east,site.north,bed.height(site.east,site.north)-site.burial];
    const siteStart=origin.map((v,i)=>v+face.point[i]+.66*piccardScale*normal[i]);
    const p=await plantAt(siteStart,normal.map(v=>-1.4*v),Math.atan2(-normal[1],-normal[0]));
    try{
      const update=contactStepper(await loadWreckContacts({fetchAsset}),p.pose,p.constraints);
      for(let i=0;i<3;i++){update();p.step();}
      assert(Math.hypot(...p.force())>100,'Hand off from a genuinely loaded scan contact');
      const transfer=hoistTransferPose(),target=[2,...raised,0,0,0,0],q=[1,0,0,0];
      p.fork([0,0,1],q,[0,0,0]);p.hoist(target);update(transfer(target,q));p.step();
      assert(Math.hypot(...p.force())<.01,'The old support reaction must clear at a frame handoff');
      assert(Math.hypot(...p.motion()[0])<.05,'An old scan plane imparted velocity after mounting');
    }finally{p.close();}
  }
}
