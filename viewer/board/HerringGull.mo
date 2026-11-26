// Adapted from Marine.Wildlife.HerringGull (CogniPilot modelica_models,
// Apache-2.0). The flight controller and flotation use the original parameters.
// The articulated wing and leg kinetics and strip velocities are specific to this rig.
model HerringGull "Flap-gliding herring gull with paired wing strips and a trimming tail"
  // Fit to the swept wing planform, in hinge-local metres. Integrate chordwise
  // strips weighted toward the leading structure and tapered toward the tip.
  // The 54 g per side and its 40/14 g split are dry-mass estimates.
  function wingCrossMoments
    output Real products[4,3] "Central inertia matrix entries Ixy, Ixz, Iyz [kg m2]";
  algorithm
    products:=[-.000018906,-.000002658,-.000035509;
                .000042299,-.000006624,.000014013;
                .000018906,-.000002658,.000035509;
               -.000042299,-.000006624,-.000014013];
  end wingCrossMoments;
  function dryLinks "Mass, local centre of mass and diagonal of the central inertia tensor for each link"
    input Real mass,pitchInertia;
    output Real properties[7,7];
  algorithm
    properties:=[mass-.128-.012,0,0,0,.018,pitchInertia,.023;
      .040,-.00672,.12289,.01722,.00026579,.00020315,.00045125;
      .014,-.04175,.12119,-.01378,.00009288,.00006869,.00015640;
      .040,-.00672,-.12289,.01722,.00026579,.00020315,.00045125;
      .014,-.04175,-.12119,-.01378,.00009288,.00006869,.00015640;
      .010,0,0,-.045,.00002,.00002,.00001; .010,0,0,-.045,.00002,.00002,.00001];
  end dryLinks;
  function fanProperties "Twelve rectrices and caudal musculature about their shared centre"
    input Real spread "Outer rectrix angle from the backbone [rad]";
    output Real p[7];
  protected
    Real span,length;
  algorithm
    span:=.054+.36*sin(spread);
    length:=.18*(.65+.35*cos(spread));
    p:={.012,-.50*length,0,0,.012*(span^2+.008^2)/12,.012*(length^2+.008^2)/12,.012*(span^2+length^2)/12};
  end fanProperties;
  // Wing hinges include the apparent inertia of the accelerated spanwise strips.
  // At a 0.10 m stroke radius, each fully submerged web entrains an effective 85 g of water.
  function jointDynamics
    input Real mass,pitchInertia,q[8],speed[14],effort[14],footWet[2],spread,shoulderSweep,wristSweep,incidence;
    output Real accel[14];
  protected
    constant Integer parent[9]={0,1,2,1,4,1,1,1,8};
    constant Real jointOrigin[8,3]=[.009,.038,.029;0,.303,.033;.009,-.038,.029;0,-.303,.033;-.096,.042,-.050;-.096,-.042,-.050;-.158,0,.024;0,0,0];
    constant Real hingeAxis[8,3]=[1,0,0;1,0,0;-1,0,0;-1,0,0;0,1,0;0,1,0;0,-1,0;1,0,0];
    Real mount[8,3,3],products[4,3],inertia[3,3];
    Real spatialMass[9,6,6],tail[7],properties[7,7];
    Real H[14,14],bias[14];
  algorithm
    properties:=dryLinks(mass,pitchInertia);
    products:=wingCrossMoments();
    mount:={identity(3) for i in 1:8};
    for k in 1:2 loop
      mount[2*k-1,:,:]:=MultiBodyLie.Math.axisRotation({0,0,3-2*k},shoulderSweep)*
        MultiBodyLie.Math.axisRotation({0,2*k-3,0},incidence);
      mount[2*k,:,:]:=MultiBodyLie.Math.axisRotation({0,0,3-2*k},wristSweep);
    end for;
    for i in 1:7 loop
      inertia:=diagonal(properties[i,5:7]);
      if i>=2 and i<=5 then
        inertia[1,2]:=products[i-1,1];inertia[2,1]:=inertia[1,2];
        inertia[1,3]:=products[i-1,2];inertia[3,1]:=inertia[1,3];
        inertia[2,3]:=products[i-1,3];inertia[3,2]:=inertia[2,3];
      end if;
      spatialMass[i,:,:]:=MultiBodyLie.Math.spatialInertia(properties[i,1],properties[i,2:4],inertia);
    end for;
    spatialMass[8,:,:]:=zeros(6,6);
    tail:=fanProperties(spread);
    spatialMass[9,:,:]:=MultiBodyLie.Math.spatialInertia(tail[1],tail[2:4],diagonal(tail[5:7]));
    (H,bias,accel):=MultiBodyLie.Math.floatingTreeDynamics(parent,jointOrigin,
      mount,hingeAxis,q,speed,spatialMass,
      {.0011,.00038,.0011,.00038,.00010+.00085*footWet[1],.00010+.00085*footWet[2],.00060,.00040},zeros(3),effort);
  end jointDynamics;
  function wingLoads "Wind-relative moving blade elements with unsteady circulation"
    input Real area,span,rho,courseE,courseN,airForward,airSide,vertical,bank,pitch,rollRate,differential,sweep,gamma,launch;
    input Real gradient[4],panelAngle[4],joints[12],flowMemory[48];
    output Real loads[108];
  protected
    constant Real side[4]={-1,-1,1,1};
    Integer j;
    Real aft,lateral,east,north,du,dv,localSide,tilt,normal,incidence,chord,chordwiseFlow;
  constant Integer sectionLink[12]={1,1,1,2,2,2,3,3,3,4,4,4};
  constant Real station[6]={.0505,.1515,.2525,.354,.456,.558};
  constant Real localChord[6]={.228,.226,.195,.156,.113,.071};
  Real sectionAlpha[12],effectiveAlpha[12],sectionSpeed[12],normalVelocity[12],foldRatio[12],sectionArea[12];
  Real sectionCL[12],sectionCD[12],attached[12],stationArm[12],localStroke[12],sectionLift[12],sectionDrag[12],meanDownwash;
  algorithm
  // Finite-span induced incidence from the previous circulatory load.
  meanDownwash:=0;
  for i in 1:12 loop
    j:=sectionLink[i]; chord:=localChord[mod(i-1,6)+1];
    foldRatio[i]:=if mod(j,2)==0 then 1-.30*sweep else 1-.04*sweep;
    sectionArea[i]:=area*.5*chord/.989*foldRatio[i];
    meanDownwash:=meanDownwash+5.7*flowMemory[i]*sectionArea[i]/(3.14159265*.86*span^2);
  end for;
  for i in 1:12 loop
    // Six blade elements from each shoulder to its primary feather tips.
    j:=sectionLink[i];
    stationArm[i]:=if mod(sectionLink[i],2)==1 then station[mod(i-1,6)+1]*cos(panelAngle[sectionLink[i]])
      else .303*cos(panelAngle[max(1,sectionLink[i]-1)])+(station[mod(i-1,6)+1]-.303)*cos(panelAngle[sectionLink[i]])*foldRatio[i];
    localStroke[i]:=if mod(sectionLink[i],2)==1 then stationArm[i]*joints[6+sectionLink[i]]
      else .303*cos(panelAngle[max(1,sectionLink[i]-1)])*joints[5+sectionLink[i]]+
        (stationArm[i]-.303*cos(panelAngle[max(1,sectionLink[i]-1)]))*(joints[5+sectionLink[i]]+joints[6+sectionLink[i]]);
    // Sample the horizontal wind gradient at the moving quarter chord.
    lateral:=-side[j]*(.038+stationArm[i]);
    aft:=-.045-.12*sweep*station[mod(i-1,6)+1]/.558;
    east:=aft*courseE-lateral*courseN;
    north:=aft*courseN+lateral*courseE;
    du:=gradient[1]*east+gradient[2]*north;
    dv:=gradient[3]*east+gradient[4]*north;
    chordwiseFlow:=airForward-du*courseE-dv*courseN+.46*launch*localStroke[i];
    localSide:=airSide+du*courseN-dv*courseE;
    tilt:=-side[j]*panelAngle[j]-bank;
    normalVelocity[i]:=(vertical+localStroke[i]+side[j]*(.038+stationArm[i])*rollRate)*cos(tilt)-localSide*sin(tilt);
    sectionSpeed[i]:=max(.25,sqrt(chordwiseFlow^2+normalVelocity[i]^2));
    incidence:=atan2(.95*normalVelocity[i]+.05*flowMemory[36+i],chordwiseFlow);
    sectionAlpha[i]:=.065+pitch+side[j]*differential-incidence-meanDownwash+
      (if mod(j,2)==1 then .26 else .47)*(incidence-gamma);
    // Two exponential Wagner states (Jones approximation) convect with local reduced time.
    loads[i]:=.091*sectionSpeed[i]/localChord[mod(i-1,6)+1]*(sectionAlpha[i]-flowMemory[i]);
    loads[12+i]:=.600*sectionSpeed[i]/localChord[mod(i-1,6)+1]*(sectionAlpha[i]-flowMemory[12+i]);
    effectiveAlpha[i]:=.5*sectionAlpha[i]+.165*flowMemory[i]+.335*flowMemory[12+i];
    // Separation lags incidence; a separated plate carries normal pressure drag.
    attached[i]:=max(0,min(1,(.48-abs(sectionAlpha[i]))/.20));
    loads[24+i]:=(attached[i]-flowMemory[24+i])*min(65,sectionSpeed[i]/(4*localChord[mod(i-1,6)+1]));
    sectionCL[i]:=flowMemory[24+i]*max(-1.55,min(1.55,5.7*effectiveAlpha[i]))+(1-flowMemory[24+i])*1.1*sin(2*sectionAlpha[i]);
    sectionCD[i]:=.012+.044*sectionCL[i]^2+(1-flowMemory[24+i])*1.6*sin(sectionAlpha[i])^2;
    // A convective lag on the sampled normal flow retains stroke-reversal history.
    loads[36+i]:=65*(normalVelocity[i]-flowMemory[36+i]);
    sectionLift[i]:=.5*rho*sectionArea[i]*sectionSpeed[i]^2*sectionCL[i];
    sectionDrag[i]:=.5*rho*sectionArea[i]*sectionSpeed[i]^2*sectionCD[i];
    normal:=(sectionLift[i]*chordwiseFlow-sectionDrag[i]*normalVelocity[i])/sectionSpeed[i];
    loads[48+i]:=(-sectionLift[i]*normalVelocity[i]-sectionDrag[i]*chordwiseFlow)/sectionSpeed[i];
    loads[60+i]:=normal*cos(tilt);
    loads[72+i]:=-normal*sin(tilt);
    // Virtual work at each shaft accounts for its downstream force stations.
    loads[84+i]:=normal*(if mod(j,2)==1 then station[mod(i-1,6)+1] else
      .303*cos(panelAngle[j]-panelAngle[max(1,j-1)])+(station[mod(i-1,6)+1]-.303)*foldRatio[i]);
    loads[96+i]:=if mod(j,2)==0 then normal*(station[mod(i-1,6)+1]-.303)*foldRatio[i] else 0;
  end for;
  end wingLoads;
  function paddleLoad "Force on a spread or feathered foot at the actual waterplane"
    input Real side,hip,hipRate,ankle,ankleRate,spread,pitch,bank;
    input Real pitchRate,rollRate,yawRate,surge,sway,heave,height,slopeX,slopeY;
    output Real load[8] "Forward, port and up force; roll, pitch, yaw moments; hip moment, immersion";
  protected
    Real body[3,3],leg[3,3],web[3,3],anklePoint[3],r[3],hub[3],tip[3],n[3],u[3],f[3],moment[3],hinge[3];
    Real wet,drag,normalFlow,area;
  algorithm
    body:=MultiBodyLie.Math.axisRotation({0,1,0},-pitch)*MultiBodyLie.Math.axisRotation({1,0,0},-bank);
    leg:=body*MultiBodyLie.Math.axisRotation({0,1,0},hip);
    web:=leg*MultiBodyLie.Math.axisRotation({0,1,0},ankle);
    hub:=body*{-.096,side*.042,-.050};
    hinge:=body*{0,1,0};
    anklePoint:=leg*{-.077,0,-.073};
    tip:=web*{.043,0,-.008};
    r:=hub+anklePoint+tip;
    n:=web*{0,0,1};
    u:={surge,sway,heave}+cross({-rollRate,-pitchRate,yawRate},r)
      +hipRate*cross(hinge,anklePoint+tip)+ankleRate*cross(hinge,tip);
    wet:=max(0,min(1,.5+(slopeX*r[1]+slopeY*r[2]-height-r[3])/(.012+.065*abs(web[3,1]))));
    normalFlow:=n*u;
    // Three toes spread their web across the flow on the power stroke.
    // Pressure and skin drag both remove energy from the relative flow.
    area:=.00315*spread;
    drag:=.5*1025*wet*area;
    f:=-drag*(1.24*abs(normalFlow)*normalFlow*n+.045*sqrt(u*u)*u);
    moment:=cross(r,f);
    load:=cat(1,f,moment,{hinge*cross(r-hub,f),wet});
  end paddleLoad;
  parameter Real mass=.705,span=1.35,area=.200,rho=1.225;
  parameter Real startState[8]={4,-12,8,0,13.4,0,0,0};
  parameter Real startMemory[7]={0,0,.015,0,0,0,1};
  parameter Real startWaterMode=0 "0 flying, 1 swimming awaiting release, 2 swimming ready";
  parameter Real beatFrequency=3.13,rollInertia=.027,pitchInertia=.0057;
  parameter Real maxMusclePower=35 "Combined positive shaft work limit [W]";
  input Real wind[2],seaLevel,offset,glideOnly;
  input Real gust[2]=zeros(2) "Local wind minus the mean, ENU [m/s]";
  input Real windGradient[4]=zeros(4) "dEast/dE, dEast/dN, dNorth/dE, dNorth/dN [1/s]";
  parameter Real startSide=0 "Initial port velocity over ground [m/s]";
  output Real lateralSpeed(start=startSide,fixed=true) "Horizontal port velocity over ground [m/s]";
  input Real waterCurrent[2]=zeros(2),surfaceVerticalSpeed=0;
  input Real waterSlope[2]=zeros(2) "Local elevation gradients east and north";
  input Real pilot[4]=zeros(4) "Manual enable, climb, left bank, flap or glide";
  input Real straightFlight=0 "Hold initial heading for straight-flight comparisons",trimSpeed=12.7;
  discrete Real flapping(start=startMemory[7],fixed=true);
  output Real x[8](start=startState,each fixed=true) "ENU, heading, horizontal forward speed over ground, vertical speed, phase and stroke amplitude";
  output Real wings[4] "Shoulder elevation, folded wrist angle, sweep and left bank";
  output Real memory[7] "Bank, roll rate, nose-up pitch, pitch rate, differential incidence, tail incidence, flap latch";
  output Real power "Positive mechanical work rate of the six shafts [W]";
  output Real moments[2] "Roll and pitch moments about the centre of mass [N m]";
  parameter Real startTail[5]={0,0,0,.30,0};
  output Real tailState[6] "Incidence, cant, their two rates, fan half angle and airborne yaw rate [rad, rad/s]";
  output Real tailProperties[7] "Tail mass, local COM and moments, SI";
  output Real tailGeometry[2] "Projected fan area [m2] and aft centre of pressure distance [m]";
  output Real tailTurnMoment "Aerodynamic yaw moment about the body from the aft fan [N m]";
  output Real tailLift "Positive upward tail force in the longitudinal plane [N]";
  output Real surfaceMotion[6] "Immersion, local airspeed, water-relative speed, water mode, port and starboard paddle commands";
  parameter Real startWake=0;
  output Real launchWakePower(start=startWake,fixed=true) "Cycle-smoothed positive wing shaft work during launch, W";
  parameter Real startPaddle[3]={0,.55,.55};
  output Real paddleState[3](start=startPaddle,each fixed=true) "Water yaw rate and two ankle articulation angles";
  output Real webSpread[2] "Hydrodynamic width of the port and starboard webs, relative to full span";
  output Real footLoads[2,8] "Course-axis foot forces and moments, shaft moment, and fraction immersed";
  parameter Real startJoints[12]={.095,0,.095,0,1.18,1.18,0,0,0,0,0,0};
  output Real joints[12](start=startJoints,each fixed=true) "Port shoulder/wrist, starboard shoulder/wrist, port/starboard hip, then rates";
  output Real wingProducts[4,3] "Off-diagonals of the four dry wing tensors";
  output Real bodyProperties[7,7] "Dry mass, local centre, principal moments for physics inspection";
  output Real hingeLoad[6] "External fluid moments about each revolute shaft, N m";
  output Real shaftTorque[6] "Limited muscle servo moments, N m";
  parameter Real startFlow[48]=cat(1,fill(.08,24),ones(12),zeros(12));
  output Real flowMemory[48](start=startFlow,each fixed=true) "Wagner slow/fast incidence, attached fraction and normal velocity history";
  output Real sectionForce[12,2] "Forward and vertical aerodynamic loads per span station, N";
