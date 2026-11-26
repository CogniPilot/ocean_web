import {individualSwimmer} from './npc-room.mjs';
import {loadMantaModel} from './manta-model.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {waterStreaks} from './water-spray.mjs';

// Packet layout: interpolation clock, 16 restart states, 6 activity channels.
// The host integrates the FMU. Guests render the same solved clock and pose.
let properties;
export async function mantaVisual(T,scene,signal,surface,playSound){
  const skin=await loadMantaModel(T,{signal});
  const group=skin.mesh;
  properties??=loadInstance('MantaRay',{}).then(model=>model.get('bodyProperties'));
  const segments=await properties;
  group.userData.physicsBodies=skin.frames.map((frame,i)=>({
    frame,label:frame.name,mass:segments[7*i],center:segments.slice(7*i+1,7*i+4),moments:segments.slice(7*i+4,7*i+7)
  }));
  group.userData.mantaRestCapsules=skin.contactCapsules;
  let previousWet,spray,lastTime;
  function articulate(row){
    group.position.fromArray(row,1);
    group.rotation.set(row[9],-row[8],row[7],'ZYX');
    const port=row[23]??row[18],starboard=row[24]??row[18];
    group.userData.mantaWingAngles=[port,starboard];
    skin.setWing(port,row[25]??row[22],starboard);
    const wet=row[20],time=row[0];
    if(lastTime!==undefined&&(time<lastTime||time-lastTime>.6))previousWet=undefined;
    if(previousWet!==undefined&&previousWet<.5&&wet>=.5&&row[6]<-.8){
      const {x,y}=group.position,z=surface(x,y);
      const strength=Math.min(6,-row[6]);
      spray??=waterStreaks(T,scene,'Manta reentry spray',120);
      for(let i=0;i<96;i++){
        const angle=i*2.39996,spread=.22+.8*(i%11)/10;
        const across=1.8*Math.cos(angle)*spread,along=.65*Math.sin(angle)*spread;
        const dx=along*Math.cos(row[7])-across*Math.sin(row[7]),dy=along*Math.sin(row[7])+across*Math.cos(row[7]);
        spray.emit(x+dx,y+dy,z+.035,time,.22*row[4]+dx,.22*row[5]+dy,
          strength*(.22+.48*((i*17)%23)/22),.011+.013*spread,z,.035);
      }
      playSound('impact',group.position,Math.min(1.4,strength/4));
    }
    previousWet=wet;lastTime=time;spray?.draw(time);
  }
  const dispose=()=>{spray?.dispose();spray=undefined;skin.dispose();};
  signal.addEventListener('abort',dispose,{once:true});
  return {group,articulate,dispose};
}

export function swimmerObservation(animal,base){
  const row=animal.frame??(animal.id===animal.kind&&!individualSwimmer(animal.kind)?base:undefined);
  if(!row)return;
  const {id,kind}=animal;
  if(individualSwimmer(kind))return {id,kind,x:row[1],y:row[2],z:row[3],ve:row[4],vn:row[5],vz:row[6],yaw:row[7],pitch:-row[8],heel:row[9]};
  const whale=kind==='whale',k=whale?17:9,yaw=row[k+3],u=row[whale?27:65]??0,v=row[whale?38:74]??0;
  return {id,kind,joints:whale?undefined:[row[202]??0,row[70]??0,row[72]??0,row[201]??0],vz:row[whale?28:66]??0,gape:animal.gape??0,x:row[k],y:row[k+1],z:row[k+2],yaw,pitch:-(row[whale?21:67]??0),heel:row[whale?35:203]??0,
    ve:u*Math.cos(yaw)-v*Math.sin(yaw),vn:u*Math.sin(yaw)+v*Math.cos(yaw)};
}

export function wildlifeActorId(id){
  let key=5381;
  for(const c of String(id))key=(Math.imul(33,key)^c.charCodeAt(0))>>>0;
  return key||1;
}

export function wildlifeObservations(actors,exclude,origin,manta=false,otherOrigin){
  const craft=new Float64Array(32*8),craftHull=new Float64Array(32*5);
  const kinds={boat:1,hobie:1,sloop:1,motorboat:1,sub:2,drone:3,shark:4,whale:4,manta:4,diver:4,gull:4};
  let available=actors.filter(a=>!exclude.has(a.id)&&kinds[a.kind]&&Number.isFinite(a.x+a.y+a.z));
  if(available.length>32&&origin){
    const byDistance=p=>(a,b)=>Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2])-Math.hypot(b.x-p[0],b.y-p[1],b.z-p[2]);
    available.sort(byDistance(origin));
    if(otherOrigin){
      // Both regular swimmers share one FMU and a fixed input width. Reserve
      // room for the nearest neighbors of each, even if they range far apart.
      const other=available.slice().sort(byDistance(otherOrigin)),selected=new Set();
      for(let i=0;selected.size<32;i++){
        selected.add(available[i]);
        if(selected.size<32)selected.add(other[i]);
      }
      available=[...selected];
    }
  }
  for(const [i,v] of available.slice(0,32).entries()){
    craft.set([wildlifeActorId(v.id),kinds[v.kind],v.x,v.y,v.z,v.ve??0,v.vn??0,Number(!!v.local)],8*i);
    craftHull.set([manta&&v.kind==='sub'?4:v.hull??0,v.yaw??0,v.heel??0,v.pitch??0,v.yawRate??0],5*i);
  }
  return {craft,craftHull};
}
