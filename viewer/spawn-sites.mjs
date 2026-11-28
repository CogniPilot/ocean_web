import {wreckApproach,wreckSites} from './red-sea-sites.mjs';
import {abyssCave} from './abyss-cave.mjs';
import {abyssSite,diverWreckStart} from './harbor-sites.mjs';
import {sailingStart,startGate,windBearing} from './sailing-start.mjs';

export const committeePad={aft:-1.98,top:.79,width:1.45,length:1.3};
export const islandPad={x:36,y:34,width:2.7,length:2.7};

export function fixedSpawnPoints(vehicle){
  if(vehicle==='drone'){
    const offset=startGate.lineLength/2;
    return [{id:'default',label:'Harbor hover'},
      {id:'committee-pad',label:'Boston Whaler 190 helipad',drone:true,
        x:startGate.gateEast-offset*Math.sin(windBearing),y:startGate.gateNorth+offset*Math.cos(windBearing)},
      {id:'island-pad',label:'Island helipad',drone:true,x:islandPad.x,y:islandPad.y}];
  }
  if(vehicle==='sub'||vehicle==='diver'){
    // Start over the eastern shelf, looking across the drop toward its southern half.
    const x=abyssSite.east+abyssSite.eastRadius+5,y=abyssSite.north+2;
    const z=globalThis.harborBed.height(x,y)+1.1;
    const yaw=Math.atan2(abyssSite.north-.4*abyssSite.northRadius-y,abyssSite.east-x);
    const dives=[...wreckSites.map(site=>{
      if(vehicle==='diver'){
        // Swim along each hull from beyond its end, leaving room to pass.
        const fromEast=site.id==='yatush',direction=fromEast?-1:1;
        return {id:site.id,label:site.name+' approach',x:site.east-direction*(site.halfLength+7),
          y:site.north-site.halfBeam-4.5,z:site.approachUp,yaw:fromEast?Math.PI:0};
      }
      const {position:[x,y,z],heading:yaw}=wreckApproach(site);
      return {id:site.id,label:site.name+' approach',x,y,z,yaw};
    }),{id:'abyss',label:'Abyss',x,y,z,yaw},
      {id:'cave',label:'Abyss cave approach',x:abyssCave.approach[0],y:abyssCave.approach[1],z:abyssCave.approach[2],yaw:abyssCave.heading},
      {id:'reef',label:'Island reef',...(vehicle==='diver'
        // Swim along the southern reef edge, with colonies on the left and open water ahead.
        ?{x:17,y:22.4,z:-4.5,yaw:-8*Math.PI/180}
        :{x:17.1,y:24.8,z:-5.9,yaw:Math.atan2(2.2,2.6)})}];
    if(vehicle==='sub')return dives.map(p=>({...p,sub:true}));
    return [{id:'default',label:'Wreck dive',...diverWreckStart,diver:true},
      ...dives.map(p=>({...p,diver:true})),{id:'beach',label:'Island beach',x:22.5,y:40,diver:true}];
  }
  if(['hobie','sloop','motorboat','whaler'].includes(vehicle)){
    const {launchEast:x,launchNorth:y}=['motorboat','whaler'].includes(vehicle)?{launchEast:3,launchNorth:-15}:sailingStart(vehicle==='hobie');
    return [{id:'launch',label:'Harbor launch',x,y,surface:true},
      {id:'offshore',label:'Open water',x:-182,y:105,surface:true}];
  }
  return [{id:'default',label:'Usual start'}];
}

export function entryPose(point){
  if(point?.drone)return {droneStart:point.id};
  if(point?.diver)return {diverSpawn:Number.isFinite(point.z)?[point.x,point.y,point.z,point.yaw??0]:[point.x,point.y]};
  if(point?.sub)return {subStart:{position:[point.x,point.y,point.z],velocity:[point.ve??0,point.vn??0,point.vu??0],heading:point.yaw??0}};
  if(point?.surface)return {spawn:{launchEast:point.x,launchNorth:point.y}};
  return {};
}
