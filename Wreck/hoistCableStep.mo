within Wreck;
function hoistCableStep "Advance a unilateral winch line, lifting head and optionally suspended Piccard in ENU"
  input Real previous[14] "Hook position and velocity, reactions at tip and cradle, line tension, seated flag";
  input Real dt, tip[3], tipVelocity[3], paid, payoutRate;
  input Real cradleEye[3], cradleVelocity[3], frame[3,3] "Deck eye position, velocity, and body-to-world rotation";
  input Real waterline, waterVelocity[3], level;
  input Boolean occupied, initialize;
  output Real next[14];
protected
  constant Real hookMass=1, hookVolume=.000127, lineDiameter=.005, lineMassPerLength=.022;
  constant Real lineArea=Modelica.Constants.pi*lineDiameter^2/4, stiffness=12000;
  Real eye[3],velocity[3],bodyPosition[3],up[3],offset[3],unit[3],point[3],trial[3],r[3];
  Real rel[3],crossFlow[3],cableLoad[3],force[3],contact[3],guide[3],tipReaction[3];
  Real mass,waterMass,wet,wetLine,depthA,depthB,length,rate,tension,damping;
  Real gap,support,engage,bodyDrag[3],hookWet,fluidMass,horizontal[3],relative[3];
  Boolean overCradle,seated;
algorithm
  up:=frame[:,3];
  if initialize then
    eye:=if level>=1 then cradleEye else tip-{0,0,paid};
    velocity:=if level>=1 then cradleVelocity else tipVelocity;
  else
    eye:=previous[1:3];velocity:=previous[4:6];
  end if;
  next:=previous;
  if initialize then next:=cat(1,eye,velocity,zeros(7),{if level>=1 then 1 else 0});end if;
  if dt<=1e-7 then return;end if;

  bodyPosition:=eye-PortLift.bridleHeight*up;
  wet:=max(0,min(1,(waterline-bodyPosition[3]+piccardWaterlineHalfHeight)/(2*piccardWaterlineHalfHeight)));
  hookWet:=max(0,min(1,(waterline-eye[3]+.035)/.07));
  mass:=hookMass+(if occupied then piccardDryMass+2*rho*piccardInitialTankVolume else 0);
  waterMass:=rho*(hookVolume*hookWet+(if occupied then piccardDisplacement*wet else 0));
  fluidMass:=mass+(if occupied then 6*wet else .08*hookWet);

  offset:=eye-tip;length:=sqrt(offset*offset);
  unit:=offset/max(1e-8,length);
  depthA:=waterline-tip[3];depthB:=waterline-eye[3];
  wetLine:=if min(depthA,depthB)>=0 then 1 elseif max(depthA,depthB)<=0 then 0 else
    max(depthA,depthB)/max(1e-8,abs(depthA-depthB));
  // A single span with distributed weight and transverse water drag. Split
  // this load across its ends; the hook also feels its own weight and drag.
  rel:=.5*(velocity+tipVelocity)-waterVelocity;
  crossFlow:=rel-(rel*unit)*unit;
  cableLoad:={0,0,g*paid*(rho*lineArea*wetLine-lineMassPerLength)}
    -.5*rho*1.1*lineDiameter*paid*wetLine*sqrt(crossFlow*crossFlow)*crossFlow;
  rel:=velocity-waterVelocity;
  bodyDrag:=transpose(frame)*rel;
  force:={0,0,g*(waterMass-mass)}+.5*cableLoad-.5*rho*.004*hookWet*sqrt(rel*rel)*rel;
  if occupied then
    force:=force-wet*frame*(piccardLinearDrag*bodyDrag+piccardDrag.*bodyDrag.*abs(bodyDrag));
  end if;

  // Cradle pads act only within their footprint. Low side guides center
  // the sled as it settles. A parked load can then follow the rigid cradle.
  r:=transpose(frame)*(eye-cradleEye);
  // The empty magnetic head parks at the deck receiver when stowed.
  overCradle:=(occupied or level>.98) and level>.72 and abs(r[1])<.43 and abs(r[2])<.24;
  gap:=r[3];relative:=velocity-cradleVelocity;guide:=zeros(3);
  if overCradle and gap<.10 then
    engage:=min(1,max(0,(.10-gap)/.08));
    horizontal:=frame*{r[1],r[2],0};
    guide:=-engage*(700*horizontal+65*(relative-(relative*up)*up));
  end if;
  trial:=velocity+dt*(force+guide)/fluidMass;
  point:=eye+dt*trial;
  // Backward-Euler axial response stays stable for a light empty hook and
  // a heavy slung vehicle. A slack line exerts zero axial force.
  offset:=point-tip;length:=sqrt(offset*offset);unit:=offset/max(1e-8,length);
  rate:=(trial-tipVelocity)*unit-payoutRate;
  damping:=1.4*sqrt(stiffness*fluidMass);
  tension:=if length>paid then max(0,(stiffness*(length-paid)+damping*rate)/
    (1+dt*(damping+dt*stiffness)/fluidMass)) else 0;
  tipReaction:=tension*unit+.5*cableLoad;
  trial:=trial-dt*tension*unit/fluidMass;
  point:=eye+dt*trial;
  support:=if overCradle and (point-cradleEye)*up<0 then max(0,
    (-18000*((point-cradleEye)*up)-180*((trial-cradleVelocity)*up))/(1+dt*(180+dt*18000)/fluidMass)) else 0;
  contact:=guide+support*up;
  trial:=trial+dt*support*up/fluidMass;
  point:=eye+dt*trial;
  offset:=tip-cradleEye;
  seated:=overCradle and level>.9 and sqrt(offset*offset)<paid and
    (previous[14]>.5 or (r[1]^2+r[2]^2<.08^2 and abs(gap)<.025 and relative*relative<.4^2));
  if seated then
    tension:=0;tipReaction:=.5*cableLoad;
    contact:=fluidMass*(cradleVelocity-velocity)/dt-force;
    point:=cradleEye;trial:=cradleVelocity;
  end if;
  next:=cat(1,point,trial,tipReaction,-contact,{tension,if seated then 1 else 0});
end hoistCableStep;
