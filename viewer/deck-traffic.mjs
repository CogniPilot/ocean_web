function angleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}

export function interpolateDeckPose(previous,next,fraction){
  return previous.map((value,i)=>value+fraction*(i<3?next[i]-value:angleDelta(next[i],value)));
}

// Pose is ENU position, yaw, roll and bow-up pitch. Compute ENU angular
// velocity from the change in the actual ZYX orientation, including heave.
export function deckTwist(pose,previous,next,dt,known){
  let ve=0,vn=0,vu=0,rollRate=0,pitchRate=0,yawRate=0;
  if(previous&&next&&dt>.005&&dt<.65){
    ve=(next[0]-previous[0])/dt;vn=(next[1]-previous[1])/dt;vu=(next[2]-previous[2])/dt;
    rollRate=angleDelta(next[4],previous[4])/dt;
    pitchRate=-angleDelta(next[5],previous[5])/dt;
    yawRate=angleDelta(next[3],previous[3])/dt;
    if(Math.hypot(ve,vn,vu)>35)ve=vn=vu=0;
    if(Math.hypot(rollRate,pitchRate,yawRate)>15)rollRate=pitchRate=yawRate=0;
  }
  if(known)[ve,vn,yawRate]=known;
  const yaw=pose[3],pitch=-pose[5],cy=Math.cos(yaw),sy=Math.sin(yaw);
  const rollInPlane=Math.cos(pitch)*rollRate;
  return [ve,vn,vu,cy*rollInPlane-sy*pitchRate,sy*rollInPlane+cy*pitchRate,yawRate-Math.sin(pitch)*rollRate];
}
