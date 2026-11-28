model OceanMotorboat "2025 Sea Ray Sundancer 320 with twin sterndrives"
  extends OceanMission(race(racerState={1,yaw,roll,pitch,z,der(east),der(north),yawRate,vertical,rollRate,pitchRate},
    hullStations=cruiserStations,hullWidths=2*halfStripBeam),waves(localHull=true,heading=yaw,heel=roll,pitch=pitch,
    stations=cruiserStations,beamHalf=halfStripBeam,separation=stripOffset,volume=stripVolume));
  // Brochure displacement is 6,890 kg water-ready, including both drives.
  parameter Real referenceMass=6890;
  final parameter Real stripOffset=.65;
  parameter Real cruiserStations[7]={-3.74,-2.77,-1.54,-.15,1.34,3.12,5.48};
  parameter Real halfStripBeam[7]={.61,.75,.80,.80,.71,.57,.012};
  parameter Real displacementFraction[6]={.15,.20,.23,.21,.15,.06};
  final parameter Real cruiserContactVertices[96,3]=Shore.cruiserVertices();
  final parameter Integer cruiserContactFaces[188,3]=Shore.pontoonFaces();
  final parameter Real cabinContactVertices[38,3]=Shore.cruiserCabinVertices();
  final parameter Integer cabinContactFaces[46,3]=Shore.cruiserCabinFaces();
  final parameter Real cruiserShellVertices[134,3]=cat(1,cruiserContactVertices,cabinContactVertices);
  final parameter Integer cruiserShellFaces[234,3]=cat(1,cruiserContactFaces,cabinContactFaces+fill(96,46,3));
  function panelElevations "Incident sea elevations at the buoyancy strips"
    input Real tile[32,32],east[2,6],north[2,6],tide;
    output Real elevations[2,6];
  algorithm
    for h in 1:2 loop
      for j in 1:6 loop
        elevations[h,j]:=tide+Wreck.Perception.seaHeight(tile,east[h,j],north[h,j]);
      end for;
    end for;
  end panelElevations;
  function immersedVolume "V-section displacement below the chine and linear topsides above it"
    input Real designVolume,waterplane,immersion;
    output Real volume;
  protected
    Real draft,wet;
  algorithm
    // A triangular half-section has V=A*d/2 at the design waterline.
    // The value and slope match the topsides at the transition.
    draft:=2*designVolume/waterplane;
    wet:=max(0,draft+immersion);
    volume:=min(2.5*designVolume,if noEvent(immersion<0) then designVolume*(wet/draft)^2
      else designVolume+waterplane*immersion);
  end immersedVolume;
  final parameter Real wakeInterval=.1;
  function contactQuadrature "Unique triangle vertices and centroids with summed tributary damping"
    input Real vertices[:,3];
    input Integer faces[:,3];
    output Real sites[size(vertices,1)+size(faces,1),4];
  protected
    Real a[3],b[3],c[3],area[3],weight;
    Integer centroid;
  algorithm
    sites:=zeros(size(vertices,1)+size(faces,1),4);
    sites[1:size(vertices,1),1:3]:=vertices;
    for face in 1:size(faces,1) loop
      a:=vertices[faces[face,1],:];b:=vertices[faces[face,2],:];c:=vertices[faces[face,3],:];
      area:=cross(b-a,c-a);weight:=75*sqrt(area*area);
      centroid:=size(vertices,1)+face;
      sites[centroid,:]:=cat(1,(a+b+c)/3,{weight});
      // All terms in skinContact's force law scale linearly with damping.
      for corner in 1:3 loop
        sites[faces[face,corner],4]:=sites[faces[face,corner],4]+weight;
      end for;
    end for;
  end contactQuadrature;
  final parameter Real contactSites[368,4]=contactQuadrature(cruiserShellVertices,cruiserShellFaces);
  function hullContact "Integrate terrain contact pressure over the cruiser shell triangles"
    input Real pos[3],cy,sy,rotation[3,3],velocity[3],spin[3],sites[:,4];
    output Real wrench[6];
  protected
    Real arm[3],point[3],contact[5],lowest;
  algorithm
    wrench:=zeros(6);
    // Project the local bounds of the hull and pilothouse into vertical ENU.
    lowest:=pos[3]-5.51*abs(rotation[3,1])-1.615*abs(rotation[3,2])+
      min(-.80*rotation[3,3],2.18*rotation[3,3]);
    if Shore.clearOfShore(pos[1],pos[2],lowest,5.7) then return;end if;
    for site in 1:size(sites,1) loop
      arm:=rotation*sites[site,1:3];
      point:=pos+{cy*arm[1]-sy*arm[2],sy*arm[1]+cy*arm[2],arm[3]};
      if not Shore.clearOfShore(point[1],point[2],point[3],0) then
        contact:=Shore.skinContact(point,cy,sy,velocity+cross(spin,arm),sites[site,4]);
        wrench[1:3]:=wrench[1:3]+contact[1:3];
        wrench[4:6]:=wrench[4:6]+cross(arm,contact[1:3]);
      end if;
    end for;
  end hullContact;
  final parameter Real stripArea[6]={(cruiserStations[j+1]-cruiserStations[j])*(halfStripBeam[j]+halfStripBeam[j+1]) for j in 1:6};
  final parameter Real stripX[6]={.5*(cruiserStations[j]+cruiserStations[j+1]) for j in 1:6};
  final parameter Real floatX=sum(stripArea.*stripX)/sum(stripArea);
  parameter Real addedHeaveMass=4800,rollInertia=11500,pitchInertia=65000 "Estimated wet inertias in kg and kg.m2";
  parameter Real initialEast=3,initialNorth=-15,initialHeading=1.5;
  Real stripVolume[2,6],stripForce[2,6],immersion[2,6],stripEast[2,6],stripNorth[2,6],stripZ[2,6];
  discrete Real panelSea[2,6](each start=0,each fixed=true),previousSea[2,6](each start=0,each fixed=true);
  Real rollRate(start=0,fixed=true),pitchRate(start=0,fixed=true);
  Real panelSignal;
  SurfaceHullWake hullWake(stations=cruiserStations,halfBeam=halfStripBeam,speed={surge,sway},
    strips=waves.sourceStrips,pose=boatPose,drift={waves.driftE,waves.driftN},sternArea=sternArea,
    sternDraft=sternDraft,diskInduction=propulsion.diskInduction,surfaceAccess=1-submergedDrag,omitWake=omitWake);
  output Real bowSources[14,6]=hullWake.sources,bowSpeed[2]=hullWake.velocity,bowFrame[4]=hullWake.frame;
  output Real sternFoamTrail[44,4]=hullWake.foam;
  Real sternArea,sternDraft;
  input Real throttleLever(start=0) "Astern -1 through neutral to ahead 1";
  input Real helmLever(start=0) "Positive port helm";
  input Real startEncounter(start=0);
  input Real lowerAnchor(start=0),wiperSwitch(start=0);
  input Real peerSubs[9,14](each start=0) "Nearby free-swimming Piccard poses and twists";
  discrete output Real peerHullWrench[6](each start=0,each fixed=true);
  input Real droneLandingLoad[6]=zeros(6) "Force and moment on the cruiser from a landed drone in ENU";
  output Real landingDeck[12] "Cruiser ENU deck pose and twist, with bow-up pitch";
  Real landingMoment[3],deckLoad[6];
  parameter Real initialHoistLevel(min=0,max=1)=1 "Hoist stroke at launch, stowed inboard by default";
  input Real sternLiftGoal(start=1) "Commanded stroke end, 0 lowered or 1 raised";
  input Real sternLiftOccupied(start=0) "Owner-confirmed Piccard aboard";
  output Real sternLiftState[2] "Fraction of stroke and rate per second";
  output Real sternLiftPose[15] "ENU rider position, velocity, forward, up and angular velocity";
  discrete output Real sternLiftBottomPose[15](each start=0,each fixed=true) "Last completed downstroke endpoint pose and twist in ENU";
  output Real sternLiftWrench[6] "External force and moment on the cruiser from the carried Piccard, ENU";
  parameter Real liftFormCd(min=0)=1.2, liftForkExposure(min=0,max=1)=.70
    "Estimated bluff-member drag coefficient and fore-aft wake shielding of the four tines";
  final parameter Integer liftKinematics=Wreck.PortLift.kinematics;
  final parameter Real liftHydroGeometry[Wreck.PortLift.count,15]=Wreck.PortLift.restGeometry();
  discrete output Real liftWaterWrench[6](each start=0,each fixed=true) "Bare lift hydrodynamic force and torque about cruiser origin, ENU";
  Real liftPhase,liftOrbitalSpeed,liftWaterVelocity[3];
  final parameter Real liftTravelSeconds=Wreck.PortLift.cycleSeconds;
  Real hoistGeometry[8],tipArm[3],tip[3],tipVelocity[3],cradleArm[3],cradleEye[3],cradleVelocity[3];
  discrete Real hoistState[14](each start=0,each fixed=true) "Hook position/velocity, force on tip, force on cradle, tension and seated flag";
  output Real sternHoistCable[8] "Boom tip XYZ, dynamic hook XYZ, winch payout [m], axial tension [N]";
  output Real sternHoistSeated "Piccard resting secured on the aft deck cradle";
  discrete Real liftLevel(start=initialHoistLevel,fixed=true),lastLiftSample(start=0,fixed=true);
  discrete Real liftSea(start=0,fixed=true),priorLiftSea(start=0,fixed=true);
  Real liftWaterline,liftRate,liftRotation[3,3],liftNormal[3],liftForward[3],liftOmega[3],carrierVelocity[3];
  output Real anchorGuide[2,3]=anchor.guide;
  output Real anchorState[12] "Anchor position, quaternion, bow roller position, line paid and grounded";
  input Real bilgePump(start=0);
  output Real bilgeState[4]=encounter.bilgeState;
  output Real wiperAngle "Sweep angle from park [rad]";
  discrete Real wiperPhase(start=0,fixed=true);
  Real animalMoment[3] "Animal torque in the yaw-aligned vessel axes";
  Real bowRollerArm[3],bowRoller[3],anchorMoment[3],anchorForce[3];
  output Real anchorHolding[2] "Fluke embedment fraction and rode tension [N]";
  CruiserAnchor anchor(bowX=5.51,sternX=-4.53,halfBeam=1.615,gunwale=-.53,stowed={initialEast+5.51*cos(initialHeading),initialNorth+5.51*sin(initialHeading),1.38},
    lower=lowerAnchor,sea=boatWater.tide,bowMount=bowRoller,boatRotation=yawRotation*rotation,
    angularVelocity=yawRotation*spin,
    bowVelocity={der(east),der(north),vertical}+cross(yawRotation*spin,bowRollerArm),
    current=boatWater.profile[1,2:3]);
  input Real encounterTargets[BreakwaterEncounter.targetCount,7]=zeros(BreakwaterEncounter.targetCount,7);
  BreakwaterEncounter encounter(bilgePump=bilgePump,hullVertices=cruiserContactVertices,hullFaces=cruiserContactFaces,
    cabinVertices=cabinContactVertices,cabinFaces=cabinContactFaces,activate=startEncounter,tide=boatWater.tide,boat=boatPose,
    vesselVelocity={der(east),der(north),vertical},angularVelocity=yawRotation*spin,
    vesselMass=wetMass,panelSurface=damageSurface,targets=encounterTargets);
  output Real encounterShark[10],structuralImpact[8],hullIntegrity[6],flooding[6,5],damagePanels[6,3],
    encounterHealth[BreakwaterEncounter.targetCount,2],boatDamage[3];
  Real damageSurface[6],yawRotation[3,3],damageMoment[3],wetMass,submergedDrag;
  input Real traffic[4,9](each start=0) "Peer surface vessel states";
  input Real trafficTilt[4,2]=zeros(4,2),npcTilt[5,2]=zeros(5,2);
  input Real npcVessels[5,9]=zeros(5,9);
  Real east(start=initialEast,fixed=true),north(start=initialNorth,fixed=true),yaw(start=initialHeading,fixed=true);
  Real surge(start=0,fixed=true),yawRate(start=0,fixed=true),shaftRPM(start=0,fixed=true);
  Real pitch(start=0,fixed=true),roll(start=0,fixed=true),z(start=0),vertical(start=0,fixed=true);
  input Real swimmerWater[15](each start=0) "Local swimmer-wave elevations at twelve hull panels, centre elevation, forward and port slopes";
  input Real animalJoints[10,4]=zeros(10,4);
  input Real animalTraffic[10,9](each start=0);
  input Real animals[2,6](each start=0);
  discrete Real animalWrench[6](each start=0,each fixed=true);
  Real thrust,sway(start=0,fixed=true);
  Real rotation[3,3],spin[3];
  output Real boatPose[6],engine[4] "ENU pose; shaft rpm, through-water speed, thrust, rudder angle";
  parameter Real engineOffAfter=10 "Neutral time before the starter is required again [s]";
  parameter Real engineCrankTime=1 "Starter engagement time [s]";
  output Real engineIdleTime=powerplant.idleTime;
  output Real starterRemaining=powerplant.starterRemaining "Starter time left [s]";
  final parameter Real fuelCapacity=598,fuelCenter[3]={-1.42,0,-.27};
  Marine.Powerboats.EngineFuelSystem powerplant(capacity=fuelCapacity,tankCenter=fuelCenter,idleFuelRate=6,fullFuelRate=182,
    engineOffAfter=engineOffAfter,engineCrankTime=engineCrankTime,throttleLever=throttleLever);
  output Real fuelState[6]=powerplant.fuelState,engineRunning=powerplant.engineRunning;
  output Real inertiaState[7]={wetMass,rollInertia,pitchInertia,34000,floatX,0,0};
  Real fuelMassChange,fuelMoment[3],planingFraction,quadraticDrag,linearDrag;
  Real effectiveThrottle;
  parameter Real shaftRpmAhead=2900,shaftRpmAstern=1100 "Governed shaft speed limits [rev/min]";
  Real driveForce[3](each unit="N"),driveMoment[3](each unit="N.m");
  TwinSterndrive propulsion(rpm=if starterRemaining>1e-8 then 0 else shaftRPM,
    helm=helmLever,surge=surge,focus=focus,yaw=yaw,rotation=rotation,tile=boatWater.tile,tide=boatWater.tide,swell=swell);
  output Real propellerWetFraction=propulsion.wetFraction;
  output Real driveGeometry[5]={propulsion.diameter,propulsion.halfSpacing,propulsion.transomX,propulsion.shaftZ,.37};
  output Real propulsorLoads[2,6]=propulsion.loads;
  discrete output Real peerForce[3](each start=0,each fixed=true),peerContact[4](each start=0,each fixed=true);
  discrete output Real sceneForce[3](each start=0,each fixed=true),sceneContact[6](each start=0,each fixed=true),committeeReaction[3](each start=0,each fixed=true);
  discrete output Real shoreWrench[6](each start=0,each fixed=true) "Terrain force and moment in level heading axes";
