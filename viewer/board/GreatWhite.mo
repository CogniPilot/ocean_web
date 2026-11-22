model GreatWhite "Lamnid swimmer with a laterally driven peduncle, compliant caudal foil and paired pectorals"
  parameter Real mass(unit="kg")=870, length(unit="m")=4.8;
  parameter Real tailArea(unit="m2")=.64, pectoralArea(unit="m2")=.32;
  parameter Real hingeArm(unit="m")=.91, hingeInertia(unit="kg.m2")=24, yawInertia(unit="kg.m2")=890;
  // A fully immersed prolate body accelerates water sideways along its length.
  parameter Real yawAddedInertia(unit="kg.m2")=1025*3.14159*.47^2*length^3/60;
  parameter Real peakTorque(unit="N.m")=6200, peakPower(unit="W")=24500;
  parameter Real startState[10]={1.65,0,0,0,0,0,0,0,0,0};
  // Symmetric displaced-volume stations centred on the longitudinal COM.
  // Their vertical centre sits 7 cm above it, so buoyancy also rights a steeply pitched animal.
  constant Real buoyArm[7]={-1.86,-1.24,-.62,0,.62,1.24,1.86};
  constant Real sliceRadius[7]={.16,.30,.43,.47,.43,.30,.16};
  constant Real volumeShare[7]={.027,.103,.225,.290,.225,.103,.027};
  input Real boatLoad[3] "Hull reaction in forward and port axes, and yaw moment";
  parameter Real startBank[2]={0,0};
  input Real east,north,z,heading,surface,current[2],desiredSpeed,desiredPitch,desiredHeading,drive,bankCommand;
  output Real x[10](start=startState,each fixed=true)
    "Ground surge, heave, pitch, pitch rate, stroke phase, peduncle yaw, peduncle rate, caudal incidence, yaw rate, ground sway";
  output Real bank[2](start=startBank,each fixed=true) "Roll and roll rate, positive starboard down";
  function groundContact
    input Real origin[3],heading,state[10],length,bank[2];
    output Real loads[8] "Forward, port, up, pitch, yaw, normal load, minimum signed gap, roll";
  protected
    // Body, rostrum, bottom of the caudal fin, paired pectorals, dorsal and flank skin points.
    constant Real skin[9,3]=[2.32,0,-.09;1.22,0,-.36;0,0,-.47;-1.12,0,-.32;-2.18,0,-.55;
      .04,.91,-.30;.04,-.91,-.30;-.20,0,.92;1.02,0,.34];
    Real cy,sy,cp,sp,cr,sr,arm[3],point[3],velocity[3],contact[5],along,side,up,tailRate;
  algorithm
    loads:=zeros(8);loads[7]:=1e6;
    cp:=cos(state[3]);sp:=sin(state[3]);
    cr:=cos(bank[1]);sr:=sin(bank[1]);
    // Even with maximum tail sweep, all probes fit inside this sphere.
    // The gap remains the exact minimum over the rotated contact points.
    if Shore.aboveFlatBottom(origin[1],origin[2],origin[3],2.33*abs(length/4.8)+.91) then
      for i in 1:9 loop
        along:=length/4.8*skin[i,1];up:=length/4.8*skin[i,3];
        side:=length/4.8*skin[i,2]-(if i==5 then .91*sin(state[6]) else 0);
        loads[7]:=min(loads[7],origin[3]+(along*sp+cp*(side*sr+up*cr))+13.7);
      end for;
      return;
    end if;
    cy:=cos(heading);sy:=sin(heading);
    for i in 1:9 loop
      along:=length/4.8*skin[i,1];
      side:=length/4.8*skin[i,2]-(if i==5 then .91*sin(state[6]) else 0);
      up:=length/4.8*skin[i,3];
      tailRate:=if i==5 then -.91*cos(state[6])*state[7] else 0;
      arm:={along*cp-(side*sr+up*cr)*sp,side*cr-up*sr,along*sp+(side*sr+up*cr)*cp};
      point:=origin+{cy*arm[1]-sy*arm[2],sy*arm[1]+cy*arm[2],arm[3]};
      velocity:={state[1]-state[9]*arm[2]-state[4]*arm[3]-sp*(tailRate*sr+bank[2]*arm[2]),
        state[10]+state[9]*arm[1]+tailRate*cr-bank[2]*(side*sr+up*cr),
        state[2]+state[4]*arm[1]+cp*(tailRate*sr+bank[2]*arm[2])};
      contact:=Shore.skinContact(point,cy,sy,velocity,5800);
      loads[1:3]:=loads[1:3]+contact[1:3];
      loads[4]:=loads[4]+arm[1]*contact[3]-arm[3]*contact[1];
      loads[5]:=loads[5]+arm[1]*contact[2]-arm[2]*contact[1];
      loads[6]:=loads[6]+contact[4];loads[7]:=min(loads[7],contact[5]);
      loads[8]:=loads[8]+arm[2]*(cp*contact[3]-sp*contact[1])-(side*sr+up*cr)*contact[2];
    end for;
  end groundContact;
  output Real ground[8];
  output Real tailThrust,shaftPower,frequency,finAngle,velocity[2],trunkFlex;
