import {sailboatMesh,observeBoat,sailingRigFields} from './board/boat.mjs';
import {readSailPanels,sailPanelFields} from './board/sail-battens.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';
import {cabinCruiser} from './motorboat.mjs';
import {remoteDroneMesh} from './drone.mjs';
import {vesselNpcNames} from './npc-room.mjs';
import {nextFleetStart} from './npc-hobie-race.mjs';
import {drawRacerFrame} from './npc-sailing-frame.mjs';
import {startGate} from './sailing-start.mjs';

// Non-racing patrols remain on the common sea clock.
const routes={
  sloop:{center:[-3,-28],radius:[22,10],speed:2.1,orbit:10},
  motorboat:{center:[25,-30],radius:[29,14],speed:4.4,orbit:13},
  drone:{center:[12,-8],radius:[25,11],speed:5.5,height:8,orbit:5},
  sub:{center:[17,-25],radius:[20,7],speed:1.1,height:-5.5,orbit:5}
};
const darkLamps=[0,0,0,0],contactClass={sloop:0,hobie:1,motorboat:2};

function dispose(group){
  group.removeFromParent();
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(obj=>{
    if(obj.userData.sharedVehicleAsset)return;
    if(obj.geometry)geometries.add(obj.geometry);
    for(const material of [].concat(obj.material??[])){
      materials.add(material);
      for(const property of Object.values(material))if(property?.isTexture)textures.add(property);
    }
  });
  for(const resource of [...geometries,...materials,...textures])resource.dispose();
}