initial equation
  z=boatWater.tide;
equation
  panelSignal=sum(abs(swimmerWater[j]) for j in 1:12);
  for h in 1:2 loop
    for j in 1:6 loop
      stripEast[h,j]=east+cos(yaw)*stripX[j]*cos(pitch)-sin(yaw)*(3-2*h)*stripOffset*cos(roll);
      stripNorth[h,j]=north+sin(yaw)*stripX[j]*cos(pitch)+cos(yaw)*(3-2*h)*stripOffset*cos(roll);
      stripZ[h,j]=z-(stripX[j]-floatX)*sin(pitch)+(3-2*h)*stripOffset*sin(roll)*cos(pitch);
      immersion[h,j]=(1-waterFraction)*previousSea[h,j]+waterFraction*panelSea[h,j]
        +swell[1]*sin(swell[2]+stripEast[h,j]*swell[3]+stripNorth[h,j]*swell[4])+encounter.waveSurge[h]-stripZ[h,j]
        +(if noEvent(panelSignal>1e-9) then swimmerWater[(h-1)*6+j] else swimmerWater[13]+stripX[j]*swimmerWater[14]+(3-2*h)*stripOffset*swimmerWater[15]);
      stripVolume[h,j]=(1-.30*max(0,1-encounter.integrity[(h-1)*3+div(j-1,2)+1]/45))*
        immersedVolume(.5*(referenceMass/1025)*displacementFraction[j],stripArea[j],immersion[h,j]);
      stripForce[h,j]=1025*9.80665*(stripVolume[h,j]-.5*(referenceMass/1025)*displacementFraction[j]);
    end for;
  end for;
  sternArea=sum(stripVolume[:,1])/(cruiserStations[2]-cruiserStations[1]);
  // The aft V section has approximately half the area of its enclosing rectangle.
  sternDraft=sternArea/(halfStripBeam[1]+halfStripBeam[2]);
  when sample(0,wakeInterval) then
    // The strips radiate from their changing displacement. Their radiation
    // reaction is represented by the heave and angular damping below.
    liftSea=boatWater.tide+Wreck.Perception.seaHeight(boatWater.tile,tip[1],tip[2]);
    priorLiftSea=if initial() then liftSea else pre(liftSea);
    panelSea=panelElevations(boatWater.tile,stripEast,stripNorth,boatWater.tide);
    previousSea=if initial() then panelSea else pre(panelSea);
  end when;
  when sample(0,.025) then
    animalWrench=WildlifeContact(animals,boatPose,{der(east),der(north),yawRate},referenceMass,9.22,1.615,.0,.58,animalTraffic,animalJoints);
  end when;
  focus={east,north,z}; committeeLoad={committeeReaction[1],committeeReaction[2],0,0,0,committeeReaction[3]};
  rotation=[cos(pitch),sin(pitch)*sin(roll),sin(pitch)*cos(roll);
    0,cos(roll),-sin(roll);
    -sin(pitch),cos(pitch)*sin(roll),cos(pitch)*cos(roll)];
  spin={rollRate*cos(pitch),pitchRate,yawRate-rollRate*sin(pitch)};
  driveForce=rotation*propulsion.force;
  driveMoment=rotation*propulsion.moment;
  yawRotation=[cos(yaw),-sin(yaw),0;sin(yaw),cos(yaw),0;0,0,1];
  bowRollerArm=yawRotation*rotation*{5.51,0,1.38};
  bowRoller=focus+bowRollerArm;
  anchorForce=if noEvent(anchor.paid>.22 or lowerAnchor>.5) then anchor.reaction else zeros(3);
  anchorMoment=transpose(yawRotation)*cross(anchor.guide[2,:]-focus,anchorForce);
  liftRate=if sternLiftGoal>.5 and liftLevel<1 then 1/liftTravelSeconds
    elseif sternLiftGoal<=.5 and liftLevel>0 then -1/liftTravelSeconds else 0;
  sternLiftState={liftLevel,liftRate};
  liftRotation=yawRotation*rotation;
  hoistGeometry=Wreck.PortLift.hoist(liftLevel);
  liftOmega=yawRotation*spin;
  carrierVelocity={der(east),der(north),vertical};
  tipArm=liftRotation*hoistGeometry[1:3];tip=focus+tipArm;
  tipVelocity=carrierVelocity+cross(liftOmega,tipArm)+liftRotation*hoistGeometry[5:7]*liftRate;
  liftNormal=liftRotation[:,3];liftForward=liftRotation[:,1];
  cradleArm=liftRotation*Wreck.PortLift.cradle;
  cradleEye=focus+cradleArm+Wreck.PortLift.bridleHeight*liftNormal;
  cradleVelocity=carrierVelocity+cross(liftOmega,cradleEye-focus);
  // A four-leg bridle guides body attitude in the carrier's fore/aft direction.
  // The cable determines translational swing, and the cradle supports the stowed hull.
  sternLiftPose=cat(1,hoistState[1:3]-Wreck.PortLift.bridleHeight*liftNormal,
    hoistState[4:6]-Wreck.PortLift.bridleHeight*cross(liftOmega,liftNormal),liftForward,liftNormal,liftOmega);
  sternHoistCable=cat(1,tip,hoistState[1:3],{hoistGeometry[4],hoistState[13]});
  sternHoistSeated=if sternLiftOccupied>.5 then hoistState[14] else 0;
  liftWaterline=(1-waterFraction)*priorLiftSea+waterFraction*liftSea+.5*sum(encounter.waveSurge)
    +swell[1]*sin(swell[2]+tip[1]*swell[3]+tip[2]*swell[4])
    +swimmerWater[13]+hoistGeometry[1]*swimmerWater[14]+hoistGeometry[2]*swimmerWater[15];
  liftPhase=swell[2]+tip[1]*swell[3]+tip[2]*swell[4];
  liftOrbitalSpeed=swell[1]*swellOmega*exp(min(0,swellK*(tip[3]-hoistGeometry[4]-liftWaterline)));
  liftWaterVelocity={boatWater.profile[1,2],boatWater.profile[1,3],0}+
    liftOrbitalSpeed*{cos(swellBearing)*sin(liftPhase),sin(swellBearing)*sin(liftPhase),-cos(liftPhase)};
  when sample(0,.02) then
    liftWaterWrench=Wreck.portLiftWaterLoad(liftHydroGeometry,liftLevel,liftRate,focus,liftRotation,
      {der(east),der(north),vertical},liftOmega,liftWaterline,liftWaterVelocity,liftFormCd,liftForkExposure);
  end when;
  sternLiftWrench=cat(1,hoistState[7:9]+hoistState[10:12],
    cross(tipArm,hoistState[7:9])+cross(cradleArm,hoistState[10:12]));
  when sample(0,.02) then
    peerHullWrench=Wreck.peerHullLoad(cat(1,{1},focus,LieGroups.SO3.Quat.from_DCM(liftRotation),
      {der(east),der(north),vertical},liftOmega),peerSubs,false,sternLiftState);
  end when;
  deckLoad=droneLandingLoad+sternLiftWrench+liftWaterWrench+race.racerLoad+peerHullWrench;
  landingMoment=transpose(yawRotation)*deckLoad[4:6];
  animalMoment=transpose(yawRotation)*animalWrench[4:6];
  landingDeck=cat(1,{east,north,z,yaw,roll,-pitch,der(east),der(north),vertical},yawRotation*spin);
  anchorHolding={anchor.embedment,anchor.tension};
  anchorState=cat(1,anchor.position,anchor.orientation,bowRoller,{anchor.paid,anchor.grounded});
  when sample(0,.02) then
    // Co-simulation can revisit a sample boundary. Integrate only elapsed
    // simulation time so each interval contributes at most once.
    lastLiftSample=time;
    liftLevel=if sternLiftGoal>.5 then min(1,pre(liftLevel)+max(0,time-pre(lastLiftSample))/liftTravelSeconds)
      else max(0,pre(liftLevel)-max(0,time-pre(lastLiftSample))/liftTravelSeconds);
    hoistState=Wreck.hoistCableStep(pre(hoistState),max(0,time-pre(lastLiftSample)),tip,tipVelocity,
      hoistGeometry[4],hoistGeometry[8]*liftRate,cradleEye,cradleVelocity,liftRotation,liftWaterline,
      liftWaterVelocity,liftLevel,sternLiftOccupied>.5,time<1e-8);
    sternLiftBottomPose=if pre(liftLevel)>0 and liftLevel<=0 then sternLiftPose else pre(sternLiftBottomPose);
    wiperPhase=if wiperSwitch>.5 then mod(pre(wiperPhase)+.02,1.12)
      elseif pre(wiperPhase)>.001 and pre(wiperPhase)+.02<1.12 then pre(wiperPhase)+.02 else 0;
  end when;
  wiperAngle=.71*(1-cos(2*Modelica.Constants.pi*wiperPhase/1.12));
  // Cable and cradle reactions already transmit payload inertia to the hull.
  fuelMassChange=powerplant.fuelMass-.740*fuelCapacity;
  wetMass=referenceMass+encounter.waterMass+fuelMassChange;
  fuelMoment=cross(rotation*fuelCenter,{0,0,-9.80665*fuelMassChange});
  submergedDrag=max(0,min(1,(boatWater.tide-z-.65)/1.05));
  damageMoment=transpose(yawRotation)*encounter.collisionMoment;
  for p in 1:6 loop
    damageSurface[p]=.5*((1-waterFraction)*(previousSea[div(p-1,3)+1,2*mod(p-1,3)+1]+
      previousSea[div(p-1,3)+1,2*mod(p-1,3)+2])+waterFraction*(panelSea[div(p-1,3)+1,2*mod(p-1,3)+1]+
      panelSea[div(p-1,3)+1,2*mod(p-1,3)+2]))+
      swell[1]*sin(swell[2]+(east+cos(yaw)*encounter.bodyPoints[p,1]-sin(yaw)*encounter.bodyPoints[p,2])*swell[3]+
      (north+sin(yaw)*encounter.bodyPoints[p,1]+cos(yaw)*encounter.bodyPoints[p,2])*swell[4]);
  end for;
  encounterShark=encounter.shark;
  structuralImpact=encounter.impact;
  hullIntegrity=encounter.integrity;
  flooding=encounter.flooding;
  damagePanels=encounter.bodyPoints;
  encounterHealth=encounter.victimHealth;
  boatDamage={encounter.hullHealth,encounter.waterMass,encounter.sinkState};
  // A 100 Hz contact sample resolves the compliant bed independently of solver stages.
  when sample(0,.01) then
    shoreWrench=hullContact(focus,cos(yaw),sin(yaw),rotation,
    {surge+cos(yaw)*boatWater.profile[1,2]+sin(yaw)*boatWater.profile[1,3],
    sway-sin(yaw)*boatWater.profile[1,2]+cos(yaw)*boatWater.profile[1,3],vertical},spin,contactSites);
  end when;
  when sample(0,.02) then
    (peerForce,peerContact)=Sailboat.contactWrench({east,north,yaw,der(east),der(north),yawRate,z},traffic,2,{roll,pitch},trafficTilt);
    (sceneForce,sceneContact,committeeReaction)=Sailboat.contactWrench({east,north,yaw,der(east),der(north),yawRate,z},
      cat(1,npcVessels,[1,race.committeeEast,race.committeeNorth,race.deckState[4],race.deckState[7],race.deckState[8],race.deckState[12],race.launchPose[1],3]),
      2,{roll,pitch},cat(1,npcTilt,[race.launchPose[2],-race.launchPose[3]]));
  end when;
  effectiveThrottle=if encounter.waterMass>1650 then 0 else powerplant.engineRunning*powerplant.throttle;
  planingFraction=noEvent(max(0,min(1,(surge-4)/7)));
  quadraticDrag=192*(1-planingFraction)+24.3*planingFraction;
  linearDrag=240*(1-planingFraction)+38*planingFraction;
  der(shaftRPM)=((if effectiveThrottle>=0 then shaftRpmAhead else shaftRpmAstern)*effectiveThrottle-shaftRPM)/.85;
  thrust=propulsion.thrust;
  der(surge)=sway*yawRate+(driveForce[1]+(animalWrench[1]+peerForce[1]+sceneForce[1]+encounter.collisionForce[1]+anchorForce[1]+deckLoad[1])*cos(yaw)+(animalWrench[2]+peerForce[2]+sceneForce[2]+encounter.collisionForce[2]+anchorForce[2]+deckLoad[2])*sin(yaw)+shoreWrench[1]
    -quadraticDrag*surge*abs(surge)-linearDrag*surge)/wetMass;
  der(yawRate)=-yawRate/.9+(driveMoment[3]+animalWrench[6]+shoreWrench[6]+peerForce[3]+sceneForce[3]+damageMoment[3]+anchorMoment[3]+landingMoment[3])/(34000+3.6*encounter.waterMass+fuelMassChange*fuelCenter[1]^2);
  der(yaw)=yawRate;
  der(sway)=-surge*yawRate+(driveForce[2]-sin(yaw)*(animalWrench[1]+peerForce[1]+sceneForce[1]+encounter.collisionForce[1]+anchorForce[1]+deckLoad[1])+cos(yaw)*(animalWrench[2]+peerForce[2]+sceneForce[2]+encounter.collisionForce[2]+anchorForce[2]+deckLoad[2])+shoreWrench[2])/wetMass-(1.5+.45*abs(sway))*sway;
  der(east)=surge*cos(yaw)-sway*sin(yaw)+boatWater.profile[1,2];
  der(north)=surge*sin(yaw)+sway*cos(yaw)+boatWater.profile[1,3];
  der(vertical)=(sum(stripForce)+animalWrench[3]+driveForce[3]+shoreWrench[3]+encounter.collisionForce[3]+anchorForce[3]+deckLoad[3]-9.80665*(encounter.waterMass+fuelMassChange)
    -16500*vertical)/(wetMass+addedHeaveMass);der(z)=vertical;
  // Restoring moments about the centre of flotation. Roll stiffness accounts
  // for the raised centre of gravity; turning and thrust also trim the hull.
  der(rollRate)=(.68*stripOffset*sum(stripForce[1,j]-stripForce[2,j] for j in 1:6)
    +driveMoment[1]+animalMoment[1]+shoreWrench[4]+damageMoment[1]+anchorMoment[1]+landingMoment[1]+encounter.rollMoment+fuelMoment[1]-(7400+18000*submergedDrag)*rollRate-1950*surge*yawRate)/(rollInertia+.65*encounter.waterMass+fuelMassChange*fuelCenter[3]^2);der(roll)=rollRate;
  der(pitchRate)=(-sum((stripX[j]-floatX)*(stripForce[1,j]+stripForce[2,j]) for j in 1:6)
    +driveMoment[2]+animalMoment[2]+shoreWrench[5]+damageMoment[2]+anchorMoment[2]+landingMoment[2]+encounter.pitchMoment+fuelMoment[2]-(47000+52000*submergedDrag)*pitchRate)/(pitchInertia+3.5*encounter.waterMass+fuelMassChange*(fuelCenter[1]^2+fuelCenter[3]^2));der(pitch)=pitchRate;
  boatPose={east,north,z,roll,pitch,yaw};
  engine={shaftRPM,sqrt(surge^2+sway^2),thrust,propulsion.steering};
end OceanMotorboat;