protected
  Real wingTuck,shoulderSweep,wristSweep;
  Real bank(start=startMemory[1],fixed=true),rollRate(start=startMemory[2],fixed=true);
  Real pitch(start=startMemory[3],fixed=true),pitchRate(start=startMemory[4],fixed=true);
  Real differential(start=startMemory[5],fixed=true),tailTrim(start=startMemory[6],fixed=true);
  Real tailCant(start=startTail[1],fixed=true),tailPitchRate(start=startTail[2],fixed=true),tailCantRate(start=startTail[3],fixed=true);
  Real tailFan(start=startTail[4],fixed=true),airYaw(start=startTail[5],fixed=true);
  Real fanCommand,cantCommand,tailCantLoad,tailPitchLoad,tailMuscles[2],tailUp,tailTilt,tailKeelForce,tailMomentArm,desiredYawMoment;
  Real zTarget,orbit,airCourse,headingError,bankTarget,drive,rate,stroke,sweep,strokeRate;
  Real gamma,pressure,refCl,desiredVz,pitchTarget,tailCommand,rollCommand;
  Real arm[4],side[4],strokeVz[4],fx[4],fz[4];
  Real airForward,airSide,waterLateral,tailForward,tailSide,tailNormal,tailSpeed,tailSideForce,bodySideForce;
  Real lift,forward,scale,tailAngle,tailCl,tailPressure,tailDrag,bodyDrag;
  Real courseE,courseN,airSpeed,gustCross,groundSpeed,waterSpeed,waterSide,windSide;
  Real diskForce,diskSpeed,launchForward,wingExposed,strokeAmplitude,depth,wet,swimCommand,launchCommand,runAssist,wingLift,waterThrust,waterDrag,buoyancy;
  // Hydrostatic small-angle stiffness = density * g * waterplane second moment.
  // Elliptical waterplane semi-axes at steady swimming draft, in metres.
  parameter Real waterLength=.175,waterBeam=.080;
  Real wetRoll,wetPitch,wetYaw,yawRate;
  discrete Real waterMode(start=startWaterMode,fixed=true);
  Real takeoffRequested;
  Real waterCoupling,paddleTurn,portPaddle,starboardPaddle;
  Real targetAngle[6],targetSpeed[6],panelAngle[4],accel[14];
  Real limitTorque[6],driveTorque[6],servoLoad[6],actuatorWork,desiredRollMoment,desiredPitchMoment,loads[108];
  Real footCommand[2],footPhase[2],grip[2],ankleRate[2],bladeEngagement[2],paddlePose,launchStroke,launchSwing,launchSpread[2],ankleTarget[2];
