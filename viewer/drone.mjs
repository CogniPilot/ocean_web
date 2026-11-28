import {pilotSticks} from './keyboard-sticks.mjs';
import {droneInertia} from './inertia-view.mjs';
import {GLTFLoader} from './vendor/gltf-loader.mjs';
import {loadInstance} from './fmi3/instance.mjs';
function loadAirframe(){
  return new GLTFLoader().loadAsync(new URL('./assets/drone.glb',import.meta.url).href);
}
import {createPlayablePolicy} from './live-policy-actor.mjs';
import {getAppliedPolicy} from './live-training-tasks.mjs';
import {droneTask} from './vehicle-training-tasks.mjs';

function assembleAirframe(T,model,mounts){
  const group=new T.Group(),props=[];
  model.rotation.x=Math.PI/2; // glTF +Y up to the vehicle's forward-left-up frame.
  group.add(model);group.updateMatrixWorld(true);
  const blades=['Object_32','Object_34','Object_36','Object_38'].map(name=>{
    const mesh=model.getObjectByName(name);
    if(!mesh)throw Error('Missing propeller in drone.glb: '+name);
    return {mesh,hub:new T.Box3().setFromObject(mesh,true).getCenter(new T.Vector3())};
  });
  const center=new T.Vector3();
  for(const blade of blades)center.addScaledVector(blade.hub,.25);
  // Match the mean hub radius to the compiled RDD2 rotor geometry.
  const span=blades.reduce((sum,{hub})=>sum+Math.hypot(hub.x-center.x,hub.y-center.y),0);
  const scale=mounts.reduce((sum,_,i)=>i%3===0?sum+Math.hypot(mounts[i],mounts[i+1]):sum,0)/span;
  model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);group.updateMatrixWorld(true);
  for(let i=0;i<4;i++){
    const k=blades.findIndex(({hub})=>Math.sign(hub.x-center.x)===Math.sign(mounts[3*i])&&Math.sign(hub.y-center.y)===Math.sign(mounts[3*i+1]));
    if(k<0)throw Error('Drone propeller positions disagree with the RDD2 motor layout');
    const [{hub,mesh}]=blades.splice(k,1);
    const pivot=new T.Group();pivot.name='RDD2 rotor '+i;pivot.userData.physicsJoint={axis:[0,0,1],label:'Rotor '+(i+1)};pivot.position.copy(hub).sub(center).multiplyScalar(scale);
    group.add(pivot);pivot.attach(mesh);props.push(pivot);
  }
  return {group,props};
}
// RDD2 X frame with a 250 mm motor radius. Peer packets carry its rigid pose.
export async function remoteDroneMesh(T){
  const d=.25/Math.sqrt(2);
  const {scene:model}=await loadAirframe();
  return assembleAirframe(T,model,[d,-d,0,-d,-d,0,-d,d,0,d,d,0]).group;
}

