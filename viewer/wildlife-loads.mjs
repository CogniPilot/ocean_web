// Keep diagnostics out of the restart state. Read only the requested animal.
const fields={
  diver:{siteLoads:182,linkWeights:60,jointTorque:10,lateralTorque:4,limbForces:12,positionBody:12,groundForce:6,stopMoment:10,selfContactTorque:10,contactForce:1,contact:4,contactMomentArm:3,contactLink:1},
  manta:{wingForce:6,site:6,hingeTorque:2,foreMoment:2},
  gull:{shaftTorque:6,tailMuscles:2,tailUp:1,wingExposed:1},
  shark:{'whiteShark.peduncleTorque':1,'whiteShark.tailX':1,'whiteShark.tailY':1},
  whale:{'swimmer.torque':1,'swimmer.tailThrust':1}
};
export function sampleLoads(model,kind){
  const keys=Object.keys(fields[kind]??{}).filter(k=>model.has(k));
  return Object.fromEntries(model.getMany(keys).map((v,i)=>[keys[i],v]));
}
export function validLoads(data,kind){
  if(!data||typeof data!=='object'||!fields[kind])return false;
  return Object.entries(data).every(([k,v])=>{
    const n=fields[kind][k];
    return n===1?Number.isFinite(v):n>1&&Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  });
}
