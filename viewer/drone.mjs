import {GLTFLoader} from './vendor/gltf-loader.mjs';
import {loadInstance} from './fmi3/instance.mjs';
export async function surveyDrone(T,scene){
  const [flight,{scene:model}]=await Promise.all([
    loadInstance('Rdd2Survey',{stationEast:-5,stationNorth:0,currentENU:[.2,.04,0]}),
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
  let active=false;
  function input(keys){
    const axis=(a,b)=>Number(keys.has(a))-Number(keys.has(b));
    for(const [key,a,b] of [['forward','KeyW','KeyS'],['left','KeyA','KeyD'],['climb','KeyR','KeyF'],['turn','KeyQ','KeyE']])
      flight.set(key,active?axis(a,b):0);
  }
  return {get active(){return active;},get position(){return flight.get('position');},
    get drag(){return flight.get('dragBody');},
    select(value){active=value;flight.set('pilot',Number(value));input(new Set());},
    cut(value){flight.set('motorCut',Number(value));},
    wind(velocity){flight.set('windENU',velocity);},
    input,step(dt){flight.advance(dt);},
    draw(){group.position.fromArray(flight.get('position'));
      const [w,x,y,z]=flight.get('quaternion');group.quaternion.set(x,y,z,w);
      const angle=flight.get('rotorAngle');props.forEach((p,i)=>p.rotation.z=angle[i]);}
  };
}
