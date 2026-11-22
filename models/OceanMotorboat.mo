model OceanMotorboat "Single inboard cabin cruiser with a shaft propeller and rudder"
  extends OceanMission(waves(localHull=true,heading=yaw,heel=roll,pitch=pitch,
    stations=cruiserStations,beamHalf=halfStripBeam,separation=.55,volume=stripVolume));
  // Two longitudinal halves of the single chine hull. Their displaced volumes
  // sum to the 3250 kg design displacement in seawater at the trimmed waterline.
  parameter Real cruiserStations[7]={-3.8,-2.7,-1.55,-.2,1.2,2.45,3.82};
  parameter Real halfStripBeam[7]={.53,.64,.67,.65,.59,.46,.02};
  parameter Real displacementFraction[6]={.15,.20,.23,.21,.15,.06};
  function panelElevations
    input Real tile[32,32],wake[2,6],east[2,6],north[2,6],tide;
    output Real elevations[2,6];
  algorithm
    for h in 1:2 loop
      for j in 1:6 loop
        elevations[h,j]:=tide+wake[h,j]+Wreck.Perception.seaHeight(tile,east[h,j],north[h,j]);
      end for;
    end for;
  end panelElevations;
  final parameter Real stripArea[6]={(cruiserStations[j+1]-cruiserStations[j])*(halfStripBeam[j]+halfStripBeam[j+1]) for j in 1:6};
  final parameter Real stripX[6]={.5*(cruiserStations[j]+cruiserStations[j+1]) for j in 1:6};
  final parameter Real floatX=sum(stripArea.*stripX)/sum(stripArea);
  parameter Real addedHeaveMass=2600,rollInertia=3600,pitchInertia=22500 "Estimated wet inertias in kg and kg.m2";
  parameter Real initialHeading=1.5;
  Real stripVolume[2,6],stripForce[2,6],immersion[2,6],stripEast[2,6],stripNorth[2,6],stripZ[2,6];
  discrete Real panelSea[2,6](each start=0,each fixed=true),previousSea[2,6](each start=0,each fixed=true);
  Real rollRate(start=0,fixed=true),pitchRate(start=0,fixed=true);
  Real panelSignal;
  discrete output Real bowSources[14,6](each start=0,each fixed=true),bowSpeed[2](each start=0,each fixed=true);
  discrete Real bowFrame[4](each start=0,each fixed=true);
  input Real throttleLever(start=0) "Astern -1 through neutral to ahead 1";
  input Real helmLever(start=0) "Positive port helm";
  Real east(start=3,fixed=true),north(start=-15,fixed=true),yaw(start=initialHeading,fixed=true);
  Real surge(start=0,fixed=true),yawRate(start=0,fixed=true),shaftRPM(start=0,fixed=true);
  Real pitch(start=0,fixed=true),roll(start=0,fixed=true),z(start=0,fixed=true),vertical(start=0,fixed=true);
  input Real swimmerWater[15](each start=0) "Local swimmer-wave elevations at twelve hull panels, centre elevation, forward and port slopes";
  input Real animalTraffic[10,9](each start=0);
  input Real animals[2,6](each start=0);
  discrete Real animalWrench[6](each start=0,each fixed=true);
  Real thrust,sway(start=0,fixed=true);
  output Real boatPose[6],engine[4] "ENU pose; shaft rpm, through-water speed, thrust, rudder angle";
equation
  panelSignal=sum(abs(swimmerWater[j]) for j in 1:12);
  for h in 1:2 loop
    for j in 1:6 loop
      stripEast[h,j]=east+cos(yaw)*stripX[j]*cos(pitch)-sin(yaw)*(3-2*h)*.55*cos(roll);
      stripNorth[h,j]=north+sin(yaw)*stripX[j]*cos(pitch)+cos(yaw)*(3-2*h)*.55*cos(roll);
      stripZ[h,j]=z-(stripX[j]-floatX)*sin(pitch)+(3-2*h)*.55*sin(roll)*cos(pitch);
      immersion[h,j]=(1-waterFraction)*previousSea[h,j]+waterFraction*panelSea[h,j]
        +swell[1]*sin(swell[2]+stripEast[h,j]*swell[3]+stripNorth[h,j]*swell[4])-stripZ[h,j]
        +(if noEvent(panelSignal>1e-9) then swimmerWater[(h-1)*6+j] else swimmerWater[13]+stripX[j]*swimmerWater[14]+(3-2*h)*.55*swimmerWater[15]);
      stripVolume[h,j]=max(0,min(1.25*(3250/1025)*displacementFraction[j],
        .5*(3250/1025)*displacementFraction[j]+stripArea[j]*immersion[h,j]));
      stripForce[h,j]=1025*9.80665*(stripVolume[h,j]-.5*(3250/1025)*displacementFraction[j]);
    end for;
  end for;
  when sample(0,.1) then
    panelSea=panelElevations(boatWater.tile,pre(waves.sectionHeight),stripEast,stripNorth,boatWater.tide);
    previousSea=if initial() then panelSea else pre(panelSea);
    bowSpeed=if omitWake<.5 then {surge,0} else zeros(2);
    bowFrame={east,north,cos(yaw),sin(yaw)};
    bowSources=if omitWake<.5 then BowWavePatch.hullSources(bowSpeed,
      BowWavePatch.localStrips(waves.sourceStrips,bowFrame),cruiserStations,halfStripBeam) else zeros(14,6);
  end when;
  when sample(0,.025) then
    animalWrench=WildlifeContact(animals,boatPose,{der(east),der(north),yawRate},3250,7.6,1.22,.0,.58,animalTraffic);
  end when;
  focus={east,north,z}; committeeLoad=zeros(6);
  der(shaftRPM)=(if throttleLever>=0 then 1850*throttleLever-shaftRPM else 1100*throttleLever-shaftRPM)/.85;
  thrust=.0025*shaftRPM*abs(shaftRPM);
  der(surge)=(thrust+animalWrench[1]*cos(yaw)+animalWrench[2]*sin(yaw)-118*surge*abs(surge)-180*surge)/3250;
  der(yawRate)=(.085*helmLever*surge+.025*helmLever*shaftRPM/1850-yawRate)/.9+animalWrench[6]/14000;
  der(yaw)=yawRate;
  der(sway)=(-sin(yaw)*animalWrench[1]+cos(yaw)*animalWrench[2])/3250-(1.5+.45*abs(sway))*sway;
  der(east)=surge*cos(yaw)-sway*sin(yaw)+boatWater.profile[1,2];
  der(north)=surge*sin(yaw)+sway*cos(yaw)+boatWater.profile[1,3];
  der(vertical)=(sum(stripForce)-16500*vertical)/(3250+addedHeaveMass);der(z)=vertical;
  // Restoring moments about the centre of flotation. Roll stiffness accounts
  // for the raised centre of gravity; turning and thrust also trim the hull.
  der(rollRate)=(.68*.55*sum(stripForce[1,j]-stripForce[2,j] for j in 1:6)
    -7400*rollRate-1950*surge*yawRate)/rollInertia;der(roll)=rollRate;
  der(pitchRate)=(-sum((stripX[j]-floatX)*(stripForce[1,j]+stripForce[2,j]) for j in 1:6)
    -47000*pitchRate-.65*thrust)/pitchInertia;der(pitch)=pitchRate;
  boatPose={east,north,z,roll,pitch,yaw};
  engine={shaftRPM,surge,thrust,.52*helmLever};
end OceanMotorboat;
