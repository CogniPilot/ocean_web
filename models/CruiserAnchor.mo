model CruiserAnchor "Rigid anchor and tension-only windlass rode"
  inner MultiBodyLie.World world(n={0,0,-1});
  parameter Real stowed[3]={0,0,1};
  parameter Real mass=11,flukeDepth=.12;
  MultiBodyLie.Parts.Body body(m=mass,I_11=.11,I_22=.16,I_33=.11,
    angles_fixed=true,w_0_fixed=true,r_0(start=stowed,each fixed=true,each stateSelect=StateSelect.always),
    v_0(each fixed=true,each stateSelect=StateSelect.always),Q(each stateSelect=StateSelect.always),
    w_a(each stateSelect=StateSelect.always));
  MultiBodyLie.Forces.WorldForceAndTorque loads;
  input Real lower,sea,mount[3],mountVelocity[3],current[2];
  output Real position[3],orientation[4],reaction[3],tension,paid(start=.08,fixed=true),grounded;
protected
  Real lead[3],distance,direction[3],rate,rodeTarget,depth,bed,normal,drag[3],horizontal[2],
    friction[2],submerged,wetVelocity[3],stowForce[3],linkForce[3];
equation
  connect(body.frame_a,loads.frame_b);
  position=body.r_0;
  orientation=body.Q;
  depth=max(.1,mount[3]-Shore.seabed(mount[1],mount[2]));
  rodeTarget=if lower>.5 then min(62,max(4,2.7*depth)) else .08;
  der(paid)=max(-1.65,min(3.35,2*(rodeTarget-paid)));
  lead=mount-position;
  distance=sqrt(lead*lead);
  direction=lead/max(.001,distance);
  rate=(mountVelocity-body.v_0)*direction;
  tension=if noEvent(distance>paid) then max(0,4200*(distance-paid)+115*rate) else 0;
  // Guide the shank into its roller once the rode reaches the retrieval stop.
  stowForce=if noEvent(paid<.22 and lower<.5) then 3800*lead+230*(mountVelocity-body.v_0)
    else zeros(3);
  linkForce=tension*direction+stowForce;
  reaction=-linkForce;
  bed=Shore.seabed(position[1],position[2]);
  grounded=if noEvent(position[3]<bed+flukeDepth+.012) then 1 else 0;
  normal=if grounded>.5 then max(0,9000*(bed+flukeDepth-position[3])-270*body.v_0[3]) else 0;
  horizontal=body.v_0[1:2];
  friction= -horizontal*min(12000,6.5*normal/max(.010,sqrt(horizontal*horizontal)));
  submerged=max(0,min(1,(sea-position[3])/.16));
  wetVelocity=body.v_0-{current[1],current[2],0};
  drag= -(1.0+13*submerged*sqrt(wetVelocity*wetVelocity))*wetVelocity;
  loads.force=linkForce+drag+{friction[1],friction[2],normal+12*submerged};
  loads.torque=transpose(body.frame_a.R.T)*(-2.8*body.w_a);
end CruiserAnchor;
