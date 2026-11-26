model GreatWhite "Lamnid swimmer with a laterally driven peduncle, compliant caudal foil and paired pectorals"
  parameter Real mass(unit="kg")=870, length(unit="m")=4.8;
  // BEGIN GLB MASS PROPERTIES
  parameter Real segments[6,10]=[
    487.682509,1.129702,-0.003761,-0.20806,51.24505,150.257081,143.173334,0.479054,-6.626959,0.043924;
    306.104074,-0.162197,0.000421,-0.181525,25.938404,52.223836,45.936746,0.123256,-1.148048,0.001282;
    25.234891,-1.354136,0.004793,-0.194516,0.430978,1.647596,1.448157,0.003893,-0.018107,0.000991;
    13.031183,-1.921057,0.007171,-0.087938,1.519668,1.67804,0.180664,0.00021,0.178008,-0.000754;
    18.854148,0.335214,0.662761,-0.501716,0.640446,0.959576,1.371326,0.441741,-0.18805,0.224181;
    19.093196,0.332451,-0.66267,-0.500583,0.651411,0.987058,1.404044,-0.450756,-0.194222,-0.228785] "Rest segment mass, COM XYZ, Ixx Iyy Izz Ixy Ixz Iyz (870 kg reference)";
  parameter Real pivots[6,3]=[
    0.152447,-0.000561,-0.443215;
    0.337291,-0.000004,-0.112998;
    -1.012836,-0.000138,-0.148401;
    -1.765922,0.002635,-0.141153;
    0.698572,0.624793,-0.430621;
    0.70118,-0.563901,-0.397133] "Bone pivots in metres in the neutral hull frame";
  // END GLB MASS PROPERTIES
  parameter Real tailArea(unit="m2")=.64, pectoralArea(unit="m2")=.32;
  parameter Real hingeArm(unit="m")=.91;
  parameter Real hingeWaterInertia(unit="kg.m2")=.035*1025*tailArea^1.5*hingeArm^2
    "Water accelerated by the caudal blade during lateral sweep";
  // A fully immersed prolate body accelerates water sideways along its length.
  parameter Real yawAddedInertia(unit="kg.m2")=1025*3.14159*.47^2*length^3/60;
  parameter Real peakTorque(unit="N.m")=6200, peakPower(unit="W")=24500;
  parameter Real sustainedPowerGain=1.55 "Relative recruited caudal shaft power in the sustained sprint";
  parameter Real breachFrequencyGain(unit="Hz")=.38 "Extra stroke rate during the simulator launch";
  parameter Real startState[10]={1.65,0,0,0,0,0,0,0,0,0};
  // Symmetric displaced-volume stations centred on the longitudinal COM.
  // Their vertical centre sits 7 cm above it, so buoyancy also rights a steeply pitched animal.
  constant Real buoyArm[7]={-1.86,-1.24,-.62,0,.62,1.24,1.86};
  constant Real sliceRadius[7]={.16,.30,.43,.47,.43,.30,.16};
  constant Real volumeShare[7]={.027,.103,.225,.290,.225,.103,.027};
  input Real boatLoad[3] "Hull reaction in forward and port axes, and yaw moment";
  parameter Real startBank[2]={0,0};
  input Real east,north,z,heading,surface,current[2],desiredSpeed,desiredPitch,desiredHeading,drive,bankCommand,sprint,burst;
  input Real breachRecruitment "Additional caudal excursion during a commanded launch";
  input Real directDrive=0,actuators[4]=zeros(4) "Direct enable; normalized peduncle torque, caudal incidence, port and starboard incidence";
  input Real swimCommand[4]=zeros(4) "Effort, turn, pitch and bank targets";
  input Real swimWeights[10]=zeros(10);
  output Real trackingReward "Cruising command tracking minus mechanical effort";
  output Real x[10](start=startState,each fixed=true)
    "Ground surge, heave, pitch, pitch rate, stroke phase, peduncle yaw, peduncle rate, caudal incidence, yaw rate, ground sway";
  output Real bank[2](start=startBank,each fixed=true) "Roll and roll rate, positive starboard down";
  function segmentInertia
    "Parallel-axis assembly in the whole-animal COM frame, plus the coupled yaw/peduncle mass matrix"
    input Real data[6,10],pivots[6,3],massScale,lengthScale,bend,trunkRatio,recruit,feather,port,starboard;
    output Real H[5] "Roll, pitch, yaw, yaw/peduncle cross inertia and peduncle inertia, kg m2";
  protected
    Real c[6,3],tangent[6,3],origin[6,3],originRate[6,3],mean[3],meanRate[3];
    Real angles[6],gears[6],scaleMass[6],diag[6,3],R[3,3],Rparent[3,3],xyz[3],d[3],v[3],trunk,gear;
    Real tensor[3,3],I[3,3],a,cs,sn;
  algorithm
    trunk:=trunkRatio*bend+.65*recruit*(bend-tanh(3*bend)/3);
    gear:=trunkRatio+.65*recruit*tanh(3*bend)^2;
    angles:={0,trunk,bend,feather,port,starboard};
    gears:={0,gear,1,0,0,0};
    origin:=lengthScale*pivots;c:=zeros(6,3);tangent:=zeros(6,3);scaleMass:=zeros(6);diag:=zeros(6,3);
    originRate:=zeros(6,3);mean:=zeros(3);meanRate:=zeros(3);
    for i in 1:6 loop
      origin[i,:]:=lengthScale*pivots[i,:];
      if i==3 or i==4 then
        a:=angles[i-1];cs:=cos(a);sn:=sin(a);
        Rparent:=[cs,-sn,0;sn,cs,0;0,0,1];
        d:=Rparent*(lengthScale*(pivots[i,:]-pivots[i-1,:]));
        origin[i,:]:=origin[i-1,:]+d;
        originRate[i,:]:=originRate[i-1,:]+gears[i-1]*{-d[2],d[1],0};
      end if;
      cs:=cos(angles[i]);sn:=sin(angles[i]);
      R:=if i<=4 then [cs,-sn,0;sn,cs,0;0,0,1] else [cs,0,-sn;0,1,0;sn,0,cs];
      d:=R*(lengthScale*(data[i,2:4]-pivots[i,:]));
      c[i,:]:=origin[i,:]+d;
      tangent[i,:]:=originRate[i,:]+gears[i]*{-d[2],d[1],0};
      scaleMass[i]:=massScale*data[i,1];
      mean:=mean+scaleMass[i]*c[i,:];meanRate:=meanRate+scaleMass[i]*tangent[i,:];
      tensor:=[data[i,5],data[i,8],data[i,9];data[i,8],data[i,6],data[i,10];data[i,9],data[i,10],data[i,7]];
      I:=massScale*lengthScale^2*(R*tensor*transpose(R));
      diag[i,:]:={I[1,1],I[2,2],I[3,3]};
    end for;
    mean:=mean/sum(scaleMass);meanRate:=meanRate/sum(scaleMass);H:=zeros(5);
    for i in 1:6 loop
      d:=c[i,:]-mean;v:=tangent[i,:]-meanRate;
      H[1]:=H[1]+diag[i,1]+scaleMass[i]*(d[2]^2+d[3]^2);
      H[2]:=H[2]+diag[i,2]+scaleMass[i]*(d[1]^2+d[3]^2);
      H[3]:=H[3]+diag[i,3]+scaleMass[i]*(d[1]^2+d[2]^2);
      H[4]:=H[4]+gears[i]*diag[i,3]+scaleMass[i]*(d[1]*v[2]-d[2]*v[1]);
      H[5]:=H[5]+gears[i]^2*diag[i,3]+scaleMass[i]*sum(v[j]^2 for j in 1:3);
    end for;
  end segmentInertia;
  function articulatedInertia
    input Real data[6,10],pivots[6,3],massScale,lengthScale,bend,trunkRatio,recruit,feather,port,starboard;
    output Real H[8];
  protected
    Real base[5],next[5];
  algorithm
    base:=segmentInertia(data,pivots,massScale,lengthScale,bend,trunkRatio,recruit,feather,port,starboard);
    next:=segmentInertia(data,pivots,massScale,lengthScale,bend+.001,trunkRatio,recruit,feather,port,starboard);
    H:=cat(1,base,(next[3:5]-base[3:5])/.001);
  end articulatedInertia;
  function groundContact
    input Real origin[3],heading,state[10],length,bank[2];
    output Real loads[8] "Forward, port, up, pitch, yaw, normal load, minimum signed gap, roll";
  protected
    // Body, rostrum, bottom of the caudal fin, paired pectorals, dorsal and flank skin points.
    constant Real skin[13,3]=cat(1,Wreck.SwimmerHulls.sharkSkin,
      [-1.25,0,-.05;-.42,0,-.05;.42,0,-.05;1.25,0,-.05]);
    Real cy,sy,cp,sp,cr,sr,arm[3],point[3],velocity[3],contact[5],hull[5],along,side,up,tailRate;
  algorithm
    loads:=zeros(8);loads[7]:=1e6;
    cp:=cos(state[3]);sp:=sin(state[3]);
    cr:=cos(bank[1]);sr:=sin(bank[1]);
    // Even with maximum tail sweep, all probes fit inside this sphere.
    // The gap remains the exact minimum over the rotated contact points.
    if Shore.aboveFlatBottom(origin[1],origin[2],origin[3],2.5*abs(length/4.8)+.91) and
       not Wreck.WreckSolids.nearSite(origin,3.3*length/4.8) then
      for i in 1:9 loop
        along:=length/4.8*skin[i,1];up:=length/4.8*skin[i,3];
        side:=length/4.8*skin[i,2]-(if i==5 then .91*sin(state[6]) else 0);
        loads[7]:=min(loads[7],origin[3]+(along*sp+cp*(side*sr+up*cr))+13.7);
      end for;
      return;
    end if;
    cy:=cos(heading);sy:=sin(heading);
    for i in 1:13 loop
      along:=length/4.8*skin[i,1];
      side:=length/4.8*skin[i,2]-(if i==5 then .91*sin(state[6]) else 0);
      up:=length/4.8*skin[i,3];
      tailRate:=if i==5 then -.91*cos(state[6])*state[7] else 0;
      arm:={along*cp-(side*sr+up*cr)*sp,side*cr-up*sr,along*sp+(side*sr+up*cr)*cp};
      point:=origin+{cy*arm[1]-sy*arm[2],sy*arm[1]+cy*arm[2],arm[3]};
      velocity:={state[1]-state[9]*arm[2]-state[4]*arm[3]-sp*(tailRate*sr+bank[2]*arm[2]),
        state[10]+state[9]*arm[1]+tailRate*cr-bank[2]*(side*sr+up*cr),
        state[2]+state[4]*arm[1]+cp*(tailRate*sr+bank[2]*arm[2])};
      contact:=if i<=9 then Shore.skinContact(point,cy,sy,velocity,5800) else {0,0,0,0,1e6};
      hull:=Wreck.swimmerContact(point,cy,sy,velocity,min(.78,length/4.8*(if i>=10 then .40 else .12)),5800);
      contact[1:4]:=contact[1:4]+hull[1:4];contact[5]:=min(contact[5],hull[5]);
      loads[1:3]:=loads[1:3]+contact[1:3];
      loads[4]:=loads[4]+arm[1]*contact[3]-arm[3]*contact[1];
      loads[5]:=loads[5]+arm[1]*contact[2]-arm[2]*contact[1];
      loads[6]:=loads[6]+contact[4];loads[7]:=min(loads[7],contact[5]);
      loads[8]:=loads[8]+arm[2]*(cp*contact[3]-sp*contact[1])-(side*sr+up*cr)*contact[2];
    end for;
  end groundContact;
  function pectorals
    input Boolean direct;
    input Real along,normal,incidence,area,wet,portWet,starboardWet,bankLift,portAngle,starboardAngle,rollRate,yawRate;
    output Real loads[6] "Axial and normal force, roll and yaw moment, port and starboard normal force";
  protected
    constant Real arm=.91;
    Real portX,portZ,starboardX,starboardZ,fx,fz,roll,yaw;
  algorithm
    if direct then
      (portX,portZ):=Humpback.foil(along-arm*yawRate,normal+arm*rollRate,portAngle,area,portWet);
      (starboardX,starboardZ):=Humpback.foil(along+arm*yawRate,normal-arm*rollRate,starboardAngle,area,starboardWet);
      fx:=portX+starboardX;fz:=portZ+starboardZ;
      roll:=arm*(portZ-starboardZ);yaw:=arm*(starboardX-portX);
    else
      (fx,fz):=Humpback.foil(along,normal,incidence,2*area,wet);
      roll:=bankLift;yaw:=0;
      portZ:=.5*(fz+bankLift/arm);starboardZ:=.5*(fz-bankLift/arm);
    end if;
    loads:={fx,fz,roll,yaw,portZ,starboardZ};
  end pectorals;
  discrete output Real ground[8](each start=0,each fixed=true);
  output Real lockedInertia[8] "Rigid roll/pitch/yaw and coupled yaw/hinge coefficients";
  output Real tailThrust,shaftPower,frequency,finAngle,velocity[2],trunkFlex;
  output Real peduncleTorque(unit="N.m"),pectoralLoad[6] "Axial/normal N, roll/yaw N.m, port/starboard normal N";
