model BostonWhaler190 "Boston Whaler driveable in the Ocean Web harbor"
  extends OceanMission(race(racerState={1,boat.yaw,boat.roll,-boat.pitch,boat.z,
    boat.velocityENU[1],boat.velocityENU[2],boat.yawRate,boat.vertical,boat.rollRate,-boat.pitchRate},
    hullStations=hullStations,hullWidths=2*halfStripBeam),waves(localHull=true,heading=boat.yaw,heel=boat.roll,pitch=boat.pitch,
    stations=hullStations,beamHalf=halfStripBeam,separation=.50,volume=stripVolume));
  final parameter Real hullStations[7]={-2.91,-2.15,-1.04,.12,1.25,2.23,2.98};
  final parameter Real halfStripBeam[7]={.45,.56,.60,.60,.54,.37,.015};
  final parameter Real stripX[6]={.5*(hullStations[i]+hullStations[i+1]) for i in 1:6};
  final parameter Real stripArea[6]={(hullStations[i+1]-hullStations[i])*(halfStripBeam[i]+halfStripBeam[i+1]) for i in 1:6};
  Real stripVolume[2,6],stripPoint[2,6,3],sternArea,sternDraft,propellerInduction;
  SurfaceHullWake hullWake(stations=hullStations,halfBeam=halfStripBeam,
    speed={boat.surge-cos(boat.yaw)*boatWater.meanFlow[1]-sin(boat.yaw)*boatWater.meanFlow[2],
      boat.sway+sin(boat.yaw)*boatWater.meanFlow[1]-cos(boat.yaw)*boatWater.meanFlow[2]},
    strips=waves.sourceStrips,pose=boatPose,drift={waves.driftE,waves.driftN},sternArea=sternArea,
    sternDraft=sternDraft,diskInduction=propellerInduction,surfaceAccess=max(0,cos(boat.roll)),omitWake=omitWake);
  output Real bowSources[14,6]=hullWake.sources,bowSpeed[2]=hullWake.velocity,bowFrame[4]=hullWake.frame;
  output Real sternFoamTrail[44,4]=hullWake.foam;
  output Real buoyancyLoads[4,6]=boat.buoyancyLoads,propulsorLoads[1,6]=boat.propulsorLoads;
  output Real inertiaState[7]=boat.inertiaState;
  parameter Real initialEast=3,initialNorth=-15,initialHeading=1.5;
  parameter Real mass=1256,waterplaneArea=7.6,shaftPower=112000;
  parameter Real initialRoll=0,initialPitch=0,initialBilgeLitres=0;
  final parameter Real hull[42,3]=Shore.committeeVertices();
  final parameter Integer hullFaces[80,3]=Shore.committeeFaces();

  input Real throttleLever(start=0),helmLever(start=0),lowerAnchor(start=0),bilgePump(start=0);
  output Real boatPose[6]=boat.boatPose,engine[4]=boat.engine;
  output Real starterRemaining=boat.starterRemaining,engineIdleTime=boat.engineIdleTime;
  output Real engineOffAfter=boat.engineOffAfter,engineRunning=boat.powerplant.engineRunning;
  output Real fuelState[6]=boat.fuelState,bilgeState[4]=boat.bilgeState;
  output Real anchorState[12],anchorHolding[2],anchorGuide[2,3]=anchor.guide;
  output Real propellerWetFraction=boat.propellerWetFraction,propellerDepth=boat.propellerDepth;
  output Real contactHull[42,3]=hull;
  output Integer contactFaces[80,3]=hullFaces;

  Real stationSea[4],propellerSea,anchorArm[3],anchorLeadArm[3],wrench[6];
  Marine.Powerboats.BostonWhaler190 boat(mass=mass,waterplaneArea=waterplaneArea,shaftPower=shaftPower,
    initialEast=initialEast,initialNorth=initialNorth,initialHeading=initialHeading,
    initialZ=-.01,flotationDatum=.21,initialRoll=initialRoll,initialPitch=initialPitch,initialBilgeLitres=initialBilgeLitres,
    throttleLever=throttleLever,helmLever=helmLever,bilgePump=bilgePump,
    stationSeaElevation=stationSea,propellerSeaElevation=propellerSea,
    waterVelocityENU=cat(1,boatWater.meanFlow[1:2],{0}),
    externalWrench=wrench+cat(1,anchor.reaction,cross(anchorLeadArm,anchor.reaction)));
  CruiserAnchor anchor(mass=7,holdingForce=1800,breakoutForce=800,rodeBrakeLoad=3000,
    bowX=3.04,sternX=-2.91,halfBeam=1.215,gunwale=-.21,
    stowed={initialEast+3.04*cos(initialHeading),initialNorth+3.04*sin(initialHeading),1.045},
    lower=lowerAnchor,sea=boatWater.tide,bowMount=boat.bowRollerPositionENU,
    bowVelocity=boat.velocityENU+cross(boat.angularVelocityENU,anchorArm),
    boatRotation=boat.rotationBodyToENU,angularVelocity=boat.angularVelocityENU,current=boatWater.meanFlow[1:2]);

  function elevation
    input Real tile[32,32],tide,swell[4],x,y;
    output Real sea;
  algorithm
    sea:=tide+Wreck.Perception.seaHeight(tile,x,y)+swell[1]*sin(swell[2]+x*swell[3]+y*swell[4]);
  end elevation;

  function groundLoad
    input Real pose[3],rotation[3,3],velocity[3],spin[3],vertices[42,3];
    output Real load[6];
  protected
    Real r[3],contact[5];
    Boolean candidates[46];
    Real upper,lowest;
  algorithm
    load:=zeros(6);
    lowest:=pose[3]-3*abs(rotation[3,1])-1.22*abs(rotation[3,2])-.49;
    if Shore.clearOfShore(pose[1],pose[2],lowest,3.3) then return;end if;
    (candidates,upper):=Shore.rockCandidates(pose,3.3);
    upper:=max(upper,Shore.sandHeightUpperBound(pose[1],pose[2],3.3));
    for i in 1:42 loop
      r:=rotation*vertices[i,:];
      if pose[3]+r[3]<=upper then
        contact:=Shore.skinContact(pose+r,1,0,velocity+cross(spin,r),280,candidates=candidates);
        load:=load+cat(1,contact[1:3],cross(r,contact[1:3]));
      end if;
    end for;
  end groundLoad;