export function vesselTraffic(T,scene,surface,windAt,race,room,onError,onFinish){
  const craft=new Map(),sailRigs=new Map(),wind=new T.Vector2(),contacts=new Float64Array(45),tilts=new Float64Array(10);
  const cruisers=[];
  let worker,awaiting=false,lastUpdate,plannerSession;
  function stopPlanner(){
    worker?.terminate();worker=null;awaiting=false;lastUpdate=undefined;
  }
  addEventListener('pagehide',stopPlanner,{once:true});
  function stepPilots(rows,utc,time,nearby){
    if(!room.host||!rows.some(row=>row.kind==='hobie')){
      if(worker)stopPlanner();
      return;
    }
    if(plannerSession!==room.session){stopPlanner();plannerSession=room.session;}
    if(awaiting||lastUpdate!==undefined&&time-lastUpdate<.10)return;
    const step=lastUpdate===undefined?1:Math.max(1,Math.min(4,Math.round((time-lastUpdate)/.05)));
    lastUpdate=time;
    const prevailing=race.get('windBearing'),upwind=prevailing+Math.PI,course=[Math.cos(upwind),Math.sin(upwind)];
    const side=[-course[1],course[0]],racers=[],traffic=[];
    function contact(id,pose,tilt){traffic.push({id,pose,tilt});}
    const [z,roll,pitch]=race.get('launchPose');
    contact('committee',[1,race.get('committeeEast'),race.get('committeeNorth'),upwind,0,0,0,z,3],[roll,-pitch]);
    for(const row of nearby)contact(row.id,[1,row.x,row.y,row.yaw,row.ve,row.vn,row.yawRate??0,row.z,row.hull===3?2:row.hull===1?1:0],[row.heel??0,row.pitch??0]);
    rows.forEach((row,index)=>{
      const key='npc-'+(index+1),entry=craft.get(key);
      if(row.kind==='hobie'){
        const previous=room.vesselFrames.get(entry.pilotId);
        const raceStart=row.raceAt??entry.raceAt;
        const lane=row.lane===undefined?[0,-13,13,-26,26][index]:-26+13*row.lane;
        const remaining=raceStart-utc,approach=remaining>40?42:Math.min(32,Math.max(9,remaining*2));
        const heading=upwind+1.04;
        const east=previous?.[0]??(startGate.gateEast+side[0]*lane-approach*Math.cos(heading));
        const north=previous?.[1]??(startGate.gateNorth+side[1]*lane-approach*Math.sin(heading));
        windAt(east,north,wind);
        const yaw=previous?.[3]??heading,dx=Math.cos(yaw),dy=Math.sin(yaw);
        const seaRoll=Math.atan((surface(east-dy,north+dx)-surface(east+dy,north-dx))*.5);
        const seaPitch=-Math.atan((surface(east+dx,north+dy)-surface(east-dx,north-dy))*.5);
        racers.push({id:entry.pilotId,raceStart,water:surface(east,north),roll:seaRoll,pitch:seaPitch,wind:[wind.x,wind.y],
          initial:{...startGate,prevailing,lane,initialEast:east,initialNorth:north,initialHeading:previous?.[3]??heading,initialSpeed:previous?.[4]??2.1,initialPenalty:previous?.[12]??0}});
        if(previous)contact(entry.pilotId,[1,east,north,previous[3],previous[5],previous[6],previous[7],previous[2],1],previous.slice(18,20));
      }else{
        const offset=index*9;
        if(contacts[offset]>.5)contact(key,Array.from(contacts.slice(offset,offset+9)),Array.from(tilts.slice(index*2,index*2+2)));
      }
    });
    if(!worker){
      const current=new Worker(new URL('./npc-sailing-worker.mjs',import.meta.url),{type:'module'});
      worker=current;
      current.onmessage=({data})=>{
        if(worker!==current)return;
        awaiting=false;
        if(data.error){stopPlanner();onError(Error(data.error));return;}
        room.publishVessels(data.frames);
      };
      current.onerror=event=>{if(worker===current){stopPlanner();onError(Error(event.message));}};
    }
    awaiting=true;
    worker.postMessage({racers,utc,step,traffic});
  }
  function rig(kind){
    if(!sailRigs.has(kind)){
      const cat=kind==='hobie',shell=cat?'hobie-hulls':'sloop-hull';
      const loading=Promise.all([loadVehicleShell(shell),loadInstance(cat?'Hobie16':'Sailboat',{
        windEast:0,windNorth:8})]).then(([,model])=>{
          const panels=cat?readSailPanels(model):null;
          const geometry={rig:cat?model.getMany(sailingRigFields):null,
            cloth:panels?model.getMany(sailPanelFields.map(fields=>fields[3])):null};
          const [axisX,axisZ,trim]=model.getMany(['axisX','axisZ','trim']);
          const axes=axisX.map((x,i)=>new T.Vector3(x,0,axisZ[i]).normalize());
          return {state:observeBoat(model),foilX:model.get('foilX')[0],panels,geometry,axes,trim,
            stays:cat?model.get('stayPath'):null};
        });
      sailRigs.set(kind,loading);
      loading.catch(()=>sailRigs.delete(kind));
    }
    return sailRigs.get(kind);
  }
  async function load(kind){
    if(kind==='motorboat'){
      const cruiser=cabinCruiser(T);
      return {group:cruiser.group,cruiser,animate:(t,speed)=>cruiser.update(t,speed*240,.06,darkLamps),
        dispose:()=>{cruiser.group.removeFromParent();cruiser.dispose();}};
    }
    if(kind==='drone'){
      const group=await remoteDroneMesh(T);
      const rotors=Array.from({length:4},(_,i)=>group.getObjectByName('RDD2 rotor '+i));
      return {group,animate(t){rotors.forEach((rotor,i)=>rotor.rotation.z=(i%2?1:-1)*110*t);}};
    }
    if(kind==='sub'){
      await loadVehicleShell('survey-pressure-housing');
      return {group:surveyVehicle(T,vehicleShell('survey-pressure-housing'))};
    }
    const {state,foilX,panels,geometry,axes,trim,stays}=await rig(kind);
    const boat=sailboatMesh(T,kind==='hobie',foilX,panels);
    boat.update(state,null,null,null,null,null,stays,0,geometry);
    const pivots=boat.inspection.sails.map(sail=>sail.pivot);
    const orientations=pivots.map(pivot=>pivot.quaternion.clone());
    if(kind==='hobie')return {group:boat.group,boat};
    return {group:boat.group,animate(t,speed,heading){
      const {x,y}=boat.group.position;
      windAt(x,y,wind);
      const lateral=wind.y*Math.cos(heading)-wind.x*Math.sin(heading);
      const along=wind.x*Math.cos(heading)+wind.y*Math.sin(heading)-speed;
      const apparent=Math.atan2(-lateral,-along);
      const angles=[T.MathUtils.clamp(apparent*.55,-1.1,1.1),T.MathUtils.clamp(apparent*.42,-.75,.75)];
      pivots.forEach((pivot,i)=>pivot.quaternion.setFromAxisAngle(axes[i],angles[i]-trim[i]).multiply(orientations[i]));
    }};
  }
  function begin(row,id,index,utc){
    const entry={kind:row.kind,started:row.started,raceId:row.raceId,
      raceAt:row.raceAt??nextFleetStart(utc,race.get('countdown')),
      pilotId:row.raceId??'v-'+index+'-'+Math.round(row.started*1000)};
    craft.set(id,entry);
    load(row.kind).then(visual=>{
      if(craft.get(id)!==entry){(visual.dispose??(()=>dispose(visual.group)))();return;}
      entry.visual=visual;visual.group.name=vesselNpcNames[row.kind]+' NPC';scene.add(visual.group);
    }).catch(error=>{
      if(craft.get(id)===entry)onError(error);
    });
    return entry;
  }
  const remove=(id,entry)=>{
    const visual=entry.visual;
    if(visual)(visual.dispose??(()=>dispose(visual.group)))();
    craft.delete(id);
  };
  return {contacts,tilts,cruisers,draw(rows,time,utc,displayUtc,nearby){
    contacts.fill(0);tilts.fill(0);cruisers.length=0;
    for(const [id,entry] of craft){
      const row=rows[Number(id.slice(4))-1];
      if(!row||row.started!==entry.started||row.kind!==entry.kind||row.raceId!==entry.raceId)remove(id,entry);
    }
    for(const [i,row] of rows.entries()){
      const id='npc-'+(i+1),entry=craft.get(id)??begin(row,id,i,utc),visual=entry.visual;
      let east,north,speed,heading,orbit,height,angle;
      if(row.kind==='hobie'){
        if(row.raceAt!==undefined)entry.raceAt=row.raceAt;
        const snapshot=room.vesselFrames.get(entry.pilotId);
        if(!snapshot){
          if(visual)visual.group.visible=false;
          continue;
        }
        if(snapshot!==entry.snapshot){
          entry.prior=entry.snapshot??snapshot;entry.snapshot=snapshot;entry.received=displayUtc;
        }
        if(visual)visual.group.visible=true;
        const blend=Math.max(0,Math.min(1,(displayUtc-entry.received)/.10));
        const mix=i=>entry.prior[i]+blend*(snapshot[i]-entry.prior[i]);
        east=mix(0);north=mix(1);heading=mix(3);speed=mix(4);orbit=12;
        const [stage,elapsed,lapTime,heatStart,penalty,turnDegrees]=snapshot.slice(8,14);
        const status={stage,elapsed,lapTime,heatStart,penalty,turnDegrees};
        entry.raceStatus=status;
        if(stage===5&&lapTime>0&&heatStart!==entry.finishedHeat){
          entry.finishedHeat=heatStart;
          onFinish(i+1,row,status);
        }
        if(visual){
          const state=drawRacerFrame(visual.boat,entry.prior,snapshot,blend,time);
          contacts.set([1,state[0],state[1],state[2],mix(5),mix(6),mix(7),state[3],1],i*9);
          tilts.set([state[4],state[5]],i*2);
          visual.group.userData.orbitDistance=orbit;
        }
        continue;
      }else{
        const {center,radius,speed:patrolSpeed,orbit:patrolOrbit,height:patrolHeight}=routes[row.kind];
        const [a,b]=radius,clock=Math.max(0,time-row.started);
        angle=i*2.399963+(row.phase??0)+clock*patrolSpeed/(.5*(a+b));
        // Move each reset patrol to its own patch of open water.
        const patrolEast=row.patrol===undefined?0:105+68*row.patrol-center[0];
        const patrolNorth=row.patrol===undefined?0:45-center[1];
        east=center[0]+patrolEast+a*Math.cos(angle);north=center[1]+patrolNorth+b*Math.sin(angle);
        heading=Math.atan2(b*Math.cos(angle),-a*Math.sin(angle));
        speed=patrolSpeed;orbit=patrolOrbit;height=patrolHeight;
      }
      if(!visual)continue;
      let z=height,roll=0,pitch=0;
      if(height===undefined){
        const dx=Math.cos(heading),dy=Math.sin(heading);
        z=surface(east,north)+.055;
        roll=Math.atan((surface(east-dy,north+dx)-surface(east+dy,north-dx))*.5);
        pitch=-Math.atan((surface(east+dx,north+dy)-surface(east-dx,north-dy))*.5);
      }else if(row.kind==='drone'){
        z+=.8*Math.sin(angle*2);roll=.14;pitch=.13;
      }
      const kind=contactClass[row.kind];
      if(kind!==undefined)contacts.set([1,east,north,heading,speed*Math.cos(heading),speed*Math.sin(heading),0,z,kind],i*9);
      tilts.set([roll,pitch],2*i);
      if(visual.cruiser)cruisers.push(visual.cruiser);
      visual.group.position.set(east,north,z);
      visual.group.rotation.set(roll,pitch,heading,'ZYX');
      visual.animate?.(time,speed,heading);
      visual.group.userData.orbitDistance=orbit;
    }
    stepPilots(rows,utc,time,nearby);
  },subject:id=>craft.get(id)?.visual?.group,raceStatus:id=>craft.get(id)?.raceStatus};
}
