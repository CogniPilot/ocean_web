model MantaRay "Mobuliform swimming, gliding and surface breaches in an ENU harbor"
  parameter Boolean enableContacts=true "Resolve geometric contacts with the environment" annotation(Evaluate=true);
  parameter Real span(unit="m")=5.5,mass(unit="kg")=420,wingArea(unit="m2")=5.8;
  parameter Real fullSwimSpeed(unit="m/s")=3.5, sprintSwimSpeed(unit="m/s")=7;
  parameter Real routeCenter[2]={-12,24},routeRadii[2]={19,9};
  parameter Real initialState[16]={-25,17.4,-7.4,1.24,-.50,0,-.38,0,0,0,0,0,0,.34,0,60};
  input Real currentVelocity[3]=zeros(3), waterLevel=0, bedHeight=-13.7;
  input Real breach=0,autoBreach=0,sprint=0 "Sprint enable at positive manual swim effort";
  input Real pilot[5]=zeros(5) "Occupied, turn to port, nose up, stroke effort, port wing up; axes -1..1";
  input Real directDrive=0 "Select finActions above 0.5";
  input Real finActions[5]=zeros(5) "Direct cadence and stroke amplitude [0,1], then fore/aft camber, port/starboard twist and asymmetric stroke/brake [-1,1]";
  input Real craft[32,8]=zeros(32,8) "ID, type, ENU, east/north velocity, host";
  input Real craftHull[32,5]=zeros(32,5) "Hull class, yaw, heel, nose-down pitch, yaw rate";
  output Real state[16]
    "ENU, ground velocity ENU, yaw/nose-up pitch/port-wing-up roll, their rates, stroke phase, amplitude, time, age of last breach request";
  output Real activity[6] "Stroke Hz, instantaneous upward wing angle rad, glide flag, submerged fraction, airborne flag, wing rate rad/s";
  output Real proxies[10,7] "Articulated collision capsules, FLU endpoints and radius in metres";
  discrete output Real vesselWrench[32,6](each start=0,each fixed=true) "Force, moment ENU on each craft about its reported origin";
  discrete output Real avoidance[4](each start=0,each fixed=true) "Horizontal and depth avoidance, encounter strength";
  output Real musclePower, thrust "Modelled pectoral mechanical power (W) and streamwise stroke thrust (N)";
  output Real wingNormalLoad[2](each unit="N") "Port and starboard pectoral normal forces, positive toward body up";
  output Real wingAxialLoad[2](each unit="N") "Port and starboard streamwise loads, including thrust and drag";
  output Real chordNormalLoad[2](each unit="N") "Fore and aft pectoral normal forces, positive toward body up";
  output Real finMoment[3](each unit="N.m") "Pectoral moments in positive port-wing-up roll, nose-up pitch and port yaw";

  parameter Real initialWings[4]={0,0,0,0} "Port/starboard angle, then rates";
  input Real muscleDrive=0,wingEffort[2]=zeros(2) "Direct normalized independent bilateral hinge efforts when muscleDrive is enabled";
  output Real wingJoints[4](start=initialWings,each fixed=true) "Positive tip-up angles (rad) and rates (rad/s)";
  parameter Real initialWake[2]={0,0};
  output Real wingWake[2](start=initialWake,each fixed=true) "Lagged port and starboard axial foil force, N";
  output Real centerOfMass[3],centerVelocity[3] "Dry anatomical mass center and velocity in ENU";
  output Real hingeTorque[2] "Internal muscle torque, N m";
  output Real bodyProperties[3,7] "Trunk, port and starboard: kg, local COM metres, principal dry moments kg m2";
  function observe
    input Real s[16],angle[2],angleRate[2],craft[32,8],hull[32,5];
    output Real guidance[4],reaction[6],loads[32,6],hinge[2];
  protected
    Real dx,dy,dz,ve,vn,t,d,notice,strength,side,kind,course,length,width,space,draft;
    Real wrench[12],pairHinge[2],vessel[6],animal[9],align;
  algorithm
    hinge:=zeros(2);guidance:=zeros(4);reaction:=zeros(6);loads:=zeros(32,6);
    animal:={3,s[1],s[2],s[3],s[7],s[8],s[4],s[5],s[9]};
    for j in 1:32 loop
      kind:=craft[j,2];
      if kind>0 then
        dx:=s[1]-craft[j,3];dy:=s[2]-craft[j,4];dz:=s[3]-craft[j,5];
        if dx*dx+dy*dy+dz*dz<24^2 then
          // Pick the passing side from the present bearing. The predicted
          // miss vector can reverse as soon as the animal begins to turn.
          side:=if cos(s[7])*dy-sin(s[7])*dx>=0 then 1 else -1;
          ve:=s[4]-craft[j,6];vn:=s[5]-craft[j,7];
          t:=max(0,min(2,-(dx*ve+dy*vn)/max(.02,ve*ve+vn*vn)));
          dx:=dx+t*ve;dy:=dy+t*vn;
          d:=sqrt(dx*dx+dy*dy+2.25*dz*dz);
          notice:=if kind==1 then 16 elseif kind==2 then 10 elseif kind==3 then 8 else 11;
          strength:=max(0,1-d/notice);
          if strength>0 then
            // Give an almost head-on encounter a passing side, including a
            // stationary swimmer whose reported horizontal velocity is zero.
            align:=abs(cos(s[7])*dx+sin(s[7])*dy)/max(.01,sqrt(dx*dx+dy*dy));
            guidance[1]:=guidance[1]+strength*(dx/max(.6,d)-side*.85*align*sin(s[7]));
            guidance[2]:=guidance[2]+strength*(dy/max(.6,d)+side*.85*align*cos(s[7]));
            guidance[3]:=guidance[3]+strength*(if dz>.2 then .9 else -.9);
            guidance[4]:=max(guidance[4],strength);
          end if;
          course:=if hull[j,1]>0 then hull[j,2] else atan2(craft[j,7],craft[j,6]+1e-12);
          length:=if kind==2 then .73 elseif kind==3 then .6 elseif hull[j,1]>2.5 then 7.6 elseif hull[j,1]>1.5 then 2.32 elseif hull[j,1]>.5 then 5.04 else 2.6;
          width:=if kind==2 then .215 elseif kind==3 then .24 elseif hull[j,1]>2.5 then 1.22 elseif hull[j,1]>1.5 then .33 elseif hull[j,1]>.5 then .18 else .48;
          draft:=if kind==2 then -.19 elseif kind==3 then -.16 elseif hull[j,1]>2.5 then .58 elseif hull[j,1]>1.5 then .28 elseif hull[j,1]>.5 then .25 else -.32;
          space:=if (kind==1 or kind==4) and hull[j,1]>.5 and hull[j,1]<1.5 then 1.02 else 0;
          vessel:={craft[j,3],craft[j,4],craft[j,5],hull[j,3],hull[j,4],course};
          (wrench,pairHinge):=MantaContact.pair(animal,angle[1],vessel,{craft[j,6],craft[j,7],hull[j,5]},length,width,space,draft,
            s[6],{s[12],s[11],s[10]},angleRate[1],0,0,0,angle[2],angleRate[2]);
          hinge:=hinge+pairHinge;
          loads[j,:]:=wrench[1:6];reaction:=reaction+wrench[7:12];
        end if;
      end if;
    end for;
  end observe;