protected
  Real u,v,along,normal,wet,tailWet,finWet,turn,effort,amplitude,rate,target,rawTorque,torque;
  Real lateral,inflow,tailX,tailY,finX,finZ,drag,bodyNormal,sideForce,feather;
  Real immersed[7],buoyMoment,stationHalfHeight[7],tailDepth,caudalHalfHeight;
  Real bowSide,sternSide,bowFlow,sternFlow;
  Real cp,sp,cr,sr,forward,vertical,finBank,bankTorque;
equation
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
  effort=max(0,min(1,.11*desiredSpeed+.26*(desiredSpeed-along)));
  // Semmens et al. (2019), tagged white shark ascents: 0.39--2.50 Hz.
  frequency=.39+1.60*effort;rate=6.2831853*frequency;der(x[5])=rate;
  amplitude=.26+.46*effort;target=amplitude*sin(x[5]);
  rawTorque=drive*(14500*(target-x[6])+1500*(amplitude*rate*cos(x[5])-x[7]));
  torque=max(-peakTorque,min(peakTorque,rawTorque))*min(1,peakPower/max(1,rawTorque*x[7]));
  shaftPower=torque*x[7];
  lateral=v-1.95*x[9]-hingeArm*cos(x[6])*x[7];
  inflow=atan2(lateral,max(.35,along+hingeArm*sin(x[6])*x[7]));
  feather=max(-1.22,min(1.22,.50*inflow-.60*turn+.70*x[9]));
  der(x[8])=min(18,max(-18,(feather-x[8])*35));
  (tailX,tailY)=Humpback.foil(along+hingeArm*sin(x[6])*x[7],lateral,x[8],tailArea,tailWet);
  tailThrust=tailX;
  der(x[6])=x[7];
  der(x[7])=(torque-hingeArm*(cos(x[6])*tailY-sin(x[6])*tailX)-580*x[6]-95*x[7])/hingeInertia;
  finAngle=max(-.85,min(.85,atan2(normal,max(.60,along))+.96*(desiredPitch-x[3])-.42*x[4]));
  (finX,finZ)=Humpback.foil(along,normal-.55*x[4],finAngle,2*pectoralArea,finWet);
  drag=-.5*1025*.073*wet*along*abs(along);
  bodyNormal=-wet*(225*normal*abs(along)+250*normal*abs(normal));
  // Two strips sample crossflow ahead and astern of the centre of mass. Their
  // separated reactions resist yaw even when the net lateral velocity is zero.
  bowFlow=v+1.18*x[9];sternFlow=v-1.30*x[9];
  bowSide=-wet*(120*abs(along)+215*abs(bowFlow))*bowFlow;
  sternSide=-wet*(150*abs(along)+215*abs(sternFlow))*sternFlow;
  sideForce=bowSide+sternSide;
  // Anterior bending decreases as dynamic pressure stiffens the trunk. The
  // remaining peduncle deflection and compliant caudal foil keep the tail beat.
  trunkFlex=.29*x[6]/(1+(abs(along)/1.18)^6);
  forward=tailX+finX+drag;vertical=cr*finZ+bodyNormal;
  ground=groundContact({east,north,z},heading,x,length,bank);
  der(x[1])=(boatLoad[1]+ground[1]+cp*forward-sp*vertical)/mass+x[9]*x[10];
  der(x[2])=(ground[3]+sp*forward+cp*vertical)/mass+9.81*(.992*wet-1);
  der(x[3])=x[4];
  der(x[4])=(ground[4]+buoyMoment+.65*cr*finZ-.16*bodyNormal-wet*(480+150*abs(along))*x[4])/720;
  der(x[9])=(boatLoad[3]+ground[5]-1.95*tailY+1.18*bowSide-1.30*sternSide-wet*(520+200*abs(along))*x[9])/(yawInertia+wet*yawAddedInertia);
  der(x[10])=(boatLoad[2]+ground[2]+tailY+sideForce-sr*finZ)/(mass+350)-x[9]*x[1];
  // Differential pectoral lift banks the shark. Fin immersion and water
  // speed limit the control moment while buoyancy and drag right the body.
  finBank=max(-.55,min(.55,1.3*(bankCommand-bank[1])-.42*bank[2]));
  bankTorque=.5*1025*2*pectoralArea*.91*finWet*along^2*finBank;
  der(bank[1])=bank[2];
  der(bank[2])=(ground[8]+bankTorque-wet*(.07*mass*9.81*sr+(120+95*abs(along))*bank[2]))/190;
  velocity={x[1]*cos(heading)-x[10]*sin(heading),x[1]*sin(heading)+x[10]*cos(heading)};
end GreatWhite;
