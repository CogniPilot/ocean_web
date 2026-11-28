import {sharkForebodyOffset} from './npc-room.mjs';

// Production rigs driven by the extra FMU outputs published with each rollout.
export const previewSize={
  shark:{length:4.8,underwater:true},whale:{length:10,underwater:true},manta:{length:4,underwater:true},
  gull:{length:1.5},submarine:{length:.6,underwater:true},drone:{length:.65},
  motorboat:{length:8,center:.8,pitch:1},onrt:{length:3.2,center:.22},
  hobie16:{length:6,center:3.5,pitch:1},sailboat:{length:3.2,center:1.6,pitch:1}
};
export async function loadTrainingRig(T,id){
  if(id==='shark'||id==='whale'){
    const {marineAnimal}=await import('./harbor-traffic.mjs');
    const {group,articulate,mouth}=await marineAnimal(T,id,previewSize[id].length);
    mouth(0);
    const packet=new Float64Array(id==='shark'?sharkForebodyOffset+2:18);
    return {group,pose:r=>{
      if(id==='shark'){
        [packet[202],packet[70],packet[72],packet[319],packet[320]]=r;
        packet[sharkForebodyOffset]=r[5]??0;
        articulate(packet);
      }else{
        [packet[7],packet[15],packet[16],packet[17]]=r;articulate(packet,0);
      }
    }};
  }
  if(id==='manta'){
    const {loadMantaModel}=await import('./manta-model.mjs'),skin=await loadMantaModel(T);
    return {group:skin.mesh,pose:r=>skin.setWing(r[0],0,r[1]),dispose:skin.dispose};
  }
  if(id==='gull'){
    const {birdMesh}=await import('./gull.mjs'),bird=birdMesh(T);
    const packet=new Float64Array(98);
    return {group:bird.group,pose(r,time,position){
      // Same packet layout the harbor host supplies to the production articulated rig.
      packet[2]=position[2];packet.set(r.slice(0,27),4);packet.set(r.slice(27,31),87);
      packet.set(r.slice(31),92);bird.draw(packet,time);
      bird.group.position.set(0,0,0);bird.group.quaternion.identity();
    }};
  }
  if(id==='submarine'){
    const {loadVehicleShell,vehicleShell}=await import('./vehicle-assets.mjs');
    await loadVehicleShell('survey-pressure-housing');
    const group=globalThis.surveyVehicle(T,vehicleShell('survey-pressure-housing'));
    return {group,pose:r=>group.userData.rotors.forEach(({rotor,handed},i)=>{rotor.rotation.z=handed*r[i];})};
  }
  if(id==='drone'){
    const {remoteDroneMesh}=await import('./drone.mjs'),group=await remoteDroneMesh(T);
    const rotors=Array.from({length:4},(_,i)=>group.getObjectByName('RDD2 rotor '+i));
    return {group,pose:r=>rotors.forEach((rotor,i)=>{rotor.rotation.z=r[i];})};
  }
  if(id==='onrt'){
    const {loadBasinShip}=await import('./onrt-ship.mjs');
    const {ship,rudders,props}=await loadBasinShip(T,(_,color)=>new T.MeshStandardMaterial({color,roughness:.56}));
    ship.rotation.x=Math.PI/2;
    return {group:ship,pose:([rudder,phase])=>{
      for(const joint of rudders)joint.rotation.y=-rudder;
      for(const [i,prop] of props.entries())prop.rotation.x=i?-phase:phase;
    }};
  }
  if(id==='motorboat'){
    const {cabinCruiser}=await import('./motorboat.mjs'),boat=cabinCruiser(T);
    boat.setElectricalPower(false);
    const helm=boat.group.getObjectByName('Steering rudder');
    const screw=boat.group.getObjectByName('Bronze propeller');
    return {group:boat.group,pose:([rudder,phase])=>{helm.rotation.z=rudder;screw.rotation.x=phase;},dispose:boat.dispose};
  }
  throw Error('Missing training rig for '+id);
}

