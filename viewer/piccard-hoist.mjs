// The carrier's magnet mates with the top of the steel frame plate in Piccard FLU metres.
export const hookAbovePiccard=.15;

// Register an owner measurement with the carrier currently shown on screen.
// Pose and carrier use separate network channels and may be at different times.
export function measuredPoseInCarrier(T,carrier,lift,motion){
  const pose=lift?.pose,source=lift?.poseCarrier;
  if(!pose||pose.length!==15||!source)return;
  const sampled=Array.isArray(source)?source:[source.x,source.y,source.z,source.yaw,source.heel,source.pitch,
    source.ve,source.vn,source.vu,source.we,source.wn,source.wu];
  const [x,y,z,yaw,heel,pitch]=sampled;
  const atMeasurement=new T.Quaternion().setFromEuler(new T.Euler(heel,pitch,yaw,'ZYX'));
  const rotation=carrier.quaternion.clone().multiply(atMeasurement.invert());
  const position=new T.Vector3().fromArray(pose).sub(new T.Vector3(x,y,z))
    .applyQuaternion(rotation).add(carrier.position);
  const vector=new T.Vector3(),result=position.toArray();
  // Preserve the owner's actual swing and hook velocities as well as its
  // angular velocity. Do not estimate a release velocity from rendered frames.
  for(let i=3;i<15;i+=3)vector.fromArray(pose,i).applyQuaternion(rotation).toArray(result,i);
  if(motion&&[motion.ve,motion.vn,motion.vu,motion.we,motion.wn,motion.wu,...sampled.slice(6,12)].every(Number.isFinite)){
    // Inherit the rendered carrier's twist about its own origin, then add
    // the observed rotation and swing of the suspended load relative to it.
    const arm=new T.Vector3().fromArray(pose).sub(new T.Vector3(x,y,z));
    const atSample=new T.Vector3().fromArray(sampled,9);
    const nowSpin=new T.Vector3(motion.we,motion.wn,motion.wu);
    const deltaSpin=nowSpin.clone().sub(atSample.applyQuaternion(rotation));
    const deltaLinear=new T.Vector3(motion.ve,motion.vn,motion.vu)
      .sub(vector.fromArray(sampled,6).applyQuaternion(rotation))
      .add(new T.Vector3().crossVectors(deltaSpin,arm.applyQuaternion(rotation)));
    vector.fromArray(result,3).add(deltaLinear).toArray(result,3);
    vector.fromArray(result,12).add(deltaSpin).toArray(result,12);
  }
  return result;
}

export function applyRiderPose(T,mesh,pose){
  const forward=new T.Vector3().fromArray(pose,6),up=new T.Vector3().fromArray(pose,9);
  const port=new T.Vector3().crossVectors(up,forward);
  mesh.position.fromArray(pose);
  mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(forward,port,up)).normalize();
}