protected
  constant Real pi=3.141592653589793,g=9.80665,rho=1025;
  constant Real thrustCoefficient=.14, dragArea(unit="m2")=.25;
  final parameter Real wingArm(unit="m")=.21*span "Effective half-wing centre of pressure from the body centreline";
  final parameter Real chordArm(unit="m")=.4*wingArea/span "Fore/aft normal load arm about the body centre";
  // At full effort, average(.4+.6*cos(phase)^2)=.7. Solve mean
  // propulsive thrust = quadratic drag for the necessary wingbeat frequency.
  final parameter Real speedPerHz=2*pi*.34*span*.49*sqrt(.7*thrustCoefficient*wingArea/dragArea);
  discrete Real contactHinge[2](each start=0,each fixed=true);
  discrete Real contacts[6](each start=0,each fixed=true);
  Real x[15](start=initialState[1:15],each fixed=true);
  Real requestAge(start=initialState[16],fixed=true,stateSelect=StateSelect.always);
  Real R[3,3],v[3],u[3],normalFlow,course[2],radial[2],orbitError,headingGoal,headingError;
  Real zGoal,climbGoal,pitchGoal,rollGoal,turn,effort,wet,amplitudeGoal,frequency,wingAngle,wingRate;
  Real q,Cl,wingLift,sideDrag,normalDrag,bottom,ground;
  Real wingTarget,rateTarget,site[2,3],wingForce[2,3],foreMoment[2],hingeLoad[2],baseMoment[3],baseForce[3];
  Real omega[3],rateBias[3],angular[3],pc,st,ct,sr,cr,wingWeight[2,3],wingCenter[2,3],rootWeight[3],tip[2,3],tipVelocity[2,3],tipBed[2,3],tipGap[2];
  Real waterFraction,comRate[2,3],localStroke[2],strokeThrust[2],hingeLoss[2],localWet[2],wingPressureVelocity[2],lateralLoad[2];
  Real acc[8];
  Real bankTwist,rollSpeed,foilSpeed,bankPressure,pressureLimit,pressureDifference;
  Real pitchTwist,pitchSpeed,chordDifference,patchLoad[2,2],yawBias,axialSpeed[2],brakeArea[2];
  Boolean direct,burst,glide,autoPulse;
