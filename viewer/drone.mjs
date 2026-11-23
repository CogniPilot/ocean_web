import {pilotSticks} from './keyboard-sticks.mjs';
import {droneInertia} from './inertia-view.mjs';
import {GLTFLoader} from './vendor/gltf-loader.mjs';
import {loadInstance} from './fmi3/instance.mjs';
function loadAirframe(){
  return new GLTFLoader().loadAsync(new URL('./assets/drone.glb',import.meta.url).href);
}
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
export async function surveyDrone(T,scene,world){
  const [flight,{scene:model}]=await Promise.all([
    world?.flight??loadInstance('Rdd2Survey',{pilot:1,stationEast:-5,stationNorth:0,currentENU:[.2,.04,0]}),
    loadAirframe()
  ]);
  const hubs=flight.get('aircraft.rotorGeometry.positionBodyFlu_m');
  const {group,props}=assembleAirframe(T,model,hubs);
  scene.add(group);
  const hasNavigation=flight.has('estimatedPosition'),hasRotorSpeeds=flight.has('rotorSpeed');
  const hasRotorWake=world?.hasRotorWake??flight.has('rotorWakeTraffic');
  const rotorFields=['aircraft.thrustCoefficient_N_s2','aircraft.hoverRotorSpeed_rad_s','aircraft.omegaMax','propellerRadius'];
  const wakeGeometry=rotorFields.every(name=>flight.has(name))?{hubs,parameters:flight.getMany(rotorFields)}:null;
  const bladeCount=flight.has('aircraft.bladeCount')?flight.get('aircraft.bladeCount'):2;
  const instrumentsFields=['attitude',...(hasNavigation?['estimatedPosition','estimatedVelocity']:['gps','gpsVelocity'])];
  const compassFields=[...instrumentsFields,'estimatedWindENU','windEstimateValid'];
  const covarianceFields=['positionCovariance','velocityCovariance','windCovariance'];
  let active=false,manual=true;
  function input(axis,fast=false){
    const stick=pilotSticks(axis),gain=fast?2:1;
    flight.set('forward',active&&manual?gain*stick.pitch:0);
    flight.set('left',active&&manual?-gain*stick.roll:0);
    flight.set('climb',active&&manual?stick.throttle:0);
    flight.set('turn',active&&manual?stick.yaw:0);
  }
  function instruments(compass=false){
    const [[roll,pitch,yaw],position,velocity,wind,windValid]=flight.getMany(compass&&hasNavigation?compassFields:instrumentsFields);
    return {roll,pitch,yaw,position,speed:Math.hypot(velocity[0],velocity[1]),level:position[2],
      vertical:velocity[2],wind:windValid>.5?wind:null};
  }
  function covariance(){
    if(!hasNavigation)return null;
    const [position,velocity,wind]=flight.getMany(covarianceFields);
    const sigma=v=>Math.sqrt(Math.max(0,v));
    return {position:position.map(sigma),velocity:velocity.map(sigma),wind:sigma(wind)};
  }
  return {group,instruments,hasNavigation,covariance,bladeCount,hasRotorWake,wakeGeometry,
    wakeSources(rows){if(hasRotorWake)flight.set('rotorWakeTraffic',rows);},
    wakeLoad(){return flight.has('rotorWakeWrench')?flight.getMany(['rotorWakeWind','rotorWakeWrench']):null;},
    inertia(){return droneInertia(name=>flight.has(name)?flight.get(name):undefined);},
    get throttle(){return flight.get('throttle');},get rotorAngles(){return flight.get('rotorAngle');},
    get rotorSpeeds(){return hasRotorSpeeds?flight.get('rotorSpeed'):null;},
    get estimatedPosition(){return flight.get(instrumentsFields[1]);},
    set flightMode(value){flight.set('flightMode',value);},get active(){return active;},get position(){return flight.get('position');},
    get drag(){return flight.get('dragBody');},
    get manual(){return manual;},set manual(value){manual=value;flight.set('pilot',Number(value));input(()=>0);},
    select(value){active=value;input(()=>0);},
    cut(value){flight.set('motorCut',Number(value));},
    station(east,north){flight.set('stationEast',east);flight.set('stationNorth',north);},
    sailDeck(state,cat){flight.set('sailDeckState',state);flight.set('sailDeckEnabled',1);flight.set('isCatamaran',Number(cat));},
    get sailReaction(){return flight.get('sailWrench').slice(6);},
    deck(state){flight.set('deckState',state);flight.set('deckEnabled',1);},
    get deckReaction(){return flight.get('deckWrench').slice(6);},
    wind(velocity){flight.set('windENU',velocity);},
    input,step(dt){flight.advance(dt);},
    draw(){group.position.fromArray(flight.get('position'));
      const [w,x,y,z]=flight.get('quaternion');group.quaternion.set(x,y,z,w);
      const angle=flight.get('rotorAngle');props.forEach((p,i)=>p.rotation.z=angle[i]);}
  };
}
