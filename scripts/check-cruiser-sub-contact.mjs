// Drive the compiled free-swimming Piccard into a cruiser and exchange both body states.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const root=process.argv[2]??'build/pages';
async function open(kind,parameters){
  const base=pathToFileURL(resolve(root,kind)+'/');
  const read=async name=>JSON.parse(await readFile(new URL(name,base)));
  const fmu=await openFmuSession({base,index:await read((await read('manifest.json')).index),fetch:fileFetch,parameters,downloadFirst:true});
  return {
    fmu,
    observe(name,n){
      const binding=fmu.bind_outputs(JSON.stringify(scalarNames(name,[n])));
      return ()=>Array.from(fmu.read_bound(binding));
    },
    peer(name){
      const names=scalarNames(name,[9,14]).slice(0,14);
      return row=>fmu.set_inputs(JSON.stringify(names.map((key,i)=>[key,row[i]])));
    }
  };
}
function quaternion([roll,pitch,yaw]){
  const [cr,cp,cy]=[roll,pitch,yaw].map(v=>Math.cos(v/2));
  const [sr,sp,sy]=[roll,pitch,yaw].map(v=>Math.sin(v/2));
  return [cr*cp*cy+sr*sp*sy,sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy];
}
function intoWorld(q,v){
  const [w,x,y,z]=q,[vx,vy,vz]=v;
  const a=2*(y*vz-z*vy),b=2*(z*vx-x*vz),c=2*(x*vy-y*vx);
  return [vx+w*a+y*c-z*b,vy+w*b+z*a-x*c,vz+w*c+x*b-y*a];
}
async function approach(label,local,velocity,yaw,expectContact,axis=[0,1,0]){
  const center=[-45,-18,0],q=quaternion([0,0,yaw]);
  const boat=await open('motorboat',{initialEast:center[0],initialNorth:center[1],initialHeading:yaw});
  let sub;
  try{
    const initial=boat.observe('boatPose',6)(),rotation=quaternion(initial.slice(3));
    const start=intoWorld(rotation,local).map((x,i)=>x+initial[i]),speed=intoWorld(rotation,velocity);
    const params={'sub.spawnHeading':yaw};
    for(let i=0;i<3;i++){
      params['sub.spawnPosition['+(1+i)+']']=start[i];params['sub.spawnVelocity['+(1+i)+']']=speed[i];
    }
    sub=await open('submarine',params);
    const calm=[['windSpeed',0],['seaState',0],['omitWake',1]];
    boat.fmu.set_inputs(JSON.stringify(calm));
    sub.fmu.set_inputs(JSON.stringify([...calm,['idleCamera',1],['subManual',1]]));
    const bp=boat.observe('boatPose',6),deck=boat.observe('landingDeck',12),bf=boat.observe('peerHullWrench',6);
    const sp=sub.observe('sub.position',3),sq=sub.observe('sub.orientation',4),sv=sub.observe('sub.velocity',3);
    const sw=sub.observe('sub.rates',3),sf=sub.observe('sub.peerHullWrench',6);
    const toBoat=boat.peer('peerSubs'),toSub=sub.peer('peerCruisers');
    const normal=intoWorld(q,axis);
    const component=f=>f.slice(0,3).reduce((v,x,i)=>v+x*normal[i],0);
    let subPeak=0,boatPeak=0,distance=Infinity,abovePlatform=Infinity;
    let separated=false;
    for(let tick=0;tick<100;tick++){
      const pose=bp(),twist=deck().slice(6),orientation=sq();
      toSub([1,...pose.slice(0,3),...quaternion(pose.slice(3)),...twist]);
      toBoat([1,...sp(),...orientation,...intoWorld(orientation,sv()),...intoWorld(orientation,sw())]);
      sub.fmu.step(.01);boat.fmu.step(.01);
      const f=sf(),reaction=bf();
      assert([...f,...reaction,...sp()].every(Number.isFinite),label+' finite pose and loads');
      subPeak=Math.max(subPeak,expectContact?component(f):Math.hypot(...f.slice(0,3)));
      boatPeak=Math.max(boatPeak,expectContact?-component(reaction):Math.hypot(...reaction.slice(0,3)));
      const carrier=bp(),bodyAxis=intoWorld(quaternion(carrier.slice(3)),axis);
      const relative=sp().map((value,i)=>value-carrier[i]);
      distance=Math.min(distance,relative.reduce((total,value,i)=>total+value*bodyAxis[i],0));
      if(axis[2]){
        const cq=quaternion(carrier.slice(3)),body=intoWorld([cq[0],-cq[1],-cq[2],-cq[3]],relative);
        if(body[0]>=-4.16&&body[0]<=-3.68&&Math.abs(body[1])<.8)
          abovePlatform=Math.min(abovePlatform,body[2]-.186);
      }
      if(subPeak>15&&Math.hypot(...f.slice(0,3))<1)separated=true;
    }
    if(expectContact){
      assert(subPeak>15&&boatPeak>15,label+' must push the submarine out and recoil on the cruiser');
      if(axis[1])assert(separated,label+' must separate after contact');
      if(axis[1])assert(distance>1.2,label+' must stay outside the cruiser hull');
      if(axis[2])assert(Number.isFinite(abovePlatform)&&abovePlatform>0,label+' must keep its center above the swim platform');
    }else assert.equal(subPeak+boatPeak,0,label+' must be clear of the cruiser hull');
    console.log(label,{subPeakN:subPeak,boatPeakN:boatPeak,minBodyAxisM:distance});
  }finally{sub?.fmu.free();boat.fmu.free();}
}
await approach('Port beam',[-.2,1.85,-.1],[0,-.9,0],.92,true);
await approach('Onto the stern swim platform',[-3.93,.20,.34],[0,0,-.65],.92,true,[0,0,1]);
await approach('Beside the davit in open water',[-2.78,3.65,-.38],[0,0,0],.92,false);
