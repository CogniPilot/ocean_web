import {GLTFLoader} from './vendor/gltf-loader.mjs';
import {loadInstance} from './fmi3/instance.mjs';
export async function surveyDrone(T,scene,world){
  const [flight,{scene:model}]=await Promise.all([
    world?.flight??loadInstance('Rdd2Survey',{pilot:1,stationEast:-5,stationNorth:0,currentENU:[.2,.04,0]}),
    new GLTFLoader().loadAsync(new URL('./assets/drone.glb',import.meta.url).href)
  ]);
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
  const mounts=flight.get('aircraft.rotorGeometry.positionBodyFlu_m');
  const span=blades.reduce((sum,{hub})=>sum+Math.hypot(hub.x-center.x,hub.y-center.y),0);
  const scale=mounts.reduce((sum,_,i)=>i%3===0?sum+Math.hypot(mounts[i],mounts[i+1]):sum,0)/span;
  model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);group.updateMatrixWorld(true);
  for(let i=0;i<4;i++){
    const k=blades.findIndex(({hub})=>Math.sign(hub.x-center.x)===Math.sign(mounts[3*i])&&Math.sign(hub.y-center.y)===Math.sign(mounts[3*i+1]));
    if(k<0)throw Error('Drone propeller positions disagree with the RDD2 motor layout');
    const [{hub,mesh}]=blades.splice(k,1);
    const pivot=new T.Group();pivot.position.copy(hub).sub(center).multiplyScalar(scale);
    group.add(pivot);pivot.attach(mesh);props.push(pivot);
  }
  scene.add(group);
  let active=false,manual=true;
  function input(axis,fast=false){
    for(const [key,a,b] of [['forward','KeyW','KeyS'],['left','KeyA','KeyD'],['climb','KeyR','KeyF'],['turn','KeyQ','KeyE']])
      flight.set(key,active&&manual?axis(a,b)*(fast && (key==='forward'||key==='left')?2:1):0);
  }
  function instruments(){
    const [[roll,pitch,yaw],gps,v]=flight.getMany(['attitude','gps','gpsVelocity']);
    return {roll,pitch,yaw,speed:Math.hypot(v[0],v[1]),level:gps[2],vertical:v[2]};
  }
  return {group,instruments,get active(){return active;},get position(){return flight.get('position');},
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