equation
  state=cat(1,x,{requestAge});
  R=MantaContact.basis(state[7],state[8],state[9]);
  v=state[4:6]-currentVelocity;u=transpose(R)*v;
  wet=max(0,min(1,(waterLevel+.28-state[3])/.56));
  direct=directDrive>.5;
  autoPulse=not direct and autoBreach>.5 and mod(state[15]+17,88)<.12 and pilot[1]<.5;
  when {not direct and breach>.5,autoPulse} then reinit(requestAge,0);
  elsewhen state[3]>waterLevel+.28 then reinit(requestAge,60);
  end when;
  burst=state[16]<10;
  radial={(state[1]-routeCenter[1])/routeRadii[1],(state[2]-routeCenter[2])/routeRadii[2]};
  orbitError=sqrt(radial*radial)-1;
  course={-radial[2],radial[1]*routeRadii[2]/routeRadii[1]}-1.5*orbitError*radial+2.4*avoidance[1:2];
  headingGoal=atan2(course[2],course[1]+1e-12);
  headingError=atan2(sin(headingGoal-state[7]),cos(headingGoal-state[7]));
  turn=if pilot[1]>.5 then max(-1,min(1,pilot[2])) else max(-1,min(1,1.2*headingError));
  zGoal=min(waterLevel-.9,max(bedHeight+1.65,-7.35+.72*sin(.043*state[15])+2*avoidance[3]));
  climbGoal=max(-1.05,min(1.05,(zGoal-state[3])*.60));
  pitchGoal=if burst then .97 elseif pilot[1]>.5 then .78*pilot[3] else
    max(-.58,min(.58,atan2(climbGoal,max(.7,u[1]))+.16*(climbGoal-state[6])));
  rollGoal=max(-1,min(1,-.40*turn+(if pilot[1]>.5 then .67*pilot[5] else 0)));
  glide=if direct then finActions[1]<=0 or finActions[2]<=0 else
    not burst and (if pilot[1]>.5 then pilot[4]<-.55 else mod(state[15]+2,13)>9.2 and avoidance[4]<.34);
  effort=if burst then 1.35 elseif pilot[1]>.5 then max(0,min(1,.48+.52*pilot[4])) else .48+.28*avoidance[4];
  frequency=if direct then max(0,min(1,finActions[1]))*sprintSwimSpeed/speedPerHz elseif burst then .77 elseif pilot[1]>.5 and pilot[4]>0 then
    (.17+.30*.48)*(1-min(1,pilot[4]))+min(1,pilot[4])*
    (fullSwimSpeed+(sprintSwimSpeed-fullSwimSpeed)*min(1,max(0,sprint)))/speedPerHz
    else .17+.30*effort;
  amplitudeGoal=if direct then .55*max(0,min(1,finActions[2])) elseif glide then 0 else min(.55,.25+.24*effort);
  der(x[14])=(amplitudeGoal-state[14])/.44;
  der(x[13])=2*pi*frequency*wet;
  bodyProperties=[.80*mass,0,0,0,52,173,171; .10*mass,0,.75,0,11.3,5,15.4; .10*mass,0,-.75,0,11.3,5,15.4];
  wingTarget=MantaContact.strokeAngle(state[13],state[14]);
  rateTarget=(if sin(state[13])<0 then .45 else 1.25)*(der(x[14])*sin(state[13])+state[14]*cos(state[13])*der(x[13]));
  wingAngle=.5*(wingJoints[1]+wingJoints[2]);wingRate=.5*(wingJoints[3]+wingJoints[4]);
  der(wingJoints[1:2])=wingJoints[3:4];
  der(wingJoints[3:4])=acc[7:8];
  proxies=MantaContact.shapes(wingJoints[1],wingJoints[2]);
  waterFraction=.8*wet+.1*sum(localWet);
  activity={if glide and state[14]<.015 then 0 else wet*frequency,wingAngle,if glide then 1 else 0,waterFraction,if waterFraction<=.001 then 1 else 0,wingRate};
  when sample(0,.02) then
    if enableContacts then
      (avoidance,contacts,vesselWrench,contactHinge)=observe(state,wingJoints[1:2],wingJoints[3:4],craft,craftHull);
    else
      avoidance=zeros(4);
      contacts=zeros(6);
      vesselWrench=zeros(32,6);
      contactHinge=zeros(2);
    end if;
  end when;
  for i in 1:2 loop
    site[i,:]={0,(if i==1 then 1 else -1)*(.48+(wingArm-.48)*cos(wingJoints[i])),(wingArm-.48)*sin(wingJoints[i])};
    wingCenter[i,:]={0,(if i==1 then 1 else -1)*(.48+.75*cos(wingJoints[i])),.75*sin(wingJoints[i])};
    comRate[i,:]=cross({(if i==1 then 1 else -1)*wingJoints[i+2],0,0},wingCenter[i,:]-{0,(if i==1 then .48 else -.48),0});
    localWet[i]=max(0,min(1,(waterLevel+.20-state[3]-R[3,:]*site[i,:])/.40));
    hingeTorque[i]=if muscleDrive>.5 then 2200*max(-1,min(1,wingEffort[i])) else
      max(-6500,min(6500,6200*(wingTarget-wingJoints[i])+1100*(rateTarget-wingJoints[i+2])));
    localStroke[i]=wingJoints[i+2];
    // One convective lag represents the chordwise traveling wave. Axial
    // momentum comes from actual motion of the wing; it decays after stopping.
    der(wingWake[i])=max(.20,frequency)/.62*(.25*rho*wingArea*thrustCoefficient*1.50*(.34*span*localStroke[i])^2*localWet[i]-wingWake[i]);
    strokeThrust[i]=wingWake[i]*localWet[i];
  end for;
  centerOfMass=state[1:3]+.10*R*(wingCenter[1,:]+wingCenter[2,:]);
  centerVelocity=state[4:6]+.10*R*(cross(omega,wingCenter[1,:]+wingCenter[2,:])+comRate[1,:]+comRate[2,:]);
  thrust=sum(strokeThrust);
  musclePower=sum(max(0,hingeTorque[i]*localStroke[i]) for i in 1:2);
  q=.5*rho*(u[1]^2+u[3]^2);
  normalFlow=atan2(-u[3],max(.25,u[1]));
  Cl=max(-.85,min(.85,3.1*normalFlow+(if glide then .003 else min(.10,.014*mass*g/(max(1,q)*wingArea)))));
  // Opposite wing pitch creates a roll couple. Local flow due to the
  // stroke supplies authority while hovering; a rotating wing also sees
  // incidence opposing its own roll rate, even with the command centred.
  bankTwist=if direct then .20*max(-1,min(1,finActions[4])) else max(-.20,min(.20,.70*(rollGoal-state[9])));
  rollSpeed=wingArm*state[12];
  foilSpeed=sqrt(u[1]^2+(wingArm*wingRate)^2);
  bankPressure=.5*rho*(foilSpeed^2+rollSpeed^2);
  pressureDifference=bankPressure*3.1*(bankTwist-atan2(rollSpeed,max(.03,foilSpeed)));
  pitchTwist=if direct then .26*max(-1,min(1,finActions[3])) else max(-.26,min(.26,.65*(pitchGoal-state[8])-.12*state[11]));
  pitchSpeed=chordArm*state[11];
  chordDifference=.5*rho*(foilSpeed^2+pitchSpeed^2)*3.1*(pitchTwist-atan2(pitchSpeed,max(.03,foilSpeed)));
  pressureLimit=.85*(q+.5*rho*((wingArm*wingRate)^2+rollSpeed^2+pitchSpeed^2));
  for i in 1:2 loop
    for j in 1:2 loop
      patchLoad[i,j]=.25*localWet[j]*wingArea*max(-pressureLimit,min(pressureLimit,q*Cl+
        (if i==1 then chordDifference else -chordDifference)+(if j==1 then pressureDifference else -pressureDifference)));
    end for;
    chordNormalLoad[i]=sum(patchLoad[i,:]);
    wingNormalLoad[i]=sum(patchLoad[:,i]);
  end for;
  wingLift=sum(wingNormalLoad);
  // Sweep one wing to brake locally and bias the stroke impulse toward
  // the opposite wing. A rotating wing also experiences a different inflow.
  yawBias=if direct then max(-1,min(1,finActions[5])) else max(-1,min(1,1.8*(.40*turn-state[10])));
  axialSpeed={u[1]-wingArm*state[10],u[1]+wingArm*state[10]};
  brakeArea=.075*wingArea*{max(0,yawBias),max(0,-yawBias)};
  for i in 1:2 loop
    wingAxialLoad[i]=strokeThrust[i]*(1+(if i==1 then -.85 else .85)*yawBias)
      -.5*rho*localWet[i]*(.5*dragArea+brakeArea[i])*axialSpeed[i]*abs(axialSpeed[i]);
  end for;
  // External pressure forces and chordwise pressure couples act on their
  // own wings. Both hinge efforts are internal to the floating tree.
  sideDrag=.5*rho*1.85*u[2]*abs(u[2])*wet;
  normalDrag=.5*rho*1.9*u[3]*abs(u[3])*wet;
  rootWeight=transpose(R)*{0,0,bodyProperties[1,1]*g*(.986*wet-1)};
  bottom=state[3]-.38-1.20*abs(sin(state[8]));
  ground=if enableContacts and bottom<bedHeight then max(0,7400*(bedHeight-bottom)-1800*state[6]) else 0;
  for i in 1:2 loop
    hingeLoss[i]=-45*localWet[i]*localStroke[i];
    wingPressureVelocity[i]=hingeLoss[i]/(wingArm-.48);
    lateralLoad[i]=-sin(wingJoints[i])*(wingNormalLoad[i]+wingPressureVelocity[i])*(if i==1 then 1 else -1);
    wingForce[i,:]={wingAxialLoad[i],lateralLoad[i],cos(wingJoints[i])*(wingNormalLoad[i]+wingPressureVelocity[i])};
    wingWeight[i,:]=transpose(R)*{0,0,bodyProperties[i+1,1]*g*(.986*localWet[i]-1)};
    tip[i,:]=MantaContact.wingPoint({-.62,(if i==1 then 2.58 else -2.58),0},wingJoints[i]);
    tipVelocity[i,:]=state[4:6]+R*(cross(omega,tip[i,:])+cross({(if i==1 then 1 else -1)*localStroke[i],0,0},
      tip[i,:]-{0,(if i==1 then .48 else -.48),0}));
    tipGap[i]=state[3]+R[3,:]*tip[i,:]-.17-bedHeight;
    tipBed[i,:]=transpose(R)*{0,0,if enableContacts and tipGap[i]<0 then max(0,-2600*tipGap[i]-300*tipVelocity[i,3]) else 0};
    foreMoment[i]=chordArm*(patchLoad[1,i]-patchLoad[2,i]);
    hingeLoad[i]=hingeTorque[i]+contactHinge[i]+(if i==1 then 1 else -1)*(
      cross(site[i,:]-{0,(if i==1 then .48 else -.48),0},wingForce[i,:])+
      cross(wingCenter[i,:]-{0,(if i==1 then .48 else -.48),0},wingWeight[i,:])+cross(tip[i,:]-{0,(if i==1 then .48 else -.48),0},tipBed[i,:]))*{1,0,0};
  end for;
  baseMoment=cross(site[1,:],wingForce[1,:])+cross(site[2,:],wingForce[2,:])+{0,-sum(foreMoment),0};
  finMoment={baseMoment[1],-baseMoment[2],baseMoment[3]};
  baseForce=tipBed[1,:]+tipBed[2,:]+wingForce[1,:]+wingForce[2,:]+wingWeight[1,:]+wingWeight[2,:]+rootWeight+{0,-sideDrag,-normalDrag}+transpose(R)*(contacts[1:3]+{0,0,ground});
  st=sin(state[8]);ct=cos(state[8]);sr=sin(state[9]);cr=cos(state[9]);
  pc=if abs(ct)<.001 then (if ct>=0 then .001 else -.001) else ct;
  omega={state[12]+st*state[10],-cr*state[11]+ct*sr*state[10],sr*state[11]+ct*cr*state[10]};
    acc=MantaTree.solve(bodyProperties,R,state[4:6]-currentVelocity,omega,wingJoints[1:2],wingJoints[3:4],
      baseMoment+cross(tip[1,:],tipBed[1,:])+cross(tip[2,:],tipBed[2,:])+transpose(R)*contacts[4:6]+cross(wingCenter[1,:],wingWeight[1,:])+cross(wingCenter[2,:],wingWeight[2,:]),baseForce,hingeLoad,wet,mass);
  rateBias={ct*state[11]*state[10],sr*state[12]*state[11]+(ct*cr*state[12]-st*sr*state[11])*state[10],
    cr*state[12]*state[11]-(ct*sr*state[12]+st*cr*state[11])*state[10]};
  angular=acc[1:3]-rateBias;
  der(x[1:3])=state[4:6];der(x[4:6])=acc[4:6];der(x[7:9])=state[10:12];
  der(x[10])=(sr*angular[2]+cr*angular[3])/pc;
  der(x[11])=-cr*angular[2]+sr*angular[3];
  der(x[12])=angular[1]-st*(sr*angular[2]+cr*angular[3])/pc;
  der(x[15])=1;der(requestAge)=1;
  annotation(experiment(StopTime=120,Interval=.02,Tolerance=1e-6),Documentation(info="<html><p>Reduced-order pectoral thrust and gliding after Fish et al., Aerospace 2016, doi:10.3390/aerospace3030020. Body dimensions, lift and drag coefficients and burst effort are simulation parameters. The airborne centre of mass follows ballistic motion until re-entry.</p></html>"));
end MantaRay;
