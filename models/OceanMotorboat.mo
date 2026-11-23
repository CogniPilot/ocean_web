model OceanMotorboat "Single inboard cabin cruiser with a shaft propeller and rudder"
  extends OceanMission(waves(localHull=true,heading=yaw,heel=roll,pitch=pitch,
    stations=cruiserStations,beamHalf=halfStripBeam,separation=.55,volume=stripVolume));
  // Two longitudinal halves of the single chine hull. Their displaced volumes
  // sum to the 3250 kg design displacement in seawater at the trimmed waterline.
  parameter Real cruiserStations[7]={-3.8,-2.7,-1.55,-.2,1.2,2.45,3.82};
  parameter Real halfStripBeam[7]={.53,.64,.67,.65,.59,.46,.02};
  parameter Real displacementFraction[6]={.15,.20,.23,.21,.15,.06};
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
  function hullContact "Terrain wrench on the cruiser keel and chines"
    input Real pos[3],cy,sy,rotation[3,3],velocity[3],spin[3];
    output Real wrench[6];
  protected
    // ENU hull-local points follow the bottom of the rendered V-hull.
    constant Real probes[17,3]=[
      -3.70,0,-.57; -2.70,0,-.70; -1.50,0,-.75; -.20,0,-.79;
      1.05,0,-.76; 2.05,0,-.62; 2.62,0,-.37; 3.25,0,-.13; 3.76,0,.25;
      -3.60,-.81,-.26; -3.60,.81,-.26; -1.55,-.99,-.32; -1.55,.99,-.32;
      .60,-.96,-.33; .60,.96,-.33; 2.45,-.58,-.14; 2.45,.58,-.14];
    Real arm[3],point[3],contact[5];
  algorithm
    wrench:=zeros(6);
    if not Shore.aboveFlatBottom(pos[1],pos[2],pos[3],4) then
      for probe in 1:size(probes,1) loop
        arm:=rotation*probes[probe,:];
        point:=pos+{cy*arm[1]-sy*arm[2],sy*arm[1]+cy*arm[2],arm[3]};
        if not Shore.aboveFlatBottom(point[1],point[2],point[3],0) then
          contact:=Shore.skinContact(point,cy,sy,velocity+cross(spin,arm),1000);
          wrench[1:3]:=wrench[1:3]+contact[1:3];
          wrench[4:6]:=wrench[4:6]+cross(arm,contact[1:3]);
        end if;
      end for;
    end if;
  end hullContact;
  final parameter Real stripArea[6]={(cruiserStations[j+1]-cruiserStations[j])*(halfStripBeam[j]+halfStripBeam[j+1]) for j in 1:6};
  final parameter Real stripX[6]={.5*(cruiserStations[j]+cruiserStations[j+1]) for j in 1:6};
  final parameter Real floatX=sum(stripArea.*stripX)/sum(stripArea);
  parameter Real addedHeaveMass=2600,rollInertia=3600,pitchInertia=22500 "Estimated wet inertias in kg and kg.m2";
  parameter Real initialEast=3,initialNorth=-15,initialHeading=1.5;
  Real stripVolume[2,6],stripForce[2,6],immersion[2,6],stripEast[2,6],stripNorth[2,6],stripZ[2,6];
  discrete Real panelSea[2,6](each start=0,each fixed=true),previousSea[2,6](each start=0,each fixed=true);
  Real rollRate(start=0,fixed=true),pitchRate(start=0,fixed=true);
  Real panelSignal;
  discrete output Real bowSources[14,6](each start=0,each fixed=true),bowSpeed[2](each start=0,each fixed=true);
  discrete Real bowFrame[4](each start=0,each fixed=true);
  input Real throttleLever(start=0) "Astern -1 through neutral to ahead 1";
  input Real helmLever(start=0) "Positive port helm";
  input Real startEncounter(start=0);
  input Real lowerAnchor(start=0),wiperSwitch(start=0);
  output Real anchorState[12] "Anchor position, quaternion, bow roller position, line paid and grounded";
  output Real wiperAngle "Sweep angle from park [rad]";
  discrete Real wiperPhase(start=0,fixed=true);
  Real bowRollerArm[3],bowRoller[3],anchorMoment[3],anchorForce[3];
  CruiserAnchor anchor(stowed={initialEast+3.25*cos(initialHeading),initialNorth+3.25*sin(initialHeading),1.12},
    lower=lowerAnchor,sea=boatWater.tide,mount=bowRoller,
    mountVelocity={der(east),der(north),vertical}+cross(yawRotation*spin,bowRollerArm),
    current=boatWater.profile[1,2:3]);
  input Real encounterTargets[BreakwaterEncounter.targetCount,7]=zeros(BreakwaterEncounter.targetCount,7);
  BreakwaterEncounter encounter(activate=startEncounter,tide=boatWater.tide,boat=boatPose,
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
  parameter Real engineOffAfter=1.8 "Neutral time before the starter is required again [s]";
  parameter Real engineCrankTime=1 "Starter engagement time [s]";
  discrete Real engineIdleTime(start=engineOffAfter,fixed=true);
  discrete output Real starterRemaining(start=0,fixed=true) "Starter time left [s]";
  Real effectiveThrottle;
  discrete output Real peerForce[3](each start=0,each fixed=true),peerContact[4](each start=0,each fixed=true);
  discrete output Real sceneForce[3](each start=0,each fixed=true),sceneContact[6](each start=0,each fixed=true);
  output Real shoreWrench[6] "Terrain force and moment in level heading axes";
initial equation
  z=boatWater.tide;
equation
  panelSignal=sum(abs(swimmerWater[j]) for j in 1:12);
  for h in 1:2 loop
    for j in 1:6 loop
      stripEast[h,j]=east+cos(yaw)*stripX[j]*cos(pitch)-sin(yaw)*(3-2*h)*.55*cos(roll);
      stripNorth[h,j]=north+sin(yaw)*stripX[j]*cos(pitch)+cos(yaw)*(3-2*h)*.55*cos(roll);
      stripZ[h,j]=z-(stripX[j]-floatX)*sin(pitch)+(3-2*h)*.55*sin(roll)*cos(pitch);
      immersion[h,j]=(1-waterFraction)*previousSea[h,j]+waterFraction*panelSea[h,j]
        +swell[1]*sin(swell[2]+stripEast[h,j]*swell[3]+stripNorth[h,j]*swell[4])+encounter.waveSurge[h]-stripZ[h,j]
        +(if noEvent(panelSignal>1e-9) then swimmerWater[(h-1)*6+j] else swimmerWater[13]+stripX[j]*swimmerWater[14]+(3-2*h)*.55*swimmerWater[15]);
      stripVolume[h,j]=(1-.30*max(0,1-encounter.integrity[(h-1)*3+div(j-1,2)+1]/45))*
        immersedVolume(.5*(3250/1025)*displacementFraction[j],stripArea[j],immersion[h,j]);
      stripForce[h,j]=1025*9.80665*(stripVolume[h,j]-.5*(3250/1025)*displacementFraction[j]);
    end for;
  end for;
  when sample(0,.1) then
    // The strips radiate from their changing displacement. Their radiation
    // reaction is represented by the heave and angular damping below.
    panelSea=panelElevations(boatWater.tile,stripEast,stripNorth,boatWater.tide);
    previousSea=if initial() then panelSea else pre(panelSea);
    bowSpeed=if omitWake<.5 then {surge,0} else zeros(2);
    bowFrame={east,north,cos(yaw),sin(yaw)};
    bowSources=if omitWake<.5 then BowWavePatch.hullSources(bowSpeed,
      BowWavePatch.localStrips(waves.sourceStrips,bowFrame),cruiserStations,halfStripBeam) else zeros(14,6);
  end when;
  when sample(0,.025) then
    animalWrench=WildlifeContact(animals,boatPose,{der(east),der(north),yawRate},3250,7.6,1.22,.0,.58,animalTraffic,animalJoints);
  end when;
  focus={east,north,z}; committeeLoad=zeros(6);
  rotation=[cos(pitch),sin(pitch)*sin(roll),sin(pitch)*cos(roll);
    0,cos(roll),-sin(roll);
    -sin(pitch),cos(pitch)*sin(roll),cos(pitch)*cos(roll)];
  spin={rollRate*cos(pitch),pitchRate,yawRate-rollRate*sin(pitch)};
  yawRotation=[cos(yaw),-sin(yaw),0;sin(yaw),cos(yaw),0;0,0,1];
  bowRollerArm=yawRotation*rotation*{3.25,0,.83};
  bowRoller=focus+bowRollerArm;
  anchorForce=if noEvent(anchor.paid>.22 or lowerAnchor>.5) then anchor.reaction else zeros(3);
  anchorMoment=transpose(yawRotation)*cross(bowRollerArm,anchorForce);
  anchorState=cat(1,anchor.position,anchor.orientation,bowRoller,{anchor.paid,anchor.grounded});
  when sample(0,.02) then
    wiperPhase=if wiperSwitch>.5 then mod(pre(wiperPhase)+.02,1.12)
      elseif pre(wiperPhase)>.001 and pre(wiperPhase)+.02<1.12 then pre(wiperPhase)+.02 else 0;
  end when;
  wiperAngle=.71*(1-cos(2*Modelica.Constants.pi*wiperPhase/1.12));
  wetMass=3250+encounter.waterMass;
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
  shoreWrench=hullContact(focus,cos(yaw),sin(yaw),rotation,
    {surge+cos(yaw)*boatWater.profile[1,2]+sin(yaw)*boatWater.profile[1,3],
    sway-sin(yaw)*boatWater.profile[1,2]+cos(yaw)*boatWater.profile[1,3],vertical},spin);
  when sample(0,.02) then
    (peerForce,peerContact)=Sailboat.contactWrench({east,north,yaw,der(east),der(north),yawRate,z},traffic,2,{roll,pitch},trafficTilt);
    (sceneForce,sceneContact)=Sailboat.contactWrench({east,north,yaw,der(east),der(north),yawRate,z},
      cat(1,npcVessels,[1,race.committeeEast,race.committeeNorth,prevailingBearing+Modelica.Constants.pi,0,0,0,race.launchPose[1],3]),
      2,{roll,pitch},cat(1,npcTilt,[race.launchPose[2],-race.launchPose[3]]));
  end when;
  when sample(0,.01) then
    starterRemaining=if abs(throttleLever)>.008 and pre(engineIdleTime)>=engineOffAfter
      then engineCrankTime else max(0,pre(starterRemaining)-.01);
    engineIdleTime=if abs(throttleLever)>.008 then 0 else min(engineOffAfter,pre(engineIdleTime)+.01);
  end when;
  effectiveThrottle=if starterRemaining>1e-8 or encounter.waterMass>1650 then 0 else throttleLever;
  der(shaftRPM)=(if effectiveThrottle>=0 then 1850*effectiveThrottle-shaftRPM else 1100*effectiveThrottle-shaftRPM)/.85;
  thrust=if starterRemaining>1e-8 then 0 else .0025*shaftRPM*abs(shaftRPM);
  der(surge)=(thrust+(animalWrench[1]+peerForce[1]+sceneForce[1]+encounter.collisionForce[1]+anchorForce[1])*cos(yaw)+(animalWrench[2]+peerForce[2]+sceneForce[2]+encounter.collisionForce[2]+anchorForce[2])*sin(yaw)+shoreWrench[1]
    -118*surge*abs(surge)-180*surge)/wetMass;
  der(yawRate)=(.085*helmLever*surge+.025*helmLever*shaftRPM/1850-yawRate)/.9+(animalWrench[6]+shoreWrench[6]+peerForce[3]+sceneForce[3]+damageMoment[3]+anchorMoment[3])/(14000+3.6*encounter.waterMass);
  der(yaw)=yawRate;
  der(sway)=(-sin(yaw)*(animalWrench[1]+peerForce[1]+sceneForce[1]+encounter.collisionForce[1]+anchorForce[1])+cos(yaw)*(animalWrench[2]+peerForce[2]+sceneForce[2]+encounter.collisionForce[2]+anchorForce[2])+shoreWrench[2])/wetMass-(1.5+.45*abs(sway))*sway;
  der(east)=surge*cos(yaw)-sway*sin(yaw)+boatWater.profile[1,2];
  der(north)=surge*sin(yaw)+sway*cos(yaw)+boatWater.profile[1,3];
  der(vertical)=(sum(stripForce)+shoreWrench[3]+encounter.collisionForce[3]+anchorForce[3]-9.80665*encounter.waterMass
    -16500*vertical)/(wetMass+addedHeaveMass);der(z)=vertical;
  // Restoring moments about the centre of flotation. Roll stiffness accounts
  // for the raised centre of gravity; turning and thrust also trim the hull.
  der(rollRate)=(.68*.55*sum(stripForce[1,j]-stripForce[2,j] for j in 1:6)
    +shoreWrench[4]+damageMoment[1]+anchorMoment[1]+encounter.rollMoment-(7400+18000*submergedDrag)*rollRate-1950*surge*yawRate)/(rollInertia+.65*encounter.waterMass);der(roll)=rollRate;
  der(pitchRate)=(-sum((stripX[j]-floatX)*(stripForce[1,j]+stripForce[2,j]) for j in 1:6)
    +shoreWrench[5]+damageMoment[2]+anchorMoment[2]+encounter.pitchMoment-(47000+52000*submergedDrag)*pitchRate-.65*thrust)/(pitchInertia+3.5*encounter.waterMass);der(pitch)=pitchRate;
  boatPose={east,north,z,roll,pitch,yaw};
  engine={shaftRPM,surge,thrust,.52*helmLever};
end OceanMotorboat;
