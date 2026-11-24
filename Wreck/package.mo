within;
package Wreck
  constant Real g=9.80665;
  constant Real rho=1025;
  constant Real pi=Modelica.Constants.pi;

  model Ocean
    input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
    input Real seaState=-1 "Negative selects the legacy fetch-based sea";
    input Real pos[3];
    parameter Real profile[:,3]=Current.profile "Depth below mean sea level [m], east and north residual current [m/s]";
    parameter Real tidePhase=0.5, currentPhase=1.2, tidalSpeed=0.12;
    input Real windSpeed "10 m wind speed, m/s";
    input Real windDirection "Direction toward which wind blows, radians from east";
    parameter Real fetch=45000, waterDepth=SpectralSea.nearshoreDepth;
    Real wind(stateSelect=StateSelect.always,start=11,fixed=true), bearing(stateSelect=StateSelect.always,start=0.45,fixed=true);
    discrete Real tile[SpectralSea.N,SpectralSea.N],probe[5];
    discrete output Real surfaceSlope[2];
    Real surface, tide, velocity[3], gaugePressure, meanFlow[2], shelter,meanCurrent[3],tidalEast;
  equation
    der(wind)=(windSpeed-wind)/20;
    der(bearing)=atan2(sin(windDirection-bearing),cos(windDirection-bearing))/18;
    tide=0.6*sin(2*pi*(time+seaClockOffset)/44714+tidePhase);
    when sample(0,0.2) then
      (tile,probe,surfaceSlope)=SpectralSea.field(time+seaClockOffset,
        if seaState<0 then wind else windSpeed,if seaState<0 then bearing else windDirection,
        fetch,waterDepth,tide,pos,seaState);
    end when;
    tidalEast=tidalSpeed*sin(2*pi*(time+seaClockOffset)/44714+currentPhase);
    for j in 1:2 loop
      meanFlow[j]=Modelica.Math.Vectors.interpolate(profile[:,1],profile[:,j+1],min(max(-pos[3],profile[1,1]),profile[size(profile,1),1]));
    end for;
    shelter=Current.shelterAt(pos);
    meanCurrent=Current.meanVelocity(pos[3],tide,wind,bearing,tidalEast,meanFlow,shelter);
    surface=tide+probe[1];
    velocity=meanCurrent+probe[2:4];
    gaugePressure=rho*g*max(0,tide-pos[3]+probe[5]);
  end Ocean;

  model Tank "Floodable piston tank, positive stroke admits seawater"
    parameter Real capacity=0.0008, maxFlow=0.000028, stallPressure=300000;
    input Real target, pressure;
    Real volume(stateSelect=StateSelect.always,start=0.00035,fixed=true), pumpFlow(stateSelect=StateSelect.always,start=0,fixed=true), mass;
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

  model Plant
    inner MultiBodyLie.World world(n={0,0,-1});
    parameter Real dryMass=18, displaced=0.0184;
    parameter Real drag[3]={8,23,30}, angularDrag[3]={2,3,3};
    MultiBodyLie.Parts.Body body(m=dryMass,I_11=0.32,I_22=1.6,I_33=1.7,
      angles_fixed=true,w_0_fixed=true,Q(each stateSelect=StateSelect.always),w_a(each stateSelect=StateSelect.always),r_0(each stateSelect=StateSelect.always,start={-5,0,-10},each fixed=true),v_0(each stateSelect=StateSelect.always,each fixed=true));
    MultiBodyLie.Forces.WorldForceAndTorque collision(resolveInFrame=MultiBodyLie.Types.ResolveInFrameB.world);
    MultiBodyLie.Forces.WorldForceAndTorque loads(resolveInFrame=MultiBodyLie.Types.ResolveInFrameB.frame_b);
    input Real windSpeed(start=11), windDirection(start=0.45);
    input Real hullSurfaceOffset=0, propSurfaceOffset[6]=zeros(6)
      "Additional local free-surface elevation at the hull and at each propeller [m]";
    input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
    input Real seaState=-1;
    Ocean ocean(seaClockOffset=seaClockOffset,pos=body.r_0,windSpeed=windSpeed,windDirection=windDirection,seaState=seaState);
    output Real waveHeight[SpectralSea.N,SpectralSea.N]=ocean.tile;
    output Real seaLevel=ocean.tide, windActual=ocean.wind;
    output Real specificForce[3]=loads.force/dryMass, rates[3]=body.w_a;
    output Real gyroAngle[3](each start=0,each fixed=true) "Integrated gyro increments for the 5 Hz navigation packets";
    output Real attitude[2](each start=0,each fixed=true), verticalSpeed(start=0,fixed=true);
    Real accelAtt[2], vzDvl;
    parameter Real addedMass[3]={3,9,11};
    output Real contactForce[3](each start=0,each fixed=true,each stateSelect=StateSelect.always), contactMoment[3](each start=0,each fixed=true,each stateSelect=StateSelect.always);
    Real contactTarget[3], momentTarget[3];
    Real netForce[3],effectiveMass[3];
    Tank fore, aft;
    input Real sensor[91];
    input Real elevationRanges[100](each start=0) "Four elevation fans of 25 slant ranges, zero means no echo";
    input Real manual(start=0) "Enable manual control above 0.5";
    input Real manualMode(start=0) "0 position, 1 auto-level, 2 body-rate acro, 3 assisted translation";
    input Real attitudePilot[2](each start=0) "Normalized roll and pitch stick commands";
    input Real pilot[4](each start=0) "Body surge, port speed (banked translation mode), yaw rate and upward speed [m/s,m/s,rad/s,m/s]";
    parameter Real propellerDiameter=0.17, thrustCoefficient=0.035, inceptionNumber=3.5;
    output Real propellerRPM[6], cavitation[6], appliedThrust[6];
    parameter Real propMount[6,3]=[.36,.32,0;.36,-.32,0;.065,.32,0;.065,-.32,0;-.43,.32,0;-.43,-.32,0] "Photo-estimated Piccard mounts, forward/port/up in metres";
    parameter Real propAxis[6,3]=[1,0,0;1,0,0;0,0,1;0,0,1;0,0,1;0,0,1];
    parameter Real propMomentArm[6,3]={cross(propMount[i,:],propAxis[i,:]) for i in 1:6};
    Real propPosition[6,3],propDiskHeight[6],diskCut[6],localSurface[6];
    output Real propWet[6];
    Real tipDynamicPressure[6];
    output Real position[3]=body.r_0, orientation[4]=body.Q, velocity[3]=body.frame_a.v, yawRate=body.w_a[3], pressure=ocean.gaugePressure, current[3]=ocean.velocity, tankLitres[2]=1000*{fore.volume,aft.volume}, motor[6]=thrust;
    output Real nav[3](start={-5,0,0},each fixed=true) "East, north, yaw from onboard sensors";
    output Real cornerScore, visualWeight;
    discrete Real edge[6](each start=0,each fixed=true), Ji[6,6](each start=0,each fixed=true), Jj[6,6](each start=0,each fixed=true);
    discrete Boolean edgeValid(start=false,fixed=true);
    Real trackWeight;
    parameter Integer waypointCount=17;
    parameter Real waypoints[waypointCount,3]=[
      -1,0,-9.8; 3,0,-9.8; 6.5,0,-9.8; 6.5,-1.7,-9.4376;
      11,-1.7,-9.4376; 17.5,-1.7,-9.4376; 17.5,0,-9.8; 17.5,1.87,-10.1985;
      12,1.83,-10.19; 6.5,1.69,-10.1602; 6.5,0,-9.8; -2.5,0,-9.8;
      -2.5,0,-5; 4,0,-4.6; 9,0,-4.6; -2.5,0,-4.6; -1.5,0,-9.8]
      "ENU survey stations at the stern, companionways three deck passages and back over the upper hull";
    output Integer waypoint(start=1,fixed=true);
    output Boolean surveyDone(start=false,fixed=true);
    output Real surveyTelemetry[15]=cat(1,{waypoint,waypointCount,if surveyDone then 1 else 0},appliedThrust,buoy,contactForce)
      "Survey station, total, completion, applied motor forces, body buoyancy and world contact";
    Real goal[3],eastError,northError,verticalError,surgeRef,depthEst,surge,yawCmd,heave,rollCmd,pitchCmd;
    Real goalDepth,headingError,approach,forwardError,legStart[2],legVector[2],legLength,lookback;
    Real pilotEast,pilotNorth;
    Real foreLift,aftLift;
    Boolean positionMode,acroMode,assistedMode,translate,dive;
    Real portSpeed,sideForce,verticalDemand,bankTarget,trimVolume,yawVelocity;
    Real yawHoldError(start=0,fixed=true) "Integrated heading change since the yaw stick was centered";
    Real heldStation[3](start={-5,0,10.29},each fixed=true) "Estimated east, north and pressure depth";
    Real holdE,holdN,positionSurge,heaveRef;
    Real cmd[6], thrust[6](each stateSelect=StateSelect.always,each start=0,each fixed=true), rel[3], up[3], buoy[3], ballast[3], wet;
    parameter Real airDensity=1.225, windageCdA[3]={0.12,0.32,0.25} "Exposed hull drag areas [m2]";
    parameter Real windageCenter[3]={0.04,0,0.12} "Centre of wind pressure in body axes [m]";
    output Real windForce[3] "Aerodynamic hull load in body axes [N]";
    Real apparentAir[3],trimMoment[3];
    Real heading,pitch,roll;
  equation
    connect(loads.frame_b,body.frame_a);
    connect(collision.frame_b,body.frame_a);
    collision.force=contactForce;
    collision.torque=contactMoment;

    der(gyroAngle)=body.w_a;
    accelAtt={atan2(sensor[87],sensor[88]),atan2(-sensor[86],sqrt(sensor[87]^2+sensor[88]^2))};
    der(attitude)={sensor[89],sensor[90]}+1.5*(accelAtt-attitude);
    vzDvl=-sum(sensor[1:4])/(4*cos(pi/8));
    der(verticalSpeed)=sensor[88]-g+(if sensor[63]>0.5 then 4*(vzDvl-verticalSpeed) else -0.2*verticalSpeed);
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
    goal=waypoints[waypoint,:];
    eastError=goal[1]-sensor[60];
    northError=goal[2]-sensor[61];
    heading=sensor[62];
    depthEst=sensor[59]/(rho*g);
    assistedMode=manual>.5 and manualMode>2.5;
    positionMode=manual>.5 and (manualMode<.5 or assistedMode);
    acroMode=manual>.5 and manualMode>1.5 and not assistedMode;
    translate=abs(pilot[1])>.025;
    dive=abs(pilot[4])>.025;
    goalDepth=if positionMode then heldStation[3] elseif manual>.5 then depthEst else .29-goal[3];
    // Let the reference follow the navigation estimate during translation.
    // Centering the sticks holds the last station and pressure depth.
    for i in 1:2 loop
      der(heldStation[i])=if not positionMode or translate or (assistedMode and abs(pilot[2])>.01) or sensor[63]<.5 then (sensor[59+i]-heldStation[i])/.18 else 0;
    end for;
    der(heldStation[3])=if depthEst>.05 and (not positionMode or dive) then (depthEst-heldStation[3])/.18 else 0;
    holdE=heldStation[1]-sensor[60];
    holdN=heldStation[2]-sensor[61];
    positionSurge=if translate then pilot[1] elseif sensor[63]>.5 then
      max(-.55,min(.55,.8*(holdE*cos(heading)+holdN*sin(heading)))) else 0;
    heaveRef=if dive then pilot[4] else max(-.4,min(.4,.8*(depthEst-heldStation[3])));
    verticalError=depthEst-goalDepth;
    // Waypoints advance only on measured arrival. Hold the final station.
    when sample(.2,.2) then
      waypoint=if manual<.5 and stationReached(waypoints[pre(waypoint),:],sensor[60],sensor[61],depthEst) then min(waypointCount,pre(waypoint)+1) else pre(waypoint);
      surveyDone=pre(surveyDone) or (pre(waypoint)==waypointCount and manual<.5 and stationReached(waypoints[pre(waypoint),:],sensor[60],sensor[61],depthEst));
    end when;
    // Aim the forward camera and sonar along the passage before translating.
    // Inside a station's arrival window, brake and hold yaw during vertical moves.
    legStart=if waypoint>1 then waypoints[max(1,waypoint-1),1:2] else {-5,0};
    legVector=goal[1:2]-legStart;legLength=sqrt(legVector*legVector);
    // Steer one metre ahead on the current passage to arrest cross-track drift before the next doorway.
    lookback=max(0,({eastError,northError}*legVector)/max(.001,legLength)-1)/max(.001,legLength);
    pilotEast=eastError-lookback*legVector[1];pilotNorth=northError-lookback*legVector[2];
    headingError=if eastError^2+northError^2>.30^2 then
      atan2(pilotNorth*cos(heading)-pilotEast*sin(heading),pilotEast*cos(heading)+pilotNorth*sin(heading)) else 0;
    forwardError=pilotEast*cos(heading)+pilotNorth*sin(heading);
    approach=max(0,min(1,(cos(headingError)-.78)/.18));
    surgeRef=approach*max(0,min(.65,forwardError));
    surge=if positionMode then 18*(positionSurge-sensor[64]) elseif manual>.5 then 0 else 24*(surgeRef-sensor[64]);
    yawVelocity=(sin(roll)*body.w_a[2]+cos(roll)*body.w_a[3])/max(.4,cos(pitch));
    der(yawHoldError)=if assistedMode and abs(pilot[3])<.015 then
      (if yawHoldError*yawVelocity<0 or abs(yawHoldError)<.6 then yawVelocity else 0) else -yawHoldError/.2;
    yawCmd=if assistedMode then 7*(pilot[3]-yawVelocity)-11*yawHoldError elseif manual>.5 then 4*(pilot[3]-sensor[58]) else 5*max(-.95,min(.95,headingError))-4*sensor[58];
    // A neutrally trimmed sub has very little sustained lift to vector. Flood
    // both piston tanks equally in assisted translation, within their pump limits.
    trimVolume=if assistedMode then .00072 else .00042;
    portSpeed=cos(roll)*sensor[65]-sin(roll)*vzDvl;
    sideForce=if abs(pilot[2])>.01 then 3*pilot[2]+drag[2]*pilot[2]*abs(pilot[2])
      +(if sensor[63]>.5 then 9*(pilot[2]-portSpeed) else 0) else 0;
    verticalDemand=g*(dryMass+fore.mass+aft.mass-rho*displaced*wet)
      +24*(heaveRef-(if sensor[63]>.5 then -sin(pitch)*sensor[64]+cos(pitch)*(sin(roll)*sensor[65]+cos(roll)*vzDvl) else verticalSpeed));
    // Positive roll tilts upward thrust to starboard. Reverse the bank for
    // downward thrust and blend through zero as the sign of the lift changes.
    bankTarget=if assistedMode then -max(-.60,min(.60,atan2(sideForce,max(2,abs(verticalDemand)))))
      *verticalDemand/sqrt(verticalDemand^2+1) else 0;
    heave=if assistedMode then verticalDemand/max(.65,cos(roll)*cos(pitch)) elseif positionMode then 24*(heaveRef-verticalSpeed) elseif manual>.5 then 24*pilot[4]
      else 12*verticalError-15*verticalSpeed;
    roll=attitude[1];
    pitch=attitude[2];
    // The rate loop uses the high-rate gyro signal. The 5 Hz packet is
    // suitable for navigation, but delayed damping can excite the thrusters.
    trimMoment=cross({0,0,0.055},buoy)+cross({0.34,0,-0.08},-fore.mass*g*up)+cross({-0.34,0,-0.08},-aft.mass*g*up);
    rollCmd=if assistedMode then 9*(bankTarget-roll)-3.6*body.w_a[1]-trimMoment[1] elseif acroMode then 2.8*(1.05*attitudePilot[1]-body.w_a[1])-trimMoment[1]
      elseif manual>.5 and not positionMode then 5.4*(.49*attitudePilot[1]-roll)-2.6*body.w_a[1]-trimMoment[1] else -3*roll-sensor[89];
    pitchCmd=if assistedMode then -10*pitch-4*body.w_a[2]-trimMoment[2] elseif acroMode then 5.2*(.90*attitudePilot[2]-body.w_a[2])-trimMoment[2]
      elseif manual>.5 and not positionMode then 10*(.44*attitudePilot[2]-pitch)-4*body.w_a[2]-trimMoment[2] else -4*pitch-2*sensor[90];
    // Split lift so net force and pitch torque both match their commands.
    foreLift=(-pitchCmd-propMount[5,1]*heave)/(propMount[3,1]-propMount[5,1]);
    aftLift=heave-foreLift;
    cmd={surge/2-yawCmd/(2*propMount[1,2]),surge/2+yawCmd/(2*propMount[1,2]),
         foreLift/2+rollCmd/(4*propMount[3,2]),foreLift/2-rollCmd/(4*propMount[3,2]),
         aftLift/2+rollCmd/(4*propMount[5,2]),aftLift/2-rollCmd/(4*propMount[5,2])};
    for i in 1:6 loop
      der(thrust[i])=(max(-14,min(14,cmd[i]))-thrust[i])/0.14;
    end for;
    for i in 1:6 loop
      propPosition[i,:]=body.r_0+transpose(body.frame_a.R.T)*propMount[i,:];
      localSurface[i]=propSurfaceOffset[i]+seaLevel+Perception.seaHeight(ocean.tile,propPosition[i,1],propPosition[i,2]);
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
    fore.target=max(0,min(fore.capacity,trimVolume-0.00010*verticalError-(if manual>.5 and not positionMode then 0 else 0.0002*pitch)));
    aft.target=max(0,min(aft.capacity,trimVolume-0.00010*verticalError+(if manual>.5 and not positionMode then 0 else 0.0002*pitch)));
    up=body.frame_a.R.T*{0,0,1};
    wet=max(0,min(1,(ocean.surface+hullSurfaceOffset-body.r_0[3]+0.16)/0.32));
    buoy=rho*g*displaced*wet*up;
    ballast=-g*(fore.mass+aft.mass)*up;
    rel=body.frame_a.v-body.frame_a.R.T*ocean.velocity;
    apparentAir=body.frame_a.R.T*({ocean.wind*cos(ocean.bearing),ocean.wind*sin(ocean.bearing),0}-body.v_0)
      -cross(body.w_a,windageCenter);
    windForce=0.5*airDensity*(1-wet)*windageCdA.*apparentAir.*abs(apparentAir);
    effectiveMass=fill(dryMass+fore.mass+aft.mass,3)+addedMass;
    loads.force=dryMass*(netForce ./ effectiveMass+g*up);
    (contactTarget,momentTarget)=structureContact(body.r_0,body.frame_a.R.T,body.v_0,body.w_a);
    der(contactForce)=(contactTarget-contactForce)/0.014;
    der(contactMoment)=(momentTarget-contactMoment)/0.014;
    netForce=windForce+buoy+ballast-dryMass*g*up-cross(body.w_a,addedMass.*rel)-wet*(3*rel+drag.*rel.*abs(rel))+transpose(propAxis)*appliedThrust;
    loads.torque=cross(windageCenter,windForce)+trimMoment
      -angularDrag.*body.w_a-cross(rel,addedMass.*rel)+transpose(propMomentArm)*appliedThrust;
    annotation(experiment(StopTime=125,Interval=0.2,Tolerance=1e-5));
  end Plant;
end Wreck;