equation
  focus=boat.boatPose[1:3];
  committeeLoad=zeros(6);
  for i in 1:4 loop
    stationSea[i]=elevation(boatWater.tile,boatWater.tide,swell,
      boat.stationSamplePointsENU[i,1],boat.stationSamplePointsENU[i,2]);
  end for;
  for h in 1:2 loop
    for i in 1:6 loop
      stripPoint[h,i,:]=focus+boat.rotationBodyToENU*{stripX[i],(3-2*h)*.50,
        (if i<5 then -.12 else if i==5 then .05 else .35)};
      stripVolume[h,i]=noEvent(max(0,min(.44,elevation(boatWater.tile,boatWater.tide,swell,
        stripPoint[h,i,1],stripPoint[h,i,2])-stripPoint[h,i,3])))*.5*stripArea[i];
    end for;
  end for;
  sternArea=sum(stripVolume[:,1])/(hullStations[2]-hullStations[1]);
  sternDraft=sternArea/(halfStripBeam[1]+halfStripBeam[2]);
  propellerInduction=sqrt(max(0,engine[3])/(2*1025*Modelica.Constants.pi*boat.propellerRadius^2));
  propellerSea=elevation(boatWater.tile,boatWater.tide,swell,boat.propellerPositionENU[1],boat.propellerPositionENU[2]);
  wrench=noEvent(groundLoad(focus,boat.rotationBodyToENU,boat.velocityENU,boat.angularVelocityENU,hull));
  anchorArm=boat.bowRollerPositionENU-focus;
  anchorLeadArm=anchor.guide[2,:]-focus;
  anchorHolding={anchor.embedment,anchor.tension};
  anchorState=cat(1,anchor.position,anchor.orientation,boat.bowRollerPositionENU,{anchor.paid,anchor.grounded});
end BostonWhaler190;