equation
  wingProducts=wingCrossMoments();
  bodyProperties=dryLinks(mass,pitchInertia);
  courseE=cos(x[4]);courseN=sin(x[4]);
  airForward=groundSpeed-(wind[1]+gust[1])*courseE-(wind[2]+gust[2])*courseN;
  airSpeed=max(.25,airForward);
  airSide=lateralSpeed-windSide-gustCross;
  waterLateral=lateralSpeed+waterCurrent[1]*courseN-waterCurrent[2]*courseE;
  gustCross=-gust[1]*courseN+gust[2]*courseE;
  groundSpeed=x[5];
  waterSpeed=groundSpeed-waterCurrent[1]*courseE-waterCurrent[2]*courseN;
  windSide=-wind[1]*courseN+wind[2]*courseE;
  waterSide=-waterCurrent[1]*courseN+waterCurrent[2]*courseE+.035*(windSide+gustCross);

  // The belly first immerses 9.3 cm below the body origin. A further 5 cm
  // of draft displaces the gull's weight. Damping opposes motion relative
  // to the water and the immersion fades both forces in at contact.
  depth=max(0,seaLevel+.093-x[3]);
  wet=min(1,depth/.05);
  buoyancy=max(0,mass*9.81*depth/.05-14*wet*(x[6]-surfaceVerticalSpeed));
  swimCommand=if noEvent(pilot[1]>.5) then min(1,max(0,pilot[4])) else 0;
  takeoffRequested=if noEvent(pilot[1]>.5 and pilot[2]>.15 and pilot[4]>.15 and glideOnly<.5) then 1 else 0;
  // An immersed landing latches the swim mode across brief loss of contact
  // on wave crests. A launch requires a new climb-and-flap gesture.
  when sample(0,.05) then
    waterMode=if pre(waterMode)<.5 then (if wet>.45 then 1 else 0)
      elseif pre(waterMode)<1.5 then (if takeoffRequested>.5 then 1 else 2)
      elseif takeoffRequested>.5 and x[3]-seaLevel>.35 and x[6]>surfaceVerticalSpeed then 0
      else 2;
  end when;
  launchCommand=if noEvent(takeoffRequested>.5 and (waterMode<.5 or waterMode>1.5))
    then min(1,pilot[2])*swimCommand else 0;
  waterCoupling=if waterMode>.5 then max(wet,1-launchCommand) else wet;
  // A running launch uses leg strokes first. Low-speed wing thrust and lift
  // then fade into the strip model as flying speed and height increase.
  runAssist=launchCommand*min(1,max(0,(12.5-airSpeed)/4))*min(1,max(0,(7-(x[3]-seaLevel))/4));
  wingExposed=1-waterCoupling*(1-launchCommand);
  // Reduced-order momentum closure at low advance ratio. The swept-wing
  // disk is fed exclusively by measured positive shoulder/wrist work.
  der(launchWakePower)=(runAssist*sum(max(0,shaftTorque[j]*joints[6+j]) for j in 1:4)-launchWakePower)/.10;
  diskSpeed=max(0,.44*airForward+.90*x[6]);
  diskForce=runAssist*(2*rho*.94*(.82*max(0,launchWakePower))^2+1e-12)^(1/3)
    /(1+.17*diskSpeed);
  launchForward=.44*diskForce;
  wingLift=.90*diskForce;
  // The feet can stroke in opposite directions, turning the bird in place
  // with no net forward paddle thrust.
  paddleTurn=if noEvent(pilot[1]>.5) then pilot[3] else 0;
  portPaddle=swimCommand*max(0,1-2.8*max(0,paddleTurn))-.94*paddleTurn;
  starboardPaddle=swimCommand*max(0,1-2.8*max(0,-paddleTurn))+.94*paddleTurn;
  footCommand={max(-1,min(1,portPaddle)),max(-1,min(1,starboardPaddle))};
  launchStroke=launchCommand*max(0,min(1,(.32-(x[3]-seaLevel))/.20));
  paddlePose=max(waterCoupling,launchStroke);
  // A launch loads both webs together with a short downward extension.
  // At the top of the recovery the legs are drawn up behind the pelvis.
  launchSwing=tanh(1.75*cos(x[7]));
  waterThrust=footLoads[1,1]+footLoads[2,1];
  waterDrag=(.12+.22*(1-runAssist))*waterSpeed+(.32-.14*runAssist)*waterSpeed*abs(waterSpeed);
  wetRoll=atan(-waterSlope[1]*courseN+waterSlope[2]*courseE);
  wetPitch=.23+atan(waterSlope[1]*courseE+waterSlope[2]*courseN);
  wetYaw=paddleState[1];
  der(paddleState[1])=(footLoads[1,6]+footLoads[2,6]-.028*wetYaw-.012*wetYaw*abs(wetYaw))/.026;

  zTarget=seaLevel+9+2*offset;
  when sample(0,.1) then
    flapping=if airSpeed<trimSpeed-1.1 or x[3]<zTarget-.8 then 1
      elseif airSpeed>trimSpeed+.2 and x[3]>zTarget+.6 then 0 else pre(flapping);
  end when;
  // These input modes are held between communication points. Their changes
  // already arrive at a step boundary, so they need no continuous root search.
  drive=(1-waterCoupling*(1-launchCommand))*(if noEvent(glideOnly>.5 or (pilot[1]>.5 and pilot[4]<-.15)) then 0
    elseif noEvent(pilot[1]>.5 and pilot[4]>.15) then 1 else flapping);
  rate=2*3.14159265*(if waterMode>.5 and launchCommand<.15 then
    .85+1.55*max(abs(footCommand[1]),abs(footCommand[2])) else beatFrequency*(1+.43*runAssist));
  der(x[8])=(drive-x[8])/.32;
  der(x[7])=rate;
  strokeAmplitude=.64+.42*runAssist;
  stroke=.095+strokeAmplitude*x[8]*sin(x[7]);
  strokeRate=strokeAmplitude*(der(x[8])*sin(x[7])+x[8]*rate*cos(x[7]));
  sweep=x[8]*(1+cos(x[7]))/2;
  wingTuck=min(1,1.5*(if waterMode>.5 then 1 else wet))*(1-max(0,min(1,x[8])));
  shoulderSweep=1.30*wingTuck;
  wristSweep=.50*sweep*(1-wingTuck)+1.73*wingTuck;
  orbit=if noEvent(straightFlight>.5) then startState[4] else
    atan2(x[2]+15,x[1]-3)+1.571+atan((sqrt((x[2]+15)^2+(x[1]-3)^2)-23-6*offset)/13);
  // Crab into the crosswind to hold the requested course over the harbour.
  airCourse=if noEvent(straightFlight>.5) then orbit else orbit+asin(max(-.94,min(.94,
    ((wind[1]+gust[1])*sin(orbit)-(wind[2]+gust[2])*cos(orbit))/max(2,airSpeed))));
  headingError=atan2(sin(airCourse-x[4]),cos(airCourse-x[4]));
  bankTarget=if noEvent(pilot[1]>.5) then .70*pilot[3] else max(-.70,min(.70,1.25*headingError));
  rollCommand=max(-.095,min(.095,.16*(bankTarget-bank)-.040*rollRate));
  der(differential)=max(-.95,min(.95,(rollCommand-differential)/.10));

  gamma=atan2(x[6],max(1,airSpeed));
  pressure=.5*rho*(airSpeed^2+x[6]^2);
  refCl=mass*9.81/max(1,pressure*area*cos(bank));
  desiredVz=(if noEvent(pilot[1]>.5) then 3*pilot[2]+.8*min(0,pilot[2])*max(0,min(1,(x[3]-seaLevel-3)/5))+max(0,min(2,.9*(seaLevel+2-x[3])))
            elseif noEvent(glideOnly>.5) then -.65 else max(-1,min(1.35,.55*(zTarget+2.3-x[3]))))+
            max(-2,min(1.5,.75*(airSpeed-trimSpeed)));
  pitchTarget=max(-.45,min(.52-.25*runAssist,gamma+refCl/4.7-.065+.075*(desiredVz-x[6])));
  tailCommand=max(-.30,min(.30,-.73*(pitchTarget-pitch)+.076*pitchRate));
  // Young (2023) observed mainly banked, furled-tail turns in gliding gulls.
  // Tuck in cruise; fan for low advance speed and when flaring near the water.
  fanCommand=.30+(1-waterCoupling)*.59*max(max(0,min(1,(12.0-airSpeed)/5)),
    max(0,min(1,(2.3-(x[3]-seaLevel))/1.8))*max(0,min(1,-x[6]/.50)));
  der(tailFan)=max(-2.8,min(2.8,(fanCommand-tailFan)/.19));
  cantCommand=(1-waterCoupling)*max(-.12,min(.12,.085*bankTarget+.15*atan2(airSide,max(2,airSpeed))));
  der(tailTrim)=tailPitchRate; der(tailCant)=tailCantRate;
  der(tailPitchRate)=accel[13]; der(tailCantRate)=accel[14];
  tailState={tailTrim,tailCant,tailPitchRate,tailCantRate,tailFan,airYaw};
  tailProperties=fanProperties(tailFan);
  // A tapered 18 cm fan, with the feather roots spanning 5.4 cm.
  tailGeometry={.18*.072+.18^2*tailFan,.158+.18*(.45+.105*sin(tailFan)/max(.15,tailFan))};
  tailMomentArm=tailGeometry[2]-.158;
  tailPitchLoad=-wingExposed*tailMomentArm*tailUp;
  tailCantLoad=-wingExposed*.006*tailKeelForce;
  tailMuscles={max(-.40,min(.40,1.05*(tailCommand-tailTrim)-.074*tailPitchRate-tailPitchLoad)),
    max(-.20,min(.20,.38*(cantCommand-tailCant)-.032*tailCantRate-tailCantLoad))};


  for j in 1:4 loop
    side[j]=if j<=2 then -1 else 1;
    panelAngle[j]=if mod(j,2)==1 then joints[j] else joints[j-1]+joints[j];
    arm[j]=span*(if mod(j,2)==1 then .12 else .36)*(1-(if mod(j,2)==1 then .03 else .27)*sweep);
    strokeVz[j]=if mod(j,2)==1 then (arm[j]-.038)*cos(panelAngle[j])*joints[6+j]
      else .303*cos(joints[j-1])*joints[5+j]+(arm[j]-.341)*cos(panelAngle[j])*(joints[5+j]+joints[6+j]);
    fx[j]=sum(sectionForce[3*j-3+k,1] for k in 1:3);
    fz[j]=sum(sectionForce[3*j-3+k,2] for k in 1:3);
  end for;
  when sample(0,.005) then
    loads=wingLoads(area,span,rho,courseE,courseN,airForward,airSide,x[6],bank,pitch,rollRate,
    differential,sweep,gamma,runAssist,windGradient,panelAngle,joints,flowMemory);
  end when;
  der(flowMemory)=loads[1:48];
  sectionForce[:,1]=loads[49:60]; sectionForce[:,2]=loads[61:72];
  for k in 1:2 loop
    footPhase[k]=x[7]+(k-1)*3.14159265;
    grip[k]=.5+.5*tanh(.75*sign(footCommand[k])*joints[10+k]);
    bladeEngagement[k]=paddlePose*min(1,4*abs(footCommand[k]))*grip[k];
    launchSpread[k]=.5-.5*tanh(.62*joints[10+k]);
    webSpread[k]=.36+.64*((1-launchStroke)*bladeEngagement[k]+launchStroke*launchSpread[k]);
    ankleTarget[k]=(1-launchStroke)*((1-paddlePose)*.55+paddlePose*.78
      +bladeEngagement[k]*(min(2.65,1.52+pitch-joints[4+k])-.78))
      +launchStroke*(.78+launchSpread[k]*(.24+pitch-joints[4+k]-.78));
    ankleRate[k]=max(-26,min(26,42*(ankleTarget[k]-paddleState[1+k])));
    der(paddleState[1+k])=ankleRate[k];
    footLoads[k,:]=paddleLoad(if k==1 then 1 else -1,joints[4+k],joints[10+k],paddleState[1+k],ankleRate[k],webSpread[k],
      pitch,bank,pitchRate,rollRate,yawRate,waterSpeed,waterLateral,x[6]-surfaceVerticalSpeed,x[3]-seaLevel,
      waterSlope[1]*courseE+waterSlope[2]*courseN,-waterSlope[1]*courseN+waterSlope[2]*courseE);
    hingeLoad[4+k]=footLoads[k,7];
    hingeLoad[2*k-1]=wingExposed*sum(loads[84+6*(k-1)+i] for i in 1:6);
    hingeLoad[2*k]=wingExposed*sum(loads[96+6*(k-1)+i] for i in 4:6);
    targetAngle[2*k-1]=stroke;
    targetAngle[2*k]=-.40*sweep;
    targetSpeed[2*k-1]=strokeRate;
    targetSpeed[2*k]=.20*x[8]*rate*sin(x[7])-.2*der(x[8])*(1+cos(x[7]));
    targetAngle[4+k]=1.18*(1-paddlePose)+(paddlePose-launchStroke)*(-.68-1.16*abs(footCommand[k])*sin(footPhase[k]))
      +launchStroke*(.26+1.24*launchSwing);
    targetSpeed[4+k]=-(paddlePose-launchStroke)*1.16*abs(footCommand[k])*rate*cos(footPhase[k])
      -launchStroke*1.24*1.75*rate*sin(x[7])*(1-launchSwing^2);
  end for;
  for j in 1:6 loop
    servoLoad[j]=(if j>=5 then .65+.35*launchStroke elseif mod(j,2)==1 then 16 else 2.8)*(targetAngle[j]-joints[j])
      +(if j>=5 then .023 elseif mod(j,2)==1 then .16 else .039)*(targetSpeed[j]-joints[j+6])-hingeLoad[j];
    driveTorque[j]=if j>=5 then max(-.4-.5*launchStroke,min(.4+.5*launchStroke,servoLoad[j])) else max(-2.7,min(2.7,servoLoad[j]));
    shaftTorque[j]=driveTorque[j]*(if driveTorque[j]*joints[j+6]>0 then min(1,maxMusclePower/max(.001,actuatorWork)) else 1);
    // Ligament tension resists excursion past the anatomical hinge range.
    limitTorque[j]=if j>=5 then 0 elseif joints[j]>(if mod(j,2)==1 then 1.28 else .36) then
      -15*(joints[j]-(if mod(j,2)==1 then 1.28 else .36))-.18*max(0,joints[j+6])
      elseif joints[j]<(if mod(j,2)==1 then -1.24 else -1.14) then
      15*((if mod(j,2)==1 then -1.24 else -1.14)-joints[j])-.18*min(0,joints[j+6]) else 0;
    der(joints[j])=joints[j+6];
    der(joints[j+6])=accel[j+6];
  end for;
  actuatorWork=sum(max(0,driveTorque[j]*joints[j+6]) for j in 1:6);
  // Newton-Euler reactions traverse both serial wings and both legs back to
  // the torso. Position of the complete bird is carried at its centre of mass.
  desiredRollMoment=-footLoads[1,4]-footLoads[2,4]+wingExposed*moments[1]+wet*(1025*9.81*.7854*waterLength*waterBeam^3*sin(wetRoll-bank)-.18*rollRate);
  desiredPitchMoment=wingLift*max(-.12,min(.12,.035+.16*(pitchTarget-pitch)-.025*pitchRate))
    -footLoads[1,5]-footLoads[2,5]+wingExposed*moments[2]+wet*(1025*9.81*.7854*waterBeam*waterLength^3*sin(wetPitch-pitch)-.32*pitchRate);
  when sample(0,.005) then
    accel=jointDynamics(mass,pitchInertia,cat(1,joints[1:6],{tailTrim,tailCant}),cat(1,{-rollRate,-pitchRate,yawRate,0,0,0},joints[7:12],{tailPitchRate,tailCantRate}),
    cat(1,{-desiredRollMoment,-desiredPitchMoment,desiredYawMoment,forward+launchForward+waterThrust,footLoads[1,2]+footLoads[2,2],lift+buoyancy+wingLift+footLoads[1,3]+footLoads[2,3]},shaftTorque+hingeLoad+limitTorque,tailMuscles+{tailPitchLoad,tailCantLoad}),{footLoads[1,8],footLoads[2,8]},tailFan,shoulderSweep,wristSweep,differential);
  end when;
  scale=1; power=min(maxMusclePower,actuatorWork);
  tailForward=airForward+tailGeometry[2]*((windGradient[1]*courseE+windGradient[2]*courseN)*courseE
    +(windGradient[3]*courseE+windGradient[4]*courseN)*courseN);
  tailSide=airSide-tailGeometry[2]*yawRate+tailGeometry[2]*(-(windGradient[1]*courseE+windGradient[2]*courseN)*courseN
    +(windGradient[3]*courseE+windGradient[4]*courseN)*courseE);
  tailTilt=bank-tailCant;
  tailNormal=(x[6]-tailGeometry[2]*pitchRate-tailMomentArm*tailPitchRate)*cos(tailTilt)+tailSide*sin(tailTilt);
  tailSpeed=max(.25,sqrt(tailForward^2+tailNormal^2));
  tailAngle=pitch-atan2(tailNormal,tailForward)+tailTrim-.16*refCl;
  tailCl=max(-.95,min(.95,3.15*tailAngle));
  tailPressure=.82*.5*rho*(tailForward^2+tailNormal^2)*tailGeometry[1];
  tailLift=tailPressure*tailCl;
  tailDrag=tailPressure*(.014+.12*tailCl^2);
  tailUp=(tailLift*tailForward-tailDrag*tailNormal)/tailSpeed;
  lift=scale*sum(fz)+tailUp*cos(tailTilt);
  bodyDrag=.00077*airForward*sqrt(airForward^2+airSide^2+x[6]^2);
  bodySideForce=-.5*rho*.023*airSide*sqrt(airForward^2+airSide^2);
  tailKeelForce=-.5*rho*.009*tailSide*sqrt(tailForward^2+tailSide^2);
  tailSideForce=tailKeelForce+tailUp*sin(tailTilt);
  tailTurnMoment=-tailGeometry[2]*(tailKeelForce-tailUp*sin(tailCant));
  forward=scale*sum(fx)-(tailLift*tailNormal+tailDrag*tailForward)/tailSpeed-bodyDrag;
  // Positive left bank means the starboard wing rises. The aft tail sees
  // increased effective incidence in a nose-up pitch rate and damps the rate.
  moments[1]=scale*sum({side[j]*arm[j]*fz[j] for j in 1:4});
  moments[2]=(-.006-.015*sweep)*scale*sum(fz)-tailGeometry[2]*tailUp*cos(tailCant)-.050*pitchRate;
  der(bank)=rollRate;
  der(rollRate)=-accel[1];
  der(pitch)=pitchRate;
  der(pitchRate)=-accel[2];
  der(x[1])=groundSpeed*courseE-lateralSpeed*courseN;
  der(x[2])=groundSpeed*courseN+lateralSpeed*courseE;
  der(x[3])=x[6];
  // Crosswind on the aft tail turns the bill toward the oncoming air.
  // Wing banking supplies the coordinated turn. The fan's resolved side
  // load acts at its aft pressure centre and couples through the caudal joints.
  desiredYawMoment=wingExposed*(tailTurnMoment+.19*(sum(fz)*sin(bank)/(mass*max(2,airSpeed))-airYaw));
  der(airYaw)=(1-waterCoupling)*accel[3]+waterCoupling*(wetYaw-airYaw)/.08;
  yawRate=(1-waterCoupling)*airYaw+waterCoupling*wetYaw;
  der(x[4])=yawRate;
  der(x[5])=(wingExposed*forward+launchForward+waterThrust-waterCoupling*waterDrag)/mass
    +lateralSpeed*yawRate;
  der(lateralSpeed)=((1-waterCoupling)*(sum(loads[73:84])+bodySideForce+tailSideForce)
    +footLoads[1,2]+footLoads[2,2]+waterCoupling*(-1.8*waterLateral+bodySideForce))/mass-groundSpeed*yawRate;
  der(x[6])=(wingExposed*lift+buoyancy+wingLift+footLoads[1,3]+footLoads[2,3])/mass-9.81;
  wings={.5*(joints[1]+joints[3]),.5*(joints[2]+joints[4]),.50*sweep,bank};
  memory={bank,rollRate,pitch,pitchRate,differential,tailTrim,flapping};
  surfaceMotion={wet,airSpeed,waterSpeed,waterMode,waterCoupling*footCommand[1],waterCoupling*footCommand[2]};
end HerringGull;
