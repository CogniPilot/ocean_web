import {deckTwist} from './deck-traffic.mjs';
import {sailboatMesh,observeBoat,sailingRigFields} from './board/boat.mjs';
import {readSailPanels,sailPanelFields} from './board/sail-battens.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';
import {cabinCruiser} from './motorboat.mjs';
import {remoteDroneMesh} from './drone.mjs';
import {vesselNpcNames} from './npc-room.mjs';
import {nextFleetStart} from './npc-hobie-race.mjs';
import {drawRacerFrame,racerFrameSize} from './npc-sailing-frame.mjs';
import {raceCoursePoints,raceGateEnds} from './regatta.mjs';
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

export function vesselTraffic(T,scene,surface,windAt,race,room,onError,onFinish,incidentSea,fleetNumber){
  const craft=new Map(),sailRigs=new Map(),wind=new T.Vector2(),contacts=new Float64Array(45),tilts=new Float64Array(10);
  const cruisers=[];
  const planners=new Map();
  // Reserve capacity for the world worker and the renderer. Small devices
  // can share a worker across several boats while larger ones get one each.
  const plannerLimit=Math.max(1,Math.min(5,(navigator.hardwareConcurrency||4)-2));
  let plannerSession;
  function stopPlanner(){
    for(const {worker} of planners.values())worker.terminate();
    planners.clear();
  }
  function createPlanner(slot){
    const worker=new Worker(new URL('./npc-sailing-worker.mjs',import.meta.url),{type:'module'});
    const planner={worker,awaiting:false,time:undefined};
    const fail=error=>{
      if(planners.get(slot)!==planner)return;
      worker.terminate();planners.delete(slot);onError(error);
    };
    worker.onmessage=({data})=>{
      if(planners.get(slot)!==planner)return;
      if(data.error){fail(Error(data.error));return;}
      planner.awaiting=false;
      room.publishVessels(data.frames);
    };
    worker.onerror=event=>fail(Error(event.message));
    planners.set(slot,planner);
    return planner;
  }
  addEventListener('pagehide',stopPlanner,{once:true});
  function stepPilots(rows,utc,time,nearby){
    if(!room.host||!rows.some(row=>row.kind==='hobie')){
      if(planners.size)stopPlanner();
      return;
    }
    if(plannerSession!==room.session){stopPlanner();plannerSession=room.session;}
    const sea=incidentSea?.();
    const prevailing=race.get('windBearing'),upwind=prevailing+Math.PI,course=[Math.cos(upwind),Math.sin(upwind)];
    const side=[-course[1],course[0]],groups=new Map(),traffic=[];
    function contact(id,pose,tilt){traffic.push({id,pose,tilt});}
    const [z,roll,pitch]=race.get('launchPose');
    const deck=race.get('deckState'),coursePoints=raceCoursePoints(race);
    const courseGateEnds=raceGateEnds(race);
    contact('committee',[1,deck[0],deck[1],deck[3],deck[6],deck[7],deck[11],z,3],[roll,-pitch]);
    for(const row of nearby)contact(row.id,[1,row.x,row.y,row.yaw,row.ve,row.vn,row.yawRate??0,row.z,row.hull===3?2:row.hull===1?1:0],[row.heel??0,row.pitch??0]);
    rows.forEach((row,index)=>{
      const key='npc-'+(index+1),entry=craft.get(key);
      if(row.kind==='hobie'){
        const previous=room.vesselFrames.get(entry.pilotId);
        const raceStart=row.raceAt??entry.raceAt;
        const lane=row.lane===undefined?[0,-13,13,-26,26][index]:-26+13*row.lane;
        const remaining=raceStart-utc,approach=remaining>40?42:Math.min(32,Math.max(9,remaining*2));
        const heading=upwind+1.04;
        const east=previous?.[0]??((courseGateEnds[0]+courseGateEnds[2])/2+side[0]*lane-approach*Math.cos(heading));
        const north=previous?.[1]??((courseGateEnds[1]+courseGateEnds[3])/2+side[1]*lane-approach*Math.sin(heading));
        windAt(east,north,wind);
        const yaw=previous?.[3]??heading,dx=Math.cos(yaw),dy=Math.sin(yaw);
        const seaRoll=sea?0:Math.atan((surface(east-dy,north+dx)-surface(east+dy,north-dx))*.5);
        const seaPitch=sea?0:-Math.atan((surface(east+dx,north+dy)-surface(east-dx,north-dy))*.5);
        const slot=index%plannerLimit;
        if(!groups.has(slot))groups.set(slot,[]);
        groups.get(slot).push({id:entry.pilotId,controller:row.controller??'vmg',weights:row.weights,raceStart,water:sea?.tide??surface(east,north),roll:seaRoll,pitch:seaPitch,wind:[wind.x,wind.y],
          initial:{...startGate,prevailing,lane,initialEast:east,initialNorth:north,initialHeading:yaw,initialSpeed:previous?.[4]??2.1,initialPenalty:previous?.[12]??0}});
        if(previous)contact(entry.pilotId,[1,east,north,previous[3],previous[5],previous[6],previous[7],previous[2],1],previous.slice(18,20));
      }else{
        const offset=index*9;
        if(contacts[offset]>.5)contact(key,Array.from(contacts.slice(offset,offset+9)),Array.from(tilts.slice(index*2,index*2+2)));
      }
    });
    for(const [slot,planner] of planners){
      if(!groups.has(slot)){
        planner.worker.terminate();planners.delete(slot);
      }
    }
    for(const [slot,racers] of groups){
      const planner=planners.get(slot)??createPlanner(slot);
      if(planner.awaiting)continue;
      planner.time??=time-.10;
      // Advance to the same clock without dropping ticks when one reply is
      // briefly late. Bound catch-up batches so a slow browser can recover.
      planner.time=Math.max(planner.time,time-.35);
      const step=Math.min(2,Math.floor((time-planner.time+1e-7)/.05));
      if(step<2)continue;
      planner.time+=.05*step;
      planner.awaiting=true;
      planner.worker.postMessage({racers,utc:utc-(time-planner.time),step,traffic,sea,coursePoints,courseGateEnds});
    }
  }
  function rig(kind){
    if(!sailRigs.has(kind)){
      const cat=kind==='hobie',shell=cat?'hobie-hulls':'sloop-hull';
      const loading=Promise.all([loadVehicleShell(shell),loadInstance(cat?'Hobie16':'Sailboat',{
        windEast:0,windNorth:8})]).then(([,model])=>{
          const panels=cat?readSailPanels(model):null;
          const geometry={mastRotation:cat&&model.has('mastRotation')?model.get('mastRotation'):undefined,
            rig:cat?model.getMany(sailingRigFields):null,
            forestay:cat&&model.has('forestayPath')?model.get('forestayPath'):null,
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
  function attachView(bindings){
    ({scene,surface,windAt,race,incidentSea,onError,onFinish}=bindings);
    for(const entry of craft.values())if(entry.visual)scene.add(entry.visual.group);
  }
  const droneWakes=[],droneContactRows=[],deckRows=[],observations=[];
  return {contacts,tilts,cruisers,observations,droneWakes,droneContactRows,deckRows,attachView,draw(rows,time,utc,displayUtc,nearby,trackDecks=false){
    observations.length=0;contacts.fill(0);tilts.fill(0);cruisers.length=0;droneWakes.length=0;droneContactRows.length=0;deckRows.length=0;
    for(const [id,entry] of craft){
      const row=rows[Number(id.slice(4))-1];
      if(!row||row.started!==entry.started||row.kind!==entry.kind||row.raceId!==entry.raceId)remove(id,entry);
    }
    for(const [i,row] of rows.entries()){
      const id='npc-'+(i+1),entry=craft.get(id)??begin(row,id,i,utc),visual=entry.visual;
      let east,north,speed,heading,orbit,height,angle;
      if(row.kind==='hobie'){
        visual?.boat.setSailNumber(fleetNumber(id));
        if(row.raceAt!==undefined)entry.raceAt=row.raceAt;
        const snapshot=room.vesselFrames.get(entry.pilotId);
        if(!snapshot){
          if(visual)visual.group.visible=false;
          continue;
        }
        if(snapshot!==entry.snapshot){
          entry.prior??=new Float64Array(racerFrameSize);
          entry.shown??=Float64Array.from(snapshot);
          entry.prior.set(entry.shown);
          const interval=entry.received===undefined?.10:Math.max(.08,Math.min(.55,displayUtc-entry.received));
          entry.interval=entry.interval===undefined?interval:.35*entry.interval+.65*interval;
          entry.snapshot=snapshot;entry.received=displayUtc;
          const mastRotation=room.vesselMastRotations.get(entry.pilotId);
          if(mastRotation!==undefined){
            entry.previousMastRotation=entry.mastRotation??mastRotation;
            entry.nextMastRotation=mastRotation;
          }
          const forestay=room.vesselForestays.get(entry.pilotId);
          if(forestay){
            entry.forestay??=Float64Array.from(forestay);
            entry.previousForestay=entry.forestay.slice();
            entry.nextForestay=forestay;
          }
        }
        if(visual)visual.group.visible=true;
        const age=Math.max(0,displayUtc-entry.received);
        const blend=Math.min(1,age/entry.interval);
        // Carry the visible hull forward briefly if the next committed snapshot is late.
        const lead=Math.min(.18,Math.max(0,age-entry.interval));
        const [stage,elapsed,lapTime,heatStart,penalty,turnDegrees]=snapshot.slice(8,14);
        const status={stage,elapsed,lapTime,heatStart,penalty,turnDegrees};
        entry.raceStatus=status;
        if(stage===5&&lapTime>0&&heatStart!==entry.finishedHeat){
          entry.finishedHeat=heatStart;
          onFinish(i+1,row,status);
        }
        if(visual){
          if(entry.nextForestay)for(let i=0;i<9;i++){
            const from=entry.previousForestay[i];
            entry.forestay[i]=from+blend*(entry.nextForestay[i]-from);
          }
          if(entry.nextMastRotation!==undefined)
            entry.mastRotation=entry.previousMastRotation+blend*(entry.nextMastRotation-entry.previousMastRotation);
          const state=drawRacerFrame(visual.boat,entry.prior,snapshot,blend,time,entry.shown,entry.forestay,lead,entry.mastRotation);
          if(trackDecks&&age<.65){
            const pose=[state[0],state[1],state[3],state[2],state[4],-state[5]];
            const frame=values=>[values[0],values[1],values[2],values[3],values[18],-values[19]];
            const twist=deckTwist(pose,frame(entry.prior),frame(snapshot),entry.interval,[snapshot[5],snapshot[6],snapshot[7]]);
            deckRows.push([1,1,...pose,...twist]);
          }
          visual.group.userData.orbitDistance=12;
        }
        observations.push({id,kind:row.kind,hull:1,x:snapshot[0],y:snapshot[1],z:snapshot[2],yaw:snapshot[3],
          ve:snapshot[5],vn:snapshot[6],yawRate:snapshot[7],heel:snapshot[18],pitch:snapshot[19]});
        contacts.set([1,snapshot[0],snapshot[1],snapshot[3],snapshot[5],snapshot[6],snapshot[7],snapshot[2],1],i*9);
        tilts.set([snapshot[18],snapshot[19]],i*2);
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
      let z=height,roll=0,pitch=0;
      if(height===undefined){
        const dx=Math.cos(heading),dy=Math.sin(heading);
        z=surface(east,north)+.055;
        roll=Math.atan((surface(east-dy,north+dx)-surface(east+dy,north-dx))*.5);
        pitch=-Math.atan((surface(east+dx,north+dy)-surface(east-dx,north-dy))*.5);
      }else if(row.kind==='drone'){
        z+=.8*Math.sin(angle*2);roll=.14;pitch=.13;
      }
      const rate=speed/(.5*(routes[row.kind].radius[0]+routes[row.kind].radius[1]));
      observations.push({id,kind:row.kind,hull:({sloop:2,motorboat:3})[row.kind]??0,x:east,y:north,z,yaw:heading,
        heel:roll,pitch,ve:-routes[row.kind].radius[0]*Math.sin(angle)*rate,vn:routes[row.kind].radius[1]*Math.cos(angle)*rate});
      if(!visual)continue;
      const kind=contactClass[row.kind];
      if(kind!==undefined)contacts.set([1,east,north,heading,speed*Math.cos(heading),speed*Math.sin(heading),0,z,kind],i*9);
      tilts.set([roll,pitch],2*i);
      if(trackDecks&&kind!==undefined){
        const pose=[east,north,z,heading,roll,-pitch];
        const twist=deckTwist(pose,entry.deck,pose,time-(entry.deckTime??time));
        deckRows.push([1,row.kind==='sloop'?2:3,...pose,...twist]);
        entry.deck=pose;entry.deckTime=time;
      }
      if(visual.cruiser)cruisers.push(visual.cruiser);
      visual.group.position.set(east,north,z);
      visual.group.rotation.set(roll,pitch,heading,'ZYX');
      if(row.kind==='drone'){
        const {w,x,y,z:up}=visual.group.quaternion;
        droneWakes.push([2,east,north,z,w,x,y,up,0,0,0,0]);
        const [a,b]=routes.drone.radius,rate=speed/(.5*(a+b));
        const ve=-a*Math.sin(angle)*rate,vn=b*Math.cos(angle)*rate,vu=1.6*Math.cos(2*angle)*rate;
        const yawRate=a*b*rate**3/(ve**2+vn**2);
        droneContactRows.push([1,east,north,z,w,x,y,up,ve,vn,vu,0,0,yawRate]);
      }
      visual.animate?.(time,speed,heading);
      visual.group.userData.orbitDistance=orbit;
    }
    stepPilots(rows,utc,time,nearby);
  },subject:id=>craft.get(id)?.visual?.group,raceStatus:id=>craft.get(id)?.raceStatus};
}