// Share geometry and materials across lanes. A skinned mesh receives its own
// bone palette so adjacent rollouts can be at different points in their stroke.
export function fleetRigBatches(T,scene,rig){
  const source=rig.group,parts=[],matrix=new T.Matrix4(),base=new T.Matrix4(),detail=new T.Matrix4(),color=new T.Color();
  source.updateMatrixWorld(true);
  source.traverse(o=>{if(o.isMesh)parts.push({source:o,instances:[]});});
  let capacity=0;
  function clear(){
    for(const part of parts){
      for(const mesh of part.instances){mesh.removeFromParent();if(mesh.isSkinnedMesh)mesh.skeleton.dispose();else if(mesh.isInstancedMesh)mesh.dispose();}
      part.instances=[];
    }
  }
  function reserve(n){
    if(n<=capacity)return;
    clear();capacity=2**Math.ceil(Math.log2(n));
    for(const part of parts){
      const s=part.source;
      if(s.isSkinnedMesh||s.morphTargetInfluences){
        for(let i=0;i<capacity;i++){
          const mesh=s.isSkinnedMesh?new T.SkinnedMesh(s.geometry,s.material):new T.Mesh(s.geometry,s.material);
          if(s.isSkinnedMesh)mesh.bind(new T.Skeleton(s.skeleton.bones.map(()=>new T.Bone()),s.skeleton.boneInverses),s.bindMatrix);
          mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.visible=false;
          part.instances.push(mesh);scene.add(mesh);
        }
      }else{
        const m=new T.InstancedMesh(s.geometry,s.material,capacity*(s.isInstancedMesh?s.count:1));
        m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.frustumCulled=false;
        part.instances.push(m);scene.add(m);
      }
    }
  }
  function pose(slot,root,row,time){
    if(rig.pose){rig.pose(row.slice(6),time,row);source.updateMatrixWorld(true);}
    for(const part of parts){
      const s=part.source;
      let visible=true;
      for(let p=s;p;p=p.parent)if(!p.visible){visible=false;break;}
      base.multiplyMatrices(root,s.matrixWorld);
      if(s.isSkinnedMesh||s.morphTargetInfluences){
        const m=part.instances[slot];m.visible=visible;if(!visible)continue;
        m.matrix.copy(base);m.matrixWorldNeedsUpdate=true;
        m.skeleton?.bones.forEach((b,j)=>b.matrixWorld.multiplyMatrices(root,s.skeleton.bones[j].matrixWorld));
        if(m.morphTargetInfluences)m.morphTargetInfluences.splice(0,m.morphTargetInfluences.length,...s.morphTargetInfluences);
      }else{
        const m=part.instances[0],count=s.isInstancedMesh?s.count:1;
        if(!visible)base.makeScale(0,0,0);
        for(let j=0;j<count;j++){
          matrix.copy(base);if(s.isInstancedMesh){s.getMatrixAt(j,detail);matrix.multiply(detail);}
          m.setMatrixAt(slot*count+j,matrix);
          if(s.instanceColor){
            s.getColorAt(j,color);m.setColorAt(slot*count+j,color);
          }
        }
      }
    }
  }
  function finish(n){
    for(const {source:s,instances:meshes} of parts){
      if(s.isSkinnedMesh||s.morphTargetInfluences){for(let i=n;i<meshes.length;i++)meshes[i].visible=false;}
      else if(meshes.length){
        const mesh=meshes[0];mesh.count=n*(s.isInstancedMesh?s.count:1);mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      }
    }
  }
  return {reserve,pose,finish,dispose(){
    clear();
    if(rig.dispose){rig.dispose();return;}
    const geometries=new Set(),materials=new Set();
    source.traverse(o=>{
      if(o.geometry&&!o.userData.sharedVehicleAsset)geometries.add(o.geometry);
      if(o.material&&!o.userData.sharedVehicleAsset)for(const m of [].concat(o.material))materials.add(m);
      if(o.isSkinnedMesh)o.skeleton.dispose();
    });
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  }};
}