protected
  Real u,v,along,normal,wet,tailWet,finWet,turn,effort,amplitude,rate,target,rawTorque,torque,caudalArm,torqueLimit,powerLimit,limitedTorque;
  Real lateral,inflow,tailX,tailY,finX,finZ,drag,bodyNormal,sideForce,feather,featherControl,finExposure,lead,leadAngle,leadRate,leadInflow;
  Real immersed[7],buoyMoment,stationHalfHeight[7],tailDepth,caudalHalfHeight;
  Real bowSide,sternSide,bowFlow,sternFlow;
  Real cp,sp,cr,sr,forward,vertical,finBank,bankTorque,yawWaterInertia;
  Boolean direct,learned;
  Real action[4],speedError,pitchSignal,rollSignal,tailSignal,featherSignal;
  Real finDepth,portWet,starboardWet;
  Real recruit,steer,gear,sternX,sternY,sternDX,sternDY,sternAxial,sternNormal,sternFx,sternFy,tailArmX,tailArmY,tailDX,tailDY,tailAlong;
  Real trunkRatio,totalYaw,totalHinge,determinant,yawLoad,hingeLoad;
  Real gaitSprint,gaitBurst,portAngle,starboardAngle;
equation
  direct=directDrive>.5;learned=directDrive>1.5;
  // Positive yaw curls the posterior body to port (negative posterior tangent).
  steer=min(1,abs(directDrive-1))*max(-1,min(1,swimCommand[2]));
  recruit=max(min(1,max(0,directDrive-1)),abs(steer));
  speedError=(1.25+2.75*swimCommand[1]-along)/2;
  // Oscillatory muscle activation with state feedback. The actor controls four
  // bounded actuators; forward motion comes from the caudal water reaction.
  tailSignal=(.65+swimWeights[1]+(.22+swimWeights[2])*speedError+.75*abs(steer))*cos(x[5])
    -(.35+swimWeights[3]+.75*abs(steer))*x[6]-.035*x[7]-(.68+.25*swimWeights[5])*steer;
  featherSignal=(.52+swimWeights[4])*inflow-(1.10+swimWeights[5])*swimCommand[2]+.40*x[9];
  pitchSignal=(1.35+swimWeights[6])*(swimCommand[3]-x[3])-.4*x[4]+.10+swimWeights[7];
  rollSignal=(1.0+swimWeights[8])*(swimCommand[4]-.32*steer-bank[1])-.30*bank[2];
  action=if learned then {tanh(tailSignal),tanh(featherSignal),tanh(pitchSignal+rollSignal),tanh(pitchSignal-rollSignal)} else actuators;
  trackingReward=1-speedError^2-3*(x[9]-.48*swimCommand[2])^2
    -2.5*(x[3]-swimCommand[3])^2-1.2*(bank[1]-swimCommand[4])^2-.035*max(0,shaftPower)/peakPower;
  gaitSprint=if direct then 0 else sprint;gaitBurst=if direct then 0 else burst;
  cp=cos(x[3]);sp=sin(x[3]);cr=cos(bank[1]);sr=sin(bank[1]);
  u=x[1]-current[1]*cos(heading)-current[2]*sin(heading);
  v=x[10]+current[1]*sin(heading)-current[2]*cos(heading);
  along=cp*u+sp*x[2];normal=-sp*u+cp*x[2];
  for i in 1:7 loop
    stationHalfHeight[i]=sqrt((sliceRadius[i]*cp)^2+(.31*sp)^2);
    immersed[i]=volumeShare[i]*Humpback.wet(surface-z-buoyArm[i]*sp-.07*cp,stationHalfHeight[i]);
  end for;
  wet=sum(immersed);
  buoyMoment=.992*mass*9.81*sum({immersed[i]*(buoyArm[i]*cp-.07*sp) for i in 1:7});
  // Each caudal lobe loses its own lifting area as it clears the surface.
  tailDepth=surface-z+2.0*sp;
  caudalHalfHeight=sqrt((.34*cp)^2+(.28*sp)^2);
  tailWet=.56*Humpback.wet(tailDepth-.34*cp,caudalHalfHeight)+.44*Humpback.wet(tailDepth+.30*cp,caudalHalfHeight);
  finWet=Humpback.wet(surface-z-.42*sp+.18*cp,.27);
  turn=atan2(sin(desiredHeading-heading),cos(desiredHeading-heading));
  effort=max(0,min(1,.11*desiredSpeed+.26*(desiredSpeed+7*gaitBurst-along)));
  // The ordinary stroke range is based on tagged ascents (Semmens et al., 2019).
  // The 15 m/s game launch recruits a faster, finite-reserve stroke.
  frequency=if learned then max(.45,min(2.2,.95+swimWeights[9]+(.55+swimWeights[10])*swimCommand[1])) else if direct then 0 else .39+(1.60+.51*gaitBurst+breachFrequencyGain*breachRecruitment+.13*gaitSprint*(1-gaitBurst))*effort;rate=6.2831853*frequency;der(x[5])=rate;
  amplitude=.26+(.46+.20*gaitSprint+.47*gaitBurst+.16*breachRecruitment)*effort;target=amplitude*sin(x[5])-.75*steer;
  torqueLimit=peakTorque*(1+1.4*gaitSprint+8*gaitBurst+4*breachRecruitment+.6*gaitSprint*(1-gaitBurst));
  powerLimit=peakPower*(1+2*gaitSprint+14*gaitBurst+9*breachRecruitment+3*(sustainedPowerGain-1)*gaitSprint*(1-gaitBurst));
  // Reduce outward muscle recruitment at the edge of the tail stroke.
  // The compliant hinge and its damping continue to act in both modes.
  rawTorque=if direct then peakTorque*max(-1,min(1,action[1]))*
    min(1,max(0,(1.15-(if action[1]>=0 then x[6] else -x[6]))/.20)) else
    drive*(1+1.5*gaitSprint+5*gaitBurst+3*breachRecruitment)*(14500*(target-x[6])+1500*(amplitude*rate*cos(x[5])-x[7]));
  limitedTorque=max(-torqueLimit,min(torqueLimit,rawTorque));
  torque=limitedTorque*min(1,powerLimit/max(1,(rawTorque+featherControl*(limitedTorque-rawTorque))*x[7]));
  peduncleTorque=torque;
  shaftPower=peduncleTorque*x[7];
  // A stronger stroke recruits more of the peduncle ahead of the caudal fin.
  // The same lever maps fin motion and water reaction back to the hinge.
  caudalArm=hingeArm+.21*gaitSprint+.20*breachRecruitment+.11*gaitSprint*(1-gaitBurst);
  // Move the caudal centre of pressure with the bent trunk. The same
  // displacement Jacobian projects its fluid load onto the bending mode.
  tailArmX=-1.95+recruit*caudalArm*(1-cos(x[6]))+1.35*recruit*(1-cos(trunkFlex));
  tailArmY=-caudalArm*sin(x[6])-1.35*recruit*sin(trunkFlex);
  tailDX=caudalArm*sin(x[6])+1.35*recruit*sin(trunkFlex)*gear;
  tailDY=-caudalArm*cos(x[6])-1.35*recruit*cos(trunkFlex)*gear;
  lateral=v+tailArmX*x[9]+tailDY*x[7];
  tailAlong=along-recruit*tailArmY*x[9]+tailDX*x[7];
  inflow=atan2(lateral,max(.35,tailAlong));
  // At high effort the actively feathered caudal foil follows the local inflow
  // more closely, retaining a useful angle of attack during the loaded part of the beat.
  featherControl=gaitSprint+gaitBurst-gaitSprint*gaitBurst;
  // Preview the local caudal inflow over the actuator response time.
  lead=.012*gaitBurst;
  leadAngle=x[6]+lead*x[7];
  leadRate=x[7]-lead*rate^2*x[6];
  leadInflow=if lead>0 then atan2(v-1.95*x[9]-caudalArm*cos(leadAngle)*leadRate,
    max(.35,along+caudalArm*sin(leadAngle)*leadRate)) else inflow;
  feather=if direct then 1.22*max(-1,min(1,action[2])) else max(-1.22-.14*featherControl,min(1.22+.14*featherControl,.50*leadInflow+featherControl*.45*
    (leadInflow-min(.50,max(-.50,leadInflow)))-.60*turn+.70*x[9]));
  der(x[8])=min(18+80*featherControl,
    max(-18-80*featherControl,(feather-x[8])*(35+205*featherControl)));
  (tailX,tailY)=Humpback.foil(tailAlong,lateral,x[8],tailArea,tailWet);
  tailThrust=tailX;
  der(x[6])=x[7];
  hingeLoad=peduncleTorque+tailDX*tailX+tailDY*tailY+sternDX*sternFx+sternDY*sternFy-580*x[6]-95*x[7]
    -recruit*30000*(max(0,x[6]-.87)-max(0,-.87-x[6]))
    +.5*lockedInertia[6]*x[9]^2-.5*lockedInertia[8]*x[7]^2;
  der(x[7])=(totalYaw*hingeLoad-lockedInertia[4]*yawLoad)/determinant;
  portAngle=.85*max(-1,min(1,action[3]));starboardAngle=.85*max(-1,min(1,action[4]));
  finAngle=if direct then .5*(portAngle+starboardAngle) else max(-.85,min(.85,atan2(normal,max(.60,along))+.96*(desiredPitch-x[3])-.42*x[4]));
  // Retract part of the pectoral span in straight, fast swimming. Restore
  // the exposed span as pitch and bank demand increase.
  finExposure=1-.46*featherControl*max(0,min(1,(along-4)/5))*
    max(0,1-2*abs(finAngle)-1.5*abs(bankCommand-bank[1]));
  // Port/starboard centers move in opposite vertical directions in a bank.
  // Project flow onto the fin normal and include pitch velocity at the forward lever.
  finDepth=surface-z-.65*sp+.18*cp*cr;
  portWet=Humpback.wet(finDepth-.91*sr*cp,.27);
  starboardWet=Humpback.wet(finDepth+.91*sr*cp,.27);
  pectoralLoad=pectorals(direct,along,if direct then cr*(normal+.65*x[4])-sr*v else normal-.55*x[4],
    finAngle,pectoralArea*finExposure,finWet,portWet,starboardWet,
    bankTorque,portAngle,starboardAngle,bank[2],x[9]);
  finX=pectoralLoad[1];finZ=pectoralLoad[2];
  // In a streamlined stroke, the torso presents a smaller effective drag
  // area to the axial flow. Crossflow retains its separate drag terms.
  drag=-.5*1025*(.073-.035*gaitSprint)*wet*along*abs(along);
  bodyNormal=-wet*(225*normal*abs(along)+250*normal*abs(normal));
  // Two strips sample crossflow ahead and astern of the centre of mass. Their
  // separated reactions resist yaw even when the net lateral velocity is zero.
  bowFlow=v+1.18*x[9];
  // A crossflow strip aft of the centre of mass follows the rear trunk.
  // Its cant changes both the direction of resistance and its moment arm.
  sternX=-1.30+1.30*recruit*(1-cos(trunkFlex));
  sternY=-1.30*recruit*sin(trunkFlex);
  sternDX=1.30*recruit*sin(trunkFlex)*gear;
  sternDY=-1.30*recruit*cos(trunkFlex)*gear;
  sternAxial=along-sternY*x[9]+sternDX*x[7];sternNormal=v+sternX*x[9]+sternDY*x[7];
  sternFlow=sternNormal*cos(recruit*trunkFlex)-sternAxial*sin(recruit*trunkFlex);
  bowSide=-wet*(120*abs(along)+215*abs(bowFlow))*bowFlow;
  sternSide=-wet*(150*abs(along)+215*abs(sternFlow))*sternFlow;
  sternFx=-sin(recruit*trunkFlex)*sternSide;sternFy=cos(recruit*trunkFlex)*sternSide;
  sideForce=bowSide+sternFy;
  // Anterior bending decreases as dynamic pressure stiffens the trunk. The
  // remaining peduncle deflection and compliant caudal foil keep the tail beat.
  trunkRatio=.29/(1+(abs(along)/1.18)^6);
  trunkFlex=trunkRatio*x[6]+.65*recruit*(x[6]-tanh(3*x[6])/3);
  gear=trunkRatio+.65*recruit*tanh(3*x[6])^2;
  forward=tailX+finX+drag+sternFx;vertical=cr*finZ+bodyNormal;
  // Use the same contact clock as the humpback so a face change on the wreck
  // cannot force arbitrarily small adaptive integration steps.
  lockedInertia=articulatedInertia(segments,pivots,mass/870,length/4.8,x[6],trunkRatio,recruit,x[8],if direct then portAngle else finAngle,if direct then starboardAngle else finAngle);
  when sample(0,.005) then
    ground=groundContact({east,north,z},heading,x,length,bank);
  end when;
  der(x[1])=(boatLoad[1]+ground[1]+cp*forward-sp*vertical)/mass+x[9]*x[10];
  der(x[2])=(ground[3]+sp*forward+cp*vertical)/mass+9.81*(.992*wet-1);
  der(x[3])=x[4];
  der(x[4])=(ground[4]+buoyMoment+.65*cr*finZ-.16*bodyNormal-wet*(480+150*abs(along))*x[4])/max(1,lockedInertia[2]);
  // A firmer torso entrains water farther forward during the sprint stroke.
  yawWaterInertia=wet*yawAddedInertia*(1+.35*gaitSprint);
  totalYaw=lockedInertia[3]+yawWaterInertia;
  totalHinge=lockedInertia[5]+wet*hingeWaterInertia;
  determinant=max(1,totalYaw*totalHinge-lockedInertia[4]^2);
  yawLoad=boatLoad[3]+ground[5]+pectoralLoad[4]+tailArmX*tailY-recruit*tailArmY*tailX+1.18*bowSide+sternX*sternFy-sternY*sternFx
    -wet*(520+200*abs(along))*x[9]-lockedInertia[6]*x[9]*x[7]-lockedInertia[7]*x[7]^2;
  der(x[9])=(totalHinge*yawLoad-lockedInertia[4]*hingeLoad)/determinant;
  der(x[10])=(boatLoad[2]+ground[2]+tailY+sideForce-sr*finZ)/(mass+350)-x[9]*x[1];
  // Differential pectoral lift banks the shark. Fin immersion and water
  // speed limit the control moment while buoyancy and drag right the body.
  finBank=max(-.55,min(.55,1.3*(bankCommand-bank[1])-.42*bank[2]));
  bankTorque=.5*1025*2*pectoralArea*.91*finWet*along^2*finBank;
  der(bank[1])=bank[2];
  der(bank[2])=(ground[8]+pectoralLoad[3]-wet*(.07*mass*9.81*sr+(120+95*abs(along))*bank[2]))/max(1,lockedInertia[1]);
  velocity={x[1]*cos(heading)-x[10]*sin(heading),x[1]*sin(heading)+x[10]*cos(heading)};
end GreatWhite;