function nightLights(T,group){
  const lens=new T.SphereGeometry(.010,8,6),size=32;
  const pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const offset=4*(y*size+x),radius=Math.hypot(x+.5-size/2,y+.5-size/2)/(size/2);
    pixels.set([255,255,255,Math.round(255*Math.max(0,1-radius)**3)],offset);
  }
  const glow=new T.DataTexture(pixels,size,size);
  glow.minFilter=glow.magFilter=T.LinearFilter;glow.needsUpdate=true;
  function light(name,position,color,radius){
    const mesh=new T.Mesh(lens,new T.MeshBasicMaterial({color,toneMapped:false}));
    mesh.name=name;mesh.position.set(...position);group.add(mesh);
    const halo=new T.Sprite(new T.SpriteMaterial({color,map:glow,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));
    halo.scale.setScalar(radius);mesh.add(halo);
    return mesh;
  }
  const position=[light('Port position light',[.10,.211,-.058],0xff2420,.095),
    light('Starboard position light',[.10,-.211,-.058],0x23ff5b,.095),
    light('Aft position light',[-.14,0,-.035],0xf3f6ff,.095)];
  const strobe=[light('Upper anti-collision strobe',[.018,0,.067],0xffffff,.28),
    light('Lower anti-collision strobe',[.04,0,-.096],0xffffff,.28)];
  return (night,armed,seconds)=>{
    for(const lamp of position)lamp.visible=night;
    const phase=seconds%1.20;
    const flash=night&&armed&&(phase<.08||(phase>=.19&&phase<.27));
    for(const lamp of strobe)lamp.visible=flash;
  };
}
export async function surveyDrone(T,scene,world){
  const [flight,{scene:model}]=await Promise.all([
    world?.flight??loadInstance('Rdd2Survey',{pilot:1,stationEast:-5,stationNorth:0,currentENU:[.2,.04,0]}),
    loadAirframe()
  ]);
  const hubs=flight.get('aircraft.rotorGeometry.positionBodyFlu_m');
  const {group,props}=assembleAirframe(T,model,hubs);
  const updateLights=nightLights(T,group);
  updateLights(false,false,0);
  scene.add(group);
  const hasNavigation=flight.has('estimatedPosition'),hasRotorSpeeds=flight.has('rotorSpeed');
  const hasRotorWake=world?.hasRotorWake??flight.has('rotorWakeTraffic');
  const hasDroneContact=world?.hasDroneContact??flight.has('droneTraffic');
  const hasVesselDecks=world?.hasVesselDecks??flight.has('vesselDecks');
  const hasAutoland=flight.has('landingState');
  const rotorFields=['aircraft.thrustCoefficient_N_s2','aircraft.hoverRotorSpeed_rad_s','aircraft.omegaMax','propellerRadius'];
  const wakeGeometry=rotorFields.every(name=>flight.has(name))?{hubs,parameters:flight.getMany(rotorFields)}:null;
  const bladeCount=flight.has('aircraft.bladeCount')?flight.get('aircraft.bladeCount'):2;
  const instrumentsFields=['attitude',...(hasNavigation?['estimatedPosition','estimatedVelocity']:['gps','gpsVelocity'])];
  const compassFields=[...instrumentsFields,'estimatedWindENU','windEstimateValid'];
  const covarianceFields=['positionCovariance','velocityCovariance','windCovariance'];
  let active=false,manual=true,flightMode=0,landing=false,disarmed=false,learned=false,takeoffTarget=null;
  const flyPolicy=createPlayablePolicy(droneTask);
  function input(axis,fast=false){
    if(takeoffTarget!==null)return;
    const stick=pilotSticks(axis),gain=fast?2:1;
    const forward=active&&manual?gain*stick.pitch:0,left=active&&manual?-gain*stick.roll:0,climb=active&&manual?stick.throttle:0;
    const policy=active&&manual&&!landing&&flightMode===0&&hasNavigation?getAppliedPolicy('drone'):null;
    learned=flyPolicy(flight,{forward:2*forward,left:2*left,up:climb},policy);
    if(!learned){
      flight.set('forward',forward);flight.set('left',left);flight.set('climb',climb);
    }
    flight.set('turn',active&&manual?stick.yaw:0);
  }
  function instruments(compass=false){
    const [[roll,pitch,yaw],position,velocity,wind,windValid]=flight.getMany(compass&&hasNavigation?compassFields:instrumentsFields);
    return {roll,pitch,yaw,position,velocity,speed:Math.hypot(velocity[0],velocity[1]),level:position[2],
      vertical:velocity[2],wind:windValid>.5?wind:null};
  }
  function covariance(){
    if(!hasNavigation)return null;
    const [position,velocity,wind]=flight.getMany(covarianceFields);
    const sigma=v=>Math.sqrt(Math.max(0,v));
    return {position:position.map(sigma),velocity:velocity.map(sigma),wind:sigma(wind)};
  }
  function drawLoads(display){
    if(hasRotorSpeeds&&flight.has('aircraft.thrustCoefficient_N_s2')){
      const [speeds,k]=flight.getMany(['rotorSpeed','aircraft.thrustCoefficient_N_s2']);
      props.forEach((hub,i)=>display.load(hub,'Rotor '+(i+1)+' · thrust',false,null,[0,0,k*speeds[i]**2]));
    }
    if(flight.has('dragBody'))display.load(group,'Airframe · aerodynamic drag',false,null,flight.get('dragBody'));
    if(flight.has('rotorWakeWrench')){
      const w=flight.get('rotorWakeWrench');
      display.load(group,'Airframe · wake force',false,null,w.slice(0,3),true);
      display.load(group,'Airframe · wake moment',true,null,w.slice(3),true);
    }
  }
  return {group,instruments,drawLoads,hasNavigation,covariance,bladeCount,hasRotorWake,hasDroneContact,hasVesselDecks,wakeGeometry,
    hasAutoland,get landing(){return landing;},get disarmed(){return disarmed;},get learned(){return learned;},
    get takingOff(){return takeoffTarget!==null;},
    get onCarrier(){return flight.has('onCarrier')&&flight.get('onCarrier')>.5;},
    get landingState(){return hasAutoland?flight.get('landingState'):0;},
    autoland(value){if(hasAutoland){landing=value;flight.set('autoLand',Number(value));}},
    landingRange(value){if(flight.has('landingRange'))flight.set('landingRange',value?[1,value.height]:[0,0]);},
    takeoff(value){
      takeoffTarget=value?flight.get('position')[2]+2.5:null;
      if(value){learned=false;flight.set('turn',0);flight.set('left',0);flight.set('forward',0);}
    },
    climbToTakeoffHeight(){
      const remaining=takeoffTarget-flight.get('position')[2];
      if(!this.onCarrier&&remaining<.07)return false;
      flight.set('climb',this.onCarrier?.95:Math.max(.18,Math.min(.95,.75*remaining)));
      return true;
    },
    landingCue(value){if(hasAutoland)flight.set('landingCue',value);},
    contactGeometry(){
      const names=['droneContactParts','droneContactFaces'];
      return names.every(name=>flight.has(name))?flight.getMany(names):null;
    },
    wakeSources(rows){if(hasRotorWake)flight.set('rotorWakeTraffic',rows);},
    contactTraffic(rows){if(hasDroneContact)flight.set('droneTraffic',rows);},
    wakeLoad(){return flight.has('rotorWakeWrench')?flight.getMany(['rotorWakeWind','rotorWakeWrench']):null;},
    wakeSource(){
      if(!hasRotorSpeeds)return null;
      const [position,orientation,speeds]=flight.getMany(['position','quaternion','rotorSpeed']);
      return [1,...position,...orientation,...speeds];
    },
    inertia(){return droneInertia(name=>flight.has(name)?flight.get(name):undefined);},
    get throttle(){return flight.get('throttle');},get rotorAngles(){return flight.get('rotorAngle');},
    get rotorSpeeds(){return hasRotorSpeeds?flight.get('rotorSpeed'):null;},
    get estimatedPosition(){return flight.get(instrumentsFields[1]);},
    set flightMode(value){flightMode=value;flight.set('flightMode',value);},get active(){return active;},get position(){return flight.get('position');},
    get drag(){return flight.get('dragBody');},
    get manual(){return manual;},set manual(value){manual=value;flight.set('pilot',Number(value));input(()=>0);},
    raceNavigation(value){if(!world&&flight.has('raceNavigation'))flight.set('raceNavigation',Number(value));},
    select(value){active=value;if(!value)takeoffTarget=null;input(()=>0);},
    cut(value){disarmed=value;flight.set('motorCut',Number(value));},
    station(east,north){flight.set('stationEast',east);flight.set('stationNorth',north);},
    sailDeck(state,cat){flight.set('sailDeckState',state);flight.set('sailDeckEnabled',1);flight.set('isCatamaran',Number(cat));},
    surfaceDecks(rows){if(hasVesselDecks)flight.set('vesselDecks',rows);},
    vesselLandingLoad(slot){return hasVesselDecks?flight.get('vesselDeckWrenches').slice(12*slot+6,12*slot+12):null;},
    get sailReaction(){return flight.get('sailWrench').slice(6);},
    deck(state){flight.set('deckState',state);flight.set('deckEnabled',1);},
    get deckReaction(){return flight.get('deckWrench').slice(6);},
    wind(velocity){flight.set('windENU',velocity);},
    input,step(dt){flight.advance(dt);},
    draw(night=false,seconds=0){group.position.fromArray(flight.get('position'));
      const [w,x,y,z]=flight.get('quaternion');group.quaternion.set(x,y,z,w);
      const angle=flight.get('rotorAngle');props.forEach((p,i)=>p.rotation.z=angle[i]);
      updateLights(night,!disarmed,seconds);}
  };
}
