within;
package Wreck
  constant Real g=9.80665;
  constant Real rho=1025;
  constant Real pi=Modelica.Constants.pi;
  constant Real piccardDryMass=18, piccardKeel=.09325;
  constant Real piccardDisplacement=.0184 "Assumed total watertight volume including internal buoyancy";
  constant Real piccardWaterlineHalfHeight=.08, piccardInitialTankVolume=.00035;
  constant Real piccardDrag[3]={2,5.75,7.5} "Quadratic hull drag coefficients at the modeled projected areas";
  constant Real piccardLinearDrag=1.5;

  model Ocean = Marine.Environment.WaterColumn(shelterFactor=1) "Harbor waves and ambient background current";

  model Tank "Floodable piston tank, positive stroke admits seawater"
    parameter Real capacity=0.0008, maxFlow=0.000028, stallPressure=300000;
    input Real target, pressure;
    Real volume(stateSelect=StateSelect.always,start=piccardInitialTankVolume,fixed=true), pumpFlow(stateSelect=StateSelect.always,start=0,fixed=true), mass;
  equation
    der(pumpFlow)=(max(-1,min(1,(target-volume)/0.00005))*maxFlow*(if target<volume then max(0,1-pressure/stallPressure) else 1)-pumpFlow)/0.18;
    der(volume)=if (volume<=0 and pumpFlow<0) or (volume>=capacity and pumpFlow>0) then 0 else pumpFlow;
    mass=rho*volume;
  end Tank;

  function stationReached
    input Real station[3], east, north, depth;
    output Boolean reached;
  algorithm
    reached:=abs(station[1]-east)<.32 and abs(station[2]-north)<.24 and abs(.29-depth-station[3])<.28;
  end stationReached;

  function thrusterWaveHeights "Sample one wave tile at the six moving propeller disks"
    input Real tile[32,32], positions[6,3];
    output Real heights[6];
  algorithm
    for rotor in 1:6 loop
      heights[rotor]:=Perception.seaHeight(tile,positions[rotor,1],positions[rotor,2]);
    end for;
  end thrusterWaveHeights;

  model Plant
    inner MultiBodyLie.World world(n={0,0,-1});
    parameter Real spawnPosition[3]={-24,18,-9.8},spawnVelocity[3]=zeros(3),spawnHeading=pi/2;
    input Real hoist[8]=zeros(8) "Command (2 owner-confirmed mount, 1 ordinary capture, 0 free, -1 release), ENU sling position, velocity and heading";
    input Real hoistUp[3]={0,0,1} "Upper normal of the support forks in ENU";
    input Real hoistQuaternion[4]=zeros(4) "Carrier release attitude, body to ENU in wxyz order";
    input Real hoistAngularVelocity[3]=zeros(3) "Carrier angular velocity in ENU rad/s";
    Real forkNormal[3],forkOffset[3],forkHeight,forkYawError;
    Real releaseQ[4],forkForward[3],forwardPlane[3],measuredT[3,3],worldVelocity[3];
    Real carrierVelocity[3](start=spawnVelocity,each fixed=true);
    Boolean inCaptureZone;
    discrete Boolean forkSecured(start=false,fixed=true);
    parameter Real dryMass=piccardDryMass, displaced=piccardDisplacement;
    parameter Real drag[3]=piccardDrag, angularDrag[3]={.25,.375,.375};
    // Cross-flow moment for a uniform strip is rho*Cd*width*length^4/64.
    // The barrel and exposed frame envelope shadow one another. The six
    // outboard ducts contribute separately through their moment arms.
    parameter Real frameLength=.6025, frameBeam=.2275, frameHeight=.13425;
    parameter Real barrelLength=.542, barrelDiameter=.183;
    parameter Real frameCd=1.1, ductCdA=.006 "Estimated effective transverse area per open duct, m2";
    final parameter Real hullCrossflow[3]=rho*frameCd/64*{
      .495*frameBeam^4+frameLength*frameHeight^4,
      frameBeam*frameLength^4,
      barrelDiameter*barrelLength^4+frameHeight*(frameLength^4-barrelLength^4)};
    final parameter Real ductCrossflow[3]=rho*ductCdA/2*{
      sum((propMount[i,2]^2+propMount[i,3]^2)^1.5 for i in 1:6),
      sum((propMount[i,1]^2+propMount[i,3]^2)^1.5 for i in 1:6),
      sum((propMount[i,1]^2+propMount[i,2]^2)^1.5 for i in 1:6)};
    final parameter Real rotationalCrossflow[3]=hullCrossflow+ductCrossflow
      "Single-axis quadratic drag in still water, N.m per (rad/s)^2";
    Real hullResistance[3],ductWaterMoment[3],rotationalResistance[3];
    parameter Real motorLag(min=.001)=.14 "Thruster force time constant, s";
    parameter Real pilotPitchLimit(unit="rad")=pi/2 "Position and auto-level camera pitch travel";
    parameter Real manualRatePole[3](each min=.1)={4.5,4.2,3.6} "Roll, pitch and yaw rate loop bandwidth parameters, 1/s";
    parameter Real manualLevelPole[2](each min=.1)={4.3,4.1} "Roll and pitch angle loop bandwidth parameters, 1/s";
    parameter Real dryInertia[3]=piccardDryInertia(dryMass,barrelLength,barrelDiameter/2,frameLength,frameBeam,frameHeight,propMount);
    // Integrate the translational strip added masses times the squared lever arm.
    parameter Real addedInertia[3]={addedMass[3]*frameBeam^2+addedMass[2]*frameHeight^2,
      addedMass[3]*frameLength^2,addedMass[2]*frameLength^2}/12;
    Real angularInertia[3], wetTorque[3], throughFlowResistance[3];
    Real manualMoment[3], motorMoment[3], restoringArm[3], trimRate[3];
    Real angleError[3], referenceRate[3], angularPole[3];
    Real manualUp[3](start={0,0,1},each fixed=true) "Gyro-propagated gravity direction in body coordinates";
    Real measuredGravity[3], accelerationNorm;
    Boolean manualAttitude;
    MultiBodyLie.Parts.Body body(m=dryMass,I_11=dryInertia[1],I_22=dryInertia[2],I_33=dryInertia[3],
      angles_fixed=false,w_0_fixed=true,Q(start={cos(spawnHeading/2),0,0,sin(spawnHeading/2)},each stateSelect=StateSelect.always),w_a(each stateSelect=StateSelect.always),r_0(each stateSelect=StateSelect.always,start=spawnPosition,each fixed=true),v_0(start=spawnVelocity,each stateSelect=StateSelect.always,each fixed=true));
    MultiBodyLie.Forces.WorldForceAndTorque collision(resolveInFrame=MultiBodyLie.Types.ResolveInFrameB.world);
    MultiBodyLie.Forces.WorldForceAndTorque loads(resolveInFrame=MultiBodyLie.Types.ResolveInFrameB.frame_b);
    input Real windSpeed(start=11), windDirection(start=0.45);
    input Real hullSurfaceOffset=0, propSurfaceOffset[6]=zeros(6)
      "Additional local free-surface elevation at the hull and at each propeller [m]";
    input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
    input Real seaState=-1;
    Ocean ocean(seaClockOffset=seaClockOffset,pos=position,windSpeed=windSpeed,windDirection=windDirection,seaState=seaState);
    output Real waveHeight[SpectralSea.N,SpectralSea.N]=ocean.tile;
    output Real seaLevel=ocean.tide, windActual=ocean.wind;
    output Real specificForce[3]=if forkSecured then measuredT*((worldVelocity-carrierVelocity)/.10+{0,0,g}) else loads.force/dryMass;
    output Real rates[3]=if forkSecured then measuredT*hoistAngularVelocity else body.w_a;
    output Real gyroAngle[3](each start=0,each fixed=true) "Integrated gyro increments for the 5 Hz navigation packets";
    output Real attitude[2](each start=0,each fixed=true), verticalSpeed(start=0,fixed=true);
    Real accelAtt[2], vzDvl;
    parameter Real addedMass[3]={3,9,11};
    output Real contactForce[3],contactMoment[3] "Applied physical contact wrench in ENU";
    Real filteredForce[3](each start=0,each fixed=true,each stateSelect=StateSelect.always),filteredMoment[3](each start=0,each fixed=true,each stateSelect=StateSelect.always);
    input Real animalTraffic[10,9](each start=0),animalJoints[10,4](each start=0);
    discrete output Real mantaWrench[6](each start=0,each fixed=true) "Animal contact force and moment on the sub, ENU";
    input Real mappedCurrent[4](each start=0) "Map coverage flag and local CFD mean velocity in ENU m/s";
    input Real scanConstraints[8,10](each start=0) "Local two-sided scan contacts supplied by the host spatial index";
    input Real peerCruisers[9,14](each start=0) "Nearby free-contact cruiser poses and twists";
    input Real peerLiftStates[9,2](each start=0) "Per-cruiser lift level and stroke rate, same rows as peerCruisers";
    discrete output Real peerHullWrench[6](each start=0,each fixed=true);
    Real contactTarget[3],momentTarget[3],scanForce[3],scanMoment[3];
    Real netForce[3],effectiveMass[3];
    Tank fore, aft;
    input Real flood(start=0) "Positive command latches a breach until the next vehicle instance";
    parameter Real floodableVolume(unit="m3",min=1e-6)=.0032 "Assumed vented volume in the pressure housing";
    parameter Real breachArea(unit="m2",min=0)=.000030 "Effective opening after damage";
    discrete Boolean breached(start=false,fixed=true);
    Real filledFraction(start=0,fixed=true),floodMass(unit="kg");
    output Real floodState[4]={if breached then 1 else 0,filledFraction,floodMass,if battery.powered then 1 else 0}
      "Breach latch, flooded fraction, water mass (kg), powered bus (1/0)";
    PiccardPower battery(motorThrust=thrust,immersion=propWet,busConnected=if breached then 0 else 1,
      pumpPower=3*(abs(fore.pumpFlow)/fore.maxFlow+abs(aft.pumpFlow)/aft.maxFlow)
        +(max(0,-fore.pumpFlow)*fore.pressure+max(0,-aft.pumpFlow)*aft.pressure)/.5);
    output Real batteryTelemetry[5]={battery.stateOfCharge,battery.packVoltage,battery.packCurrent,battery.remainingAh,battery.busPower}
      "State of charge (fraction), pack voltage (V), pack current (A), remaining charge (Ah), regulated bus power (W)";
    input Real sensor[91];
    input Real navigationUp(unit="m",start=0) "Estimated vehicle height in ENU coordinates";
    input Real navigationUpValid(start=0) "Enable the external fused height estimate";
    input Real elevationRanges[100](each start=0) "Four elevation fans of 25 slant ranges, zero means no echo";
    input Real manual(start=0) "Enable manual control above 0.5";
    input Real manualMode(start=0) "0 position, 1 auto-level, 2 body-rate acro, 3 assisted translation";
    input Real attitudePilot[2](each start=0) "Normalized roll and pitch stick commands";
    input Real pilot[4](each start=0) "Body surge, port speed (banked translation mode), yaw rate and upward speed [m/s,m/s,rad/s,m/s]";
    parameter Real propellerDiameter=.085, thrustCoefficient=0.035, inceptionNumber=3.5;
    output Real propellerRPM[6], cavitation[6], appliedThrust[6];
    parameter Real propMount[6,3]=[.18,.16,0;.18,-.16,0;.0325,.16,0;.0325,-.16,0;-.215,.16,0;-.215,-.16,0] "Photo-estimated Piccard mounts, forward/port/up in metres";
    parameter Real propAxis[6,3]=[1,0,0;1,0,0;0,0,1;0,0,1;0,0,1;0,0,1];
    parameter Real propMomentArm[6,3]={cross(propMount[i,:],propAxis[i,:]) for i in 1:6};
    Real propPosition[6,3],propDiskHeight[6],diskCut[6],localSurface[6];
    output Real propWet[6];
    discrete Real currentFilter[19](start={0,0,0,.36,0,0,0,.36,0,0,0,.36,0,0,0,0,0,0,0},each fixed=true);
    output Real estimatedCurrent[2]=currentFilter[1:2] "Sensor-estimated horizontal water velocity in ENU, m/s";
    output Real currentEstimateSigma[2]={sqrt(max(0,currentFilter[4])),sqrt(max(0,currentFilter[8]))}
      "One-standard-deviation ENU uncertainties, m/s";
    Real tipDynamicPressure[6];
    output Real position[3]=if forkSecured then hoist[2:4] else body.r_0;
    discrete Real lastLaunch[9](start={-1,0,0,0,0,0,0,0,0},each fixed=true) "Time, ENU position and velocity, heading, vertical angular rate";
    output Real carrierFix[5]=if forkSecured then cat(1,{1},hoist[2:4],{hoist[8]})
      elseif time-lastLaunch[1]<.2 then cat(1,{1},lastLaunch[2:4]+(time-lastLaunch[1])*lastLaunch[5:7],{lastLaunch[8]+(time-lastLaunch[1])*lastLaunch[9]})
      else zeros(5)
      "Position and heading reported by the carrier at the rigid mount or launch handoff";
    output Real orientation[4]=if forkSecured then releaseQ else body.Q;
    output Real velocity[3]=if forkSecured then measuredT*worldVelocity else body.frame_a.v;
    output Real yawRate=rates[3], pressure=ocean.gaugePressure, current[3]=if mappedCurrent[1]>.5 then mappedCurrent[2:4]+ocean.probe[2:4] else ocean.velocity, tankLitres[2]=1000*{fore.volume,aft.volume}, motor[6]=thrust;
    output Real nav[3](start={spawnPosition[1],spawnPosition[2],spawnHeading},each fixed=true) "East, north, yaw from onboard sensors";
    output Real cornerScore, visualWeight;
    discrete Real edge[6](each start=0,each fixed=true), Ji[6,6](each start=0,each fixed=true), Jj[6,6](each start=0,each fixed=true);
    discrete Boolean edgeValid(start=false,fixed=true);
    Real trackWeight;
    final parameter Integer waypointCount=SurveyRoute.stations+1 "One full circuit, returning to its first station";
    output Integer surveySite(start=0,fixed=true) "0 before first survey, 1 Yatush, 2 Satil";
    discrete Integer startStation(start=1,fixed=true);
    discrete Boolean wasSurveying(start=false,fixed=true);
    discrete Real entryEast(start=spawnPosition[1],fixed=true),entryNorth(start=spawnPosition[2],fixed=true);
    Real previousGoal[3];
    output Integer waypoint(start=1,fixed=true);
    output Boolean surveyDone(start=false,fixed=true);
    output Real surveyTelemetry[16]=cat(1,{waypoint,waypointCount,if surveyDone then 1 else 0},appliedThrust,buoy,contactForce,{surveySite})
      "Survey station, total, completion, applied motor forces, body buoyancy, world contact and selected wreck";
    Real goal[3],eastError,northError,verticalError,surgeRef,depthEst,surge,yawCmd,heave,rollCmd,pitchCmd;
    Real goalDepth,headingError,approach,forwardError,legStart[2],legVector[2],legLength,lookback;
    Real pilotEast,pilotNorth;
    Real foreLift,aftLift;
    Boolean positionMode,acroMode,assistedMode,translate,dive;
    Real portSpeed,sideForce,verticalDemand,bankTarget,trimVolume,yawVelocity;
    Real yawHoldError(start=0,fixed=true) "Integrated heading change since the yaw stick was centered";
    Real heldStation[3](start={spawnPosition[1],spawnPosition[2],.29-spawnPosition[3]},each fixed=true) "Estimated east, north and pressure depth";
    Real holdE,holdN,positionSurge,heaveRef,portRef;
    Real stationBias[3](each start=0,each fixed=true) "Earth-frame trim force learned from stationary easting, northing and depth error";
    Real stationError[3];
    Real filteredDepth(start=.29-spawnPosition[3],fixed=true) "Pressure depth low-pass state for vertical velocity without bottom lock";
    Real cmd[6], thrust[6](each stateSelect=StateSelect.always,each start=0,each fixed=true), rel[3], up[3], buoy[3], ballast[3], wet;
    parameter Real airDensity=1.225, windageCdA[3]={.03,.08,.0625} "Exposed hull drag areas [m2]";
    parameter Real windageCenter[3]={.02,0,.06} "Centre of wind pressure in body axes [m]";
    output Real windForce[3] "Aerodynamic hull load in body axes [N]";
    Real apparentAir[3],trimMoment[3];
    Real heading,pitch,roll,manualBank,pilotPitch,steepWeight,unitUp[3],steepMoment[3],poleYawRate;
    Boolean stationEngaged;
    Real groundUp,groundForward;
    PiccardStationController stationControl(dryMass=dryMass,displaced=displaced,density=rho,
      addedMass=addedMass,linearDrag=piccardLinearDrag,surgeDrag=drag[1],swayDrag=drag[2],
      arm=propMount[3,2],foreX=propMount[3,1],aftX=propMount[5,1],
      active=if manual>.5 and manualMode<.5 and not forkSecured and (navigationUpValid>.5 or sensor[63]>.5) then 1 else 0,pose={sensor[60],sensor[61],depthEst},
      attitude={roll,pitch,heading},gyro=rates,groundSpeed={groundForward,portSpeed,groundUp},
      bottomLock=sensor[63],currentENU=estimatedCurrent,pilot=pilot,pitchReference=pilotPitch,
      netWeight=g*(dryMass+fore.mass+aft.mass-rho*displaced*wet),restoringMoment=trimMoment);
  initial equation
    body.Q[2]=0;
    body.Q[3]=0;
    body.Q[4]*cos(spawnHeading/2)=body.Q[1]*sin(spawnHeading/2);
  equation
    connect(loads.frame_b,body.frame_a);
    connect(collision.frame_b,body.frame_a);
    forkNormal=if hoistUp*hoistUp>.25 then hoistUp/sqrt(max(.25,hoistUp*hoistUp)) else {0,0,1};
    forkOffset=body.r_0-hoist[2:4];
    forkHeight=forkNormal*forkOffset;
    // A fork can carry a hull resting on it. A remote latch packet cannot
    // pull a submerged or distant hull back to a raised support.
    inCaptureZone=forkHeight>=-.12 and forkHeight<=.60
      and forkOffset*forkOffset-forkHeight^2<=.72^2;
    when {hoist[1]>.5 and inCaptureZone,hoist[1]>1.5,hoist[1]<=.5} then
      forkSecured=hoist[1]>.5;
    end when;
    when hoist[1]<-.5 then
      lastLaunch=cat(1,{time},hoist[2:7],{hoist[8],hoistAngularVelocity[3]});
    end when;
    forkYawError=hoist[8]-atan2(body.frame_a.R.T[1,2],body.frame_a.R.T[1,1]);
    forwardPlane={forkNormal[3]*cos(hoist[8]),forkNormal[3]*sin(hoist[8]),
      -forkNormal[1]*cos(hoist[8])-forkNormal[2]*sin(hoist[8])};
    forkForward=forwardPlane/sqrt(max(1e-10,forwardPlane*forwardPlane));
    releaseQ=if hoistQuaternion*hoistQuaternion>.25 then
      hoistQuaternion/sqrt(max(.25,hoistQuaternion*hoistQuaternion)) else
      LieGroups.SO3.Quat.from_DCM(transpose({forkForward,cross(forkNormal,forkForward),forkNormal}));
    measuredT=if forkSecured then MultiBodyLie.Math.quaternionToT(releaseQ) else body.frame_a.R.T;
    worldVelocity=if forkSecured then hoist[5:7] else body.v_0;
    der(carrierVelocity)=if forkSecured then (worldVelocity-carrierVelocity)/.10 else zeros(3);
    // Transfer the authoritative pose and rigid-body twist only for an accepted
    // carrier respawn or release. The FMI clock and sensor history continue.
    when {hoist[1]<-.5,hoist[1]>1.5} then
      reinit(body.r_0,hoist[2:4]);
      reinit(body.v_0,hoist[5:7]);
      reinit(body.Q,releaseQ);
      reinit(body.w_a,MultiBodyLie.Math.quaternionToT(releaseQ)*hoistAngularVelocity);
      reinit(carrierVelocity,hoist[5:7]);
      reinit(filteredForce,zeros(3));
      reinit(filteredMoment,zeros(3));
      reinit(heldStation,{hoist[2],hoist[3],.29-hoist[4]});
      reinit(yawHoldError,0);
      reinit(stationBias,zeros(3));
      reinit(filteredDepth,.29-hoist[4]);
    end when;
    // While carried, the prescribed carrier frame owns pose, motion and loads.
    // The dormant free body follows it to keep legacy zero-command detaches local.
    collision.force=if forkSecured then 320*(hoist[2:4]-body.r_0)+150*(hoist[5:7]-body.v_0) else filteredForce;
    collision.torque=if forkSecured then contactMoment+
      56*cross(body.frame_a.R.T[3,:],forkNormal)+40*atan2(sin(forkYawError),cos(forkYawError))*forkNormal
      +9*(hoistAngularVelocity-transpose(body.frame_a.R.T)*body.w_a) else zeros(3);

    der(gyroAngle)=rates;
    accelAtt={atan2(sensor[87],sensor[88]),atan2(-sensor[86],sqrt(sensor[87]^2+sensor[88]^2))};
    der(attitude)={sensor[89],sensor[90]}+1.5*(accelAtt-attitude);
    vzDvl=-sum(sensor[1:4])/(4*cos(pi/8));
    der(verticalSpeed)=sensor[88]-g+(if sensor[63]>0.5 then 4*(vzDvl-verticalSpeed) else -0.2*verticalSpeed);
    when sample(0,.2) then
      currentFilter=currentStep(pre(currentFilter),sensor[63]>.5 and sensor[59]>rho*g*.35,forkSecured,
        {roll,pitch,sensor[62]},{sensor[64],sensor[65],-sum(sensor[1:4])/(4*cos(pi/8))},
        sensor[89:91],sensor[86:88],transpose(propAxis)*thrust,
        dryMass+fore.mass+aft.mass,displaced,addedMass,drag,piccardLinearDrag);
    end when;
    // Rows 1..4 are signed DVL beam velocities, 5..8 slant ranges, 9..57 sonar.
    // Row 58 gyro, 59 pressure, 60..62 scan-matched planar pose, 63 lock.
    cornerScore=Vision.Features.FastCircleScore(sensor[68:83]);
    visualWeight=if sensor[85]>0.5 and cornerScore>6 and abs(sensor[84]-sensor[58])<0.16 then 0.22 else 0;
    // Hold one coherent pose factor between successive 5 Hz scan acquisitions.
    when sample(0,0.2) then
      (edge,Ji,Jj,edgeValid)=SLAM.PoseGraph.PGEdge({nav[1],nav[2],0},identity(3),
        {sensor[60],sensor[61],0},SLAM.PoseGraph.PGExp({0,0,sensor[62]-nav[3]}),zeros(3),identity(3));
    end when;
    trackWeight=if edgeValid and sensor[67]>=8 and edge[1]^2+edge[2]^2<1 then 1.8 else 0;
    der(nav[1])=sensor[64]*cos(nav[3])-sensor[65]*sin(nav[3])+trackWeight*edge[1];
    der(nav[2])=sensor[64]*sin(nav[3])+sensor[65]*cos(nav[3])+trackWeight*edge[2];
    der(nav[3])=(1-visualWeight)*sensor[58]+visualWeight*sensor[84]+trackWeight*edge[6];
    goal=SurveyRoute.station(surveySite,1+mod(startStation+waypoint-2,SurveyRoute.stations));
    previousGoal=SurveyRoute.station(surveySite,1+mod(startStation+waypoint-3,SurveyRoute.stations));
    eastError=goal[1]-sensor[60];
    northError=goal[2]-sensor[61];
    heading=sensor[62];
    depthEst=if navigationUpValid>.5 then .29-navigationUp else sensor[59]/(rho*g);
    assistedMode=manual>.5 and manualMode>2.5;
    positionMode=manual>.5 and (manualMode<.5 or assistedMode);
    acroMode=manual>.5 and manualMode>1.5 and not assistedMode;
    translate=abs(pilot[1])>.025;
    dive=abs(pilot[4])>.025;
    goalDepth=if positionMode then heldStation[3] elseif manual>.5 then depthEst else .29-goal[3];
    // Let the reference follow the navigation estimate during translation.
    // Centering the sticks holds the last station and pressure depth.
    for i in 1:2 loop
      der(heldStation[i])=if forkSecured or not positionMode or translate or abs(pilot[2])>.01 or (assistedMode and sensor[63]<.5) then (sensor[59+i]-heldStation[i])/.18 else 0;
    end for;
    der(heldStation[3])=if forkSecured or (depthEst>.05 and (not positionMode or dive)) then (depthEst-heldStation[3])/.18 else 0;
    holdE=heldStation[1]-sensor[60];
    holdN=heldStation[2]-sensor[61];
    positionSurge=if translate then pilot[1] elseif sensor[63]>.5 then
      max(-.55,min(.55,.8*(holdE*cos(heading)+holdN*sin(heading)))) else 0;
    heaveRef=if dive then pilot[4] else max(-.4,min(.4,.8*verticalError));
    portRef=if manual<.5 then max(-.4,min(.4,.8*(-pilotEast*sin(heading)+pilotNorth*cos(heading))))
      elseif assistedMode or abs(pilot[2])>.01 then pilot[2] elseif sensor[63]>.5 then
      max(-.4,min(.4,.8*(-holdE*sin(heading)+holdN*cos(heading)))) else 0;
    // Bottom-relative DVL supplies horizontal feedback. Pressure remains available
    // across lost DVL pings. Retain the geographic reference and freeze its integral.
    der(filteredDepth)=(depthEst-filteredDepth)/.6;
    stationError={holdE,holdN,depthEst-heldStation[3]};
    for i in 1:3 loop
      der(stationBias[i])=if positionMode and not assistedMode and not forkSecured and
        (if i==3 then not dive else not translate and abs(pilot[2])<=.01) then
        (if (i==3 or sensor[63]>.5) and (abs(stationBias[i])<5 or stationBias[i]*stationError[i]<0) then .35*stationError[i] else 0) else -stationBias[i]/.8;
    end for;
    verticalError=depthEst-goalDepth;
    // Choose a local circuit at engagement. Pausing preserves the current station.
    when sample(.2,.2) then
      wasSurveying=manual<.5 and not forkSecured;
      (surveySite,startStation,waypoint,surveyDone,entryEast,entryNorth)=SurveyRoute.advance(
        pre(surveySite),pre(startStation),pre(waypoint),pre(surveyDone),pre(wasSurveying),
        manual<.5 and not forkSecured,pre(entryEast),pre(entryNorth),position[1],position[2],
        sensor[60],sensor[61],depthEst);
    end when;
    legStart=if waypoint>1 then previousGoal[1:2] else {entryEast,entryNorth};
    legVector=goal[1:2]-legStart;legLength=sqrt(legVector*legVector);
    // Steer one metre ahead on the current passage to arrest cross-track drift before the next doorway.
    lookback=max(0,({eastError,northError}*legVector)/max(.001,legLength)-1)/max(.001,legLength);
    pilotEast=eastError-lookback*legVector[1];pilotNorth=northError-lookback*legVector[2];
    // Keep the leg heading through a station. Chasing the bearing to a point
    // inside the turn radius can orbit it indefinitely in a cross-current.
    headingError=if eastError^2+northError^2<1 and legLength>.1 then
      atan2(legVector[2]*cos(heading)-legVector[1]*sin(heading),legVector[1]*cos(heading)+legVector[2]*sin(heading))
      elseif eastError^2+northError^2>.30^2 then
      atan2(pilotNorth*cos(heading)-pilotEast*sin(heading),pilotEast*cos(heading)+pilotNorth*sin(heading)) else 0;
    forwardError=pilotEast*cos(heading)+pilotNorth*sin(heading);
    approach=max(0,min(1,(cos(headingError)-.78)/.18));
    surgeRef=approach*max(0,min(.65,forwardError));
    surge=if positionMode then 18*(positionSurge-(if sensor[63]>.5 or assistedMode then sensor[64] else 0))+stationBias[1]*cos(heading)+stationBias[2]*sin(heading) elseif manual>.5 then 18*pilot[1] else 24*(surgeRef-sensor[64]);
    yawVelocity=(sin(roll)*body.w_a[2]+cos(roll)*body.w_a[3])/max(.4,cos(pitch));
    der(yawHoldError)=if not forkSecured and positionMode and abs(pilot[3])<.015 then
      (if yawHoldError*yawVelocity<0 or abs(yawHoldError)<.6 then yawVelocity else 0) else -yawHoldError/.2;
    // Manual body-rate damping uses the same high-rate gyro as pitch and roll.
    // The 5 Hz navigation packet holds an old rate between measurements.
    yawCmd=if positionMode then 7*(pilot[3]-yawVelocity)-11*yawHoldError
      elseif manual>.5 then manualMoment[3]
      else 2.8*(max(-.85,min(.85,1.4*headingError))-yawVelocity);
    // A neutrally trimmed sub has very little sustained lift to vector. Flood
    // both piston tanks equally in assisted translation, within their pump limits.
    trimVolume=if positionMode or manual<.5 then .00072 else .00042;
    portSpeed=cos(roll)*sensor[65]-sin(roll)*vzDvl;
    sideForce=if manual<.5 or (positionMode and (not assistedMode or abs(pilot[2])>.01)) then
      piccardLinearDrag*portRef+drag[2]*portRef*abs(portRef)+(if sensor[63]>.5 then (if assistedMode then 9 else 12)*(portRef-portSpeed) else 0)
      -stationBias[1]*sin(heading)+stationBias[2]*cos(heading) else 0;
    stationEngaged=manual>.5 and manualMode<.5 and not forkSecured;
    groundForward=cos(pitch)*sensor[64]+sin(pitch)*(sin(roll)*sensor[65]+cos(roll)*vzDvl);
    groundUp=if sensor[63]>.5 then -sin(pitch)*sensor[64]+cos(pitch)*(sin(roll)*sensor[65]+cos(roll)*vzDvl)
      else max(-1,min(1,(filteredDepth-depthEst)/.6));
    verticalDemand=stationBias[3]+g*(dryMass+fore.mass+aft.mass-rho*displaced*wet)
      +24*(heaveRef-(if sensor[63]>.5 then -sin(pitch)*sensor[64]+cos(pitch)*(sin(roll)*sensor[65]+cos(roll)*vzDvl) elseif positionMode and not assistedMode then max(-1,min(1,(filteredDepth-depthEst)/.6)) else verticalSpeed));
    // Positive roll tilts upward thrust to starboard. Reverse the bank for
    // downward thrust and blend through zero as the sign of the lift changes.
    bankTarget=if positionMode or manual<.5 then -max(-.60,min(.60,atan2(sideForce,max(2,abs(verticalDemand)))))
      *verticalDemand/sqrt(verticalDemand^2+1) else 0;
    // During a pilot-commanded bank, reserve differential thrust for roll as
    // the vertical thrusters turn horizontal and lose depth authority.
    heave=if positionMode or manual<.5 then verticalDemand/max(.65,cos(roll)*cos(pitch))
      *(if positionMode then 1-abs(manualBank)*sin(roll)^2 else 1) elseif manual>.5 then 24*pilot[4]
      else 12*verticalError-15*verticalSpeed;
    manualAttitude=manual>.5 and not positionMode;
    // Propagate gravity in body coordinates through Acro pitch rotations.
    // Accelerometer updates correct slow gyro errors between manoeuvres.
    accelerationNorm=sqrt(sensor[86:88]*sensor[86:88]);
    measuredGravity=if accelerationNorm>.1 then sensor[86:88]/accelerationNorm else manualUp;
    der(manualUp)=-cross(rates,manualUp)+.35*(measuredGravity-manualUp);
    roll=if manual>.5 then atan2(manualUp[2],manualUp[3]) else attitude[1];
    pitch=if manual>.5 then atan2(-manualUp[1],sqrt(manualUp[2]^2+manualUp[3]^2)) else attitude[2];
    // The rate loop uses the high-rate gyro signal. The 5 Hz packet is
    // suitable for navigation, but delayed damping can excite the thrusters.
    restoringArm=g*{.17*(aft.mass-fore.mass),0,.0275*rho*displaced*wet+.04*(fore.mass+aft.mass)};
    trimMoment=cross(restoringArm,up);
    // Over the short motor lag, account for rotation of the restoring load.
    trimRate=cross(restoringArm,-cross(body.w_a,up));
    motorMoment=transpose(propMomentArm)*appliedThrust;
    referenceRate={1.05*attitudePilot[1],.90*attitudePilot[2],pilot[3]};
    unitUp=manualUp/max(1e-9,sqrt(manualUp*manualUp));
    // At a vertical camera angle the body port axis still defines the pilot's
    // heading. Its angular rate about world up stays finite at both poles.
    poleYawRate=(unitUp[1]*rates[1]+unitUp[3]*rates[3])/max(.1,1-unitUp[2]^2);
    steepWeight=min(1,max(0,(abs(pitch)-pi/3)/(pi/12)));
    steepMoment=steepTiltMoment(unitUp,pi/2*manualBank,pilotPitch,rates,7*(pilot[3]-poleYawRate))-trimMoment-motorLag*trimRate;
    pilotPitch=pilotPitchLimit*max(-1,min(1,attitudePilot[2]));
    angleError={atan2(sin(pi/2*manualBank-roll),cos(pi/2*manualBank-roll)),pilotPitch-pitch,0};
    angularPole={if acroMode then manualRatePole[1] else manualLevelPole[1],
      if acroMode then manualRatePole[2] else manualLevelPole[2],manualRatePole[3]};
    for i in 1:3 loop
      manualMoment[i]=if manualAttitude then (if acroMode then 1 else 1-steepWeight)*manualAxisTorque(i<=2 and not acroMode,angleError[i],
        referenceRate[i],body.w_a[i],motorMoment[i],trimMoment[i],trimRate[i],angularInertia[i],
        rotationalResistance[i],motorLag,angularPole[i])+(if acroMode then 0 else steepWeight*steepMoment[i]) else 0;
    end for;
    // A manual bank can use the full quarter turn. Leave automatic bank limits
    // in place for station keeping and survey guidance.
    manualBank=max(-1,min(1,attitudePilot[1]));
    rollCmd=if positionMode then 9*((1-abs(manualBank))*bankTarget+pi/2*manualBank-roll)-3.6*body.w_a[1]-trimMoment[1] elseif manual>.5 then manualMoment[1] else 9*(bankTarget-roll)-3.6*rates[1]-trimMoment[1];
    pitchCmd=if positionMode then 10*(pilotPitch-pitch)-4*body.w_a[2]-trimMoment[2] elseif manual>.5 then manualMoment[2] else -4*pitch-2.2*rates[2];
    // Split lift so net force and pitch torque both match their commands.
    foreLift=(-pitchCmd-propMount[5,1]*heave)/(propMount[3,1]-propMount[5,1]);
    aftLift=heave-foreLift;
    cmd=if stationEngaged then stationControl.motors else {surge/2-yawCmd/(2*propMount[1,2]),surge/2+yawCmd/(2*propMount[1,2]),
         foreLift/2+rollCmd/(4*propMount[3,2]),foreLift/2-rollCmd/(4*propMount[3,2]),
         aftLift/2+rollCmd/(4*propMount[5,2]),aftLift/2-rollCmd/(4*propMount[5,2])};
    for i in 1:6 loop
      der(thrust[i])=((if forkSecured or not battery.powered then 0 else max(-14,min(14,cmd[i])))-thrust[i])/motorLag;
    end for;
    localSurface=propSurfaceOffset+fill(seaLevel,6)+thrusterWaveHeights(ocean.tile,propPosition);
    for i in 1:6 loop
      propPosition[i,:]=position+transpose(measuredT)*propMount[i,:];
      propDiskHeight[i]=.5*propellerDiameter*sqrt(max(0,1-(up*propAxis[i,:])^2));
      diskCut[i]=max(-1,min(1,(localSurface[i]-propPosition[i,3])/max(.001,propDiskHeight[i])));
      propWet[i]=.5+(asin(diskCut[i])+diskCut[i]*sqrt(max(0,1-diskCut[i]^2)))/pi;
      appliedThrust[i]=(propWet[i]+(1-propWet[i])*airDensity/rho)*thrust[i];
      propellerRPM[i]=60*thrust[i]/sqrt(rho*thrustCoefficient*propellerDiameter^4*sqrt(thrust[i]^2+0.0001));
      tipDynamicPressure[i]=0.5*rho*(pi*propellerDiameter*propellerRPM[i]/60)^2;
      cavitation[i]=propWet[i]*max(0,min(1,1-(101325+ocean.gaugePressure-2300)/(inceptionNumber*max(1,tipDynamicPressure[i]))));
    end for;
    fore.pressure=ocean.gaugePressure;
    aft.pressure=ocean.gaugePressure;
    fore.target=if not battery.powered then fore.volume elseif stationEngaged then stationControl.tankTargets[1] else max(0,min(fore.capacity,trimVolume-0.00010*verticalError-(if manual>.5 and not positionMode then 0 else 0.0002*pitch)));
    aft.target=if not battery.powered then aft.volume elseif stationEngaged then stationControl.tankTargets[2] else max(0,min(aft.capacity,trimVolume-0.00010*verticalError+(if manual>.5 and not positionMode then 0 else 0.0002*pitch)));
    up=measuredT*{0,0,1};
    wet=max(0,min(1,(ocean.surface+hullSurfaceOffset-position[3]+piccardWaterlineHalfHeight)/(2*piccardWaterlineHalfHeight)));
    buoy=rho*g*displaced*wet*up;
    when flood>0 then
      breached=true;
    end when;
    // Vented orifice under local gauge pressure. The available unfilled
    // volume tapers the inflow; captured water is centred in the housing.
    der(filledFraction)=if breached then .62*breachArea*wet*sqrt(2*max(0,ocean.gaugePressure)/rho)
      *max(0,1-filledFraction)/floodableVolume else 0;
    floodMass=rho*floodableVolume*min(1,max(0,filledFraction));
    ballast=-g*(fore.mass+aft.mass+floodMass)*up;
    rel=velocity-measuredT*current;
    apparentAir=measuredT*({ocean.wind*cos(ocean.bearing),ocean.wind*sin(ocean.bearing),0}-worldVelocity)
      -cross(rates,windageCenter);
    windForce=0.5*airDensity*(1-wet)*windageCdA.*apparentAir.*abs(apparentAir);
    effectiveMass=fill(dryMass+fore.mass+aft.mass+floodMass,3)+addedMass;
    loads.force=if forkSecured then dryMass*g*body.frame_a.R.T[:,3] else dryMass*(netForce ./ effectiveMass+g*up);
    (contactTarget,momentTarget)=bedContact(position,measuredT,worldVelocity,rates);
    (scanForce,scanMoment)=scanContact(position,measuredT,worldVelocity,rates,scanConstraints,effectiveMass,angularInertia);
    when sample(0,.02) then
      mantaWrench=if forkSecured then zeros(6) else mantaVesselLoad(animalTraffic,animalJoints,
        cat(1,position,{atan2(measuredT[2,3],measuredT[3,3]),-asin(min(1,max(-1,measuredT[1,3]))),atan2(measuredT[1,2],measuredT[1,1])}),
        {worldVelocity[1],worldVelocity[2],measuredT[:,3]*rates},.73,.215,0,-.19,worldVelocity[3],rates[1],rates[2])+
        (if forkSecured then zeros(6) else sharkSubLoad(animalTraffic,animalJoints,position,measuredT,worldVelocity,rates));
      peerHullWrench=peerHullLoad(cat(1,{if forkSecured then 0 else 1},body.r_0,body.Q,body.v_0,transpose(body.frame_a.R.T)*body.w_a),peerCruisers,true,zeros(2),peerLiftStates);
    end when;
    der(filteredForce)=(contactTarget+peerHullWrench[1:3]+mantaWrench[1:3]-filteredForce)/0.014;
    der(filteredMoment)=(momentTarget+peerHullWrench[4:6]+mantaWrench[4:6]-filteredMoment)/0.014;
    contactForce=filteredForce+(if forkSecured then zeros(3) else scanForce);
    contactMoment=filteredMoment+(if forkSecured then zeros(3) else scanMoment);
    netForce=measuredT*scanForce+windForce+buoy+ballast-dryMass*g*up-cross(body.w_a,addedMass.*rel)-wet*(piccardLinearDrag*rel+drag.*rel.*abs(rel))+transpose(propAxis)*appliedThrust;
    angularInertia=dryInertia+wet*addedInertia+(fore.mass+aft.mass)*{.04^2,.17^2+.04^2,.17^2}
      +floodMass*{barrelDiameter^2/8,(barrelLength^2+.75*barrelDiameter^2)/12,(barrelLength^2+.75*barrelDiameter^2)/12};
    // In a beam current, a rotating strip sees different local velocities on
    // either side of the centre. Linearizing |v|v there gives rho*Cd*A*|v|.
    throughFlowResistance=rho*frameCd/12*{
      .495*frameBeam^3*abs(rel[3])+frameLength*frameHeight^3*abs(rel[2]),
      frameBeam*frameLength^3*abs(rel[3]),barrelDiameter*barrelLength^3*abs(rel[2])};
    for i in 1:3 loop
      hullResistance[i]=wet*(angularDrag[i]+sqrt((hullCrossflow[i]*body.w_a[i])^2+throughFlowResistance[i]^2));
      rotationalResistance[i]=hullResistance[i]+wet*ductCrossflow[i]*abs(body.w_a[i]);
    end for;
    ductWaterMoment=wet*ductRotationMoment(rel,body.w_a,propMount,rho,ductCdA);
    wetTorque=measuredT*contactMoment+cross(windageCenter,windForce)+trimMoment
      -hullResistance.*body.w_a+ductWaterMoment-cross(rel,addedMass.*rel)+transpose(propMomentArm)*appliedThrust;
    // MSL's body already includes its dry gyroscopic term. Apply Euler's
    // equation with total angular momentum to every external moment once.
    loads.torque=if forkSecured then zeros(3) else cross(body.w_a,dryInertia.*body.w_a)
      +dryInertia.*((wetTorque-cross(body.w_a,angularInertia.*body.w_a)) ./ angularInertia);
    annotation(experiment(StopTime=125,Interval=0.2,Tolerance=1e-5));
  end Plant;
end Wreck;
