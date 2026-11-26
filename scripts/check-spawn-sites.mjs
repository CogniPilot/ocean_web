import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import {collisionSurface} from '../viewer/wreck-contact.mjs';
import {abyssSite} from '../viewer/harbor-sites.mjs';
import {entryPose,fixedSpawnPoints} from '../viewer/spawn-sites.mjs';
import {harborMap} from '../viewer/harbor-map.mjs';
import bed from '../viewer/bathymetry.js';
import T from '../viewer/vendor/three.min.js';
import {fringingReef} from '../viewer/coral-reef.mjs';

assert.deepEqual(abyssSite,bed.abyss);
// A user with earlier bathymetry.js in cache still has the same height
// field. The chart and spawn picker must also work without its site metadata.
globalThis.harborBed={height:bed.height.bind(bed)};
const sites=fixedSpawnPoints('sub');
assert.deepEqual(sites.map(p=>p.id),['yatush','satil','abyss','cave','reef']);
for(const site of sites){
  const {subStart}=entryPose(site);
  assert.deepEqual(subStart.position,[site.x,site.y,site.z]);
  assert(site.z>harborBed.height(site.x,site.y));
}
const diverSites=fixedSpawnPoints('diver');
for(const site of sites){
  const diver=diverSites.find(p=>p.id===site.id);
  assert.equal(diver.label,site.label);
  if(site.id!=='reef'&&!wreckSites.some(w=>w.id===site.id))assert.deepEqual(entryPose(diver),{diverSpawn:[site.x,site.y,site.z,site.yaw]});
}
// Sweep a three-metre swimming corridor through the actual generated colonies.
let coral;
const reef=fringingReef(T,new T.Group(),{center:bed.shelf.center,height:bed.shelf.vertex},
  false,true,null,null,{setReef:obstacles=>coral=obstacles});
const [rx,ry,rz,angle]=entryPose(diverSites.find(s=>s.id==='reef')).diverSpawn;
assert(Number.isFinite(coral.top(rx,ry,4)),'Diver should start within sight of the reef');
for(let d=0;d<=64;d+=.25)for(let side=-1.5;side<=1.5;side+=.25){
  const x=rx+d*Math.cos(angle)-side*Math.sin(angle),y=ry+d*Math.sin(angle)+side*Math.cos(angle);
  assert(rz-bed.surfaceHeight(x,y)>3.5,'Diver launch corridor intersects the island shelf');
  assert(rz-coral.top(x,y,.85)>1.5,'Diver launch corridor intersects coral');
}
reef.dispose();
for(const site of wreckSites){
  const file=new URL('../viewer/assets/red-sea/'+site.id+'/collision.json',import.meta.url);
  const mesh=collisionSurface(JSON.parse(await readFile(file,'utf8')));
  const base=bed.height(site.east,site.north)-site.burial;
  for(const start of diverSites.filter(p=>p.id===site.id||p.id==='default'&&site.id==='yatush')){
    const [x,y,z,yaw]=entryPose(start).diverSpawn;
    assert((site.east-x)*Math.cos(yaw)+(site.north-y)*Math.sin(yaw)>0,'Wreck begins ahead of the diver');
    for(let d=0;d<=35;d+=.25){
      const east=x+d*Math.cos(yaw),north=y+d*Math.sin(yaw);
      assert(!mesh.nearest([east-site.east,north-site.north,z-base],3),'Diver has room to pass the wreck');
      assert(z-bed.surfaceHeight(east,north)>2,'Diver can keep swimming level above the bottom');
    }
  }
}
assert.deepEqual(entryPose(diverSites.find(s=>s.id==='beach')),{diverSpawn:[22.5,40]});
const rim=sites.find(site=>site.id==='abyss');
const clearance=rim.z-bed.height(rim.x,rim.y);
assert(clearance>=1&&clearance<=1.2,'Sub starts just above the shelf');
const along=distance=>bed.height(rim.x+distance*Math.cos(rim.yaw),rim.y+distance*Math.sin(rim.yaw));
assert(Math.abs(along(-2)-along(0))<.5,'Shelf continues behind the sub');
assert(along(12)<along(0)-6&&along(20)<along(0)-20,'Pilot faces the descending seabed');
const features=[],labels=new Map();
const ctx=new Proxy({fillText(label,x,y){labels.set(label,[x,y]);},ellipse(...args){features.push(args);},measureText:()=>({width:4})},{
  get:(obj,key)=>obj[key]??(()=>{})
});
const canvas={width:680,height:420,getContext:()=>ctx};
const terrain={center:[0,0],height:()=>0};
const race={get:k=>k.startsWith('mark')?[10,20]:1},summary={};
const chart=harborMap(canvas,terrain,race,summary);
chart.draw(-30,-30,sites,'abyss');
const atLabel=id=>labels.get(sites.find(site=>site.id===id).label);
const atFit=atLabel('satil');
assert.equal(chart.pick(...atFit),'satil');
chart.zoom(1.5,...atFit);
chart.pan(-25,17);
const moved=atLabel('satil');
assert.equal(chart.pick(...moved),'satil');
assert.notDeepEqual(moved,atFit);
chart.draw(-30,-30,sites,'abyss');
assert.deepEqual(atLabel('satil'),moved,'Simulation updates preserve the inspected area');
chart.fit();
assert.deepEqual(atLabel('satil'),atFit);
assert(labels.get('Abyss')?.every(Number.isFinite));
for(const id of ['motorboat','hobie','sloop']){
  const starts=fixedSpawnPoints(id);
  assert.deepEqual(starts.map(p=>p.id),['launch','offshore']);
  for(const p of starts)assert.deepEqual(entryPose(p),{spawn:{launchEast:p.x,launchNorth:p.y}});
}
for(const id of ['drone','gull','shark','whale'])assert.deepEqual(entryPose(fixedSpawnPoints(id)[0]),{});
console.log('Landing and respawn points, all initialized poses, and chart with legacy bed metadata passed.');
