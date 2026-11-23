import {sailboatMesh,observeBoat,sailingRigFields} from './board/boat.mjs';
import {readSailPanels,sailPanelFields} from './board/sail-battens.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';
import {cabinCruiser} from './motorboat.mjs';
import {remoteDroneMesh} from './drone.mjs';
import {vesselNpcNames} from './npc-room.mjs';
import {hobieRace,nextFleetStart} from './npc-hobie-race.mjs';

// Non-racing patrols remain on the common sea clock.
const routes={
  sloop:{center:[-3,-28],radius:[22,10],speed:2.1,orbit:10},
  motorboat:{center:[25,-30],radius:[29,14],speed:4.4,orbit:13},
  drone:{center:[12,-8],radius:[25,11],speed:5.5,height:8,orbit:5},
  sub:{center:[17,-25],radius:[20,7],speed:1.1,height:-5.5,orbit:5}
};
const darkLamps=[0,0,0,0];

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

export function vesselTraffic(T,scene,surface,windAt,race,onError,onFinish){
  const craft=new Map(),sailRigs=new Map(),wind=new T.Vector2();
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
      return {group:cruiser.group,animate:(t,speed)=>cruiser.update(t,speed*240,.06,darkLamps),
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
    const entry={kind:row.kind,started:row.started,raceId:row.raceId,raceAt:row.raceAt};
    if(row.kind==='hobie')entry.racer=hobieRace(race,index,row.raceAt??nextFleetStart(utc,race.get('countdown')),row.raceWind);
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
  return {draw(rows,time,utc,displayUtc){
    for(const [id,entry] of craft){
      const row=rows[Number(id.slice(4))-1];
      if(!row||row.started!==entry.started||row.kind!==entry.kind||row.raceId!==entry.raceId)remove(id,entry);
    }
    for(const [i,row] of rows.entries()){
      const id='npc-'+(i+1),entry=craft.get(id)??begin(row,id,i,utc),visual=entry.visual;
      let east,north,speed,heading,orbit,height,angle;
      if(entry.racer){
        if(row.raceAt!==entry.raceAt){
          entry.raceAt=row.raceAt;
          entry.racer=hobieRace(race,i,row.raceAt,row.raceWind);
        }
        const sample=entry.racer.sample(utc,displayUtc);
        ({east,north,speed,heading}=sample);
        const {status}=sample;
        entry.raceStatus=status;orbit=12;
        if(status.stage===5&&status.heatStart!==entry.finishedHeat){
          entry.finishedHeat=status.heatStart;
          onFinish(i+1,row,status);
        }
      }else{
        const {center,radius,speed:patrolSpeed,orbit:patrolOrbit,height:patrolHeight}=routes[row.kind];
        const [a,b]=radius,clock=Math.max(0,time-row.started);
        angle=i*2.399963+clock*patrolSpeed/(.5*(a+b));
        east=center[0]+a*Math.cos(angle);north=center[1]+b*Math.sin(angle);
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
      visual.group.position.set(east,north,z);
      visual.group.rotation.set(roll,pitch,heading,'ZYX');
      visual.animate?.(time,speed,heading);
      visual.group.userData.orbitDistance=orbit;
    }
  },subject:id=>craft.get(id)?.visual?.group,raceStatus:id=>craft.get(id)?.raceStatus};
}
