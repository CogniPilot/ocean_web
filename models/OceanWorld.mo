model OceanWorld "Single-clock marine world, with onboard perception and guidance"
  extends OceanRace;
  parameter Real surveyAtStartup=1 "Enable SLAM for clients that leave idleCamera at its default";
  input Real imagingSonar(start=0) "Request a sonar ping independently of optical acquisition and mapping";
  input Real idleCamera(start=0) "Camera and SLAM mode: -1 active, 0 use startup setting, 1 idle";
  input Real subManual(start=1),subPilot[4],subMode(start=0),subAttitudePilot[2],flightManual(start=1),flightPilot[4],motorCut;
  input Real flightMode(start=0),racePilot(start=0),station[2](each start=0);
  input Real peerCruisers[9,14](each start=0),peerLiftStates[9,2](each start=0);
  input Real mappedCurrent[4](each start=0) "Coverage and local mean ENU current at Piccard";
  input Real scanConstraints[8,10](each start=0) "Local scan contacts for Piccard";
  input Real subFlood(start=0) "Trip Piccard power and open the flooded housing";
  output Real subFloodState[4]=sub.floodState;
  input Real subHoist[8](each start=0),subHoistUp[3](start={0,0,1});
  input Real subHoistQuaternion[4](each start=0),subHoistAngularVelocity[3](each start=0);
  Wreck.Plant sub(mappedCurrent=mappedCurrent,animalTraffic=animalTraffic,animalJoints=animalJoints,flood=subFlood,peerCruisers=peerCruisers,peerLiftStates=peerLiftStates,hoist=subHoist,hoistUp=subHoistUp,hoistQuaternion=subHoistQuaternion,
    hoistAngularVelocity=subHoistAngularVelocity,scanConstraints=scanConstraints,seaClockOffset=seaClockOffset,seaState=seaState,windSpeed=windSpeed,windDirection=windBearing,sensor=sensor,elevationRanges=elev,navigationUp=estimate[3],navigationUpValid=if estimate[9]>0 then 1 else 0,
    manual=subManual,pilot=subPilot,manualMode=subMode,attitudePilot=subAttitudePilot,hullSurfaceOffset=receiverWater[1],propSurfaceOffset=receiverWater[2:7]);
  Wreck.Ocean droneWater(seaClockOffset=seaClockOffset,seaState=seaState,pos=drone.position,windSpeed=windSpeed,windDirection=windBearing);
  input Real rotorWakeTraffic[4,12]=zeros(4,12),droneTraffic[4,14]=zeros(4,14);
  input Real vesselDecks[4,14]=zeros(4,14) "Nearby surface vessel deck pose and twist";
  Rdd2Survey drone(vesselDecks=vesselDecks,rotorWakeTraffic=rotorWakeTraffic,droneTraffic=droneTraffic,flightMode=flightMode,gpsDropout=0,sailDeckEnabled=1,sailDeckState=boat.landingDeck,isCatamaran=if hobie then 1 else 0,deckEnabled=1,deckState=race.deckState,windENU=wind.droneWind,currentENU=droneWater.velocity,waterLevel=droneWater.surface+receiverWater[8],
    pilot=flightManual,forward=flightPilot[1],left=flightPilot[2],climb=flightPilot[3],turn=flightPilot[4],
    stationEast=if racePilot>.5 then station[1] else estimate[1],stationNorth=if racePilot>.5 then station[2] else estimate[2],motorCut=motorCut);
  discrete Real previousGyro[3](each start=0,each fixed=true);
  final parameter Real beams[1017,3]=Wreck.Perception.directions();
  discrete output Real sensor[91](each start=0,each fixed=true),elev[100](each start=0,each fixed=true),
    image[864](each start=0,each fixed=true),estimate[21](each start=0,each fixed=true),
    keyframes[48,180](each start=0,each fixed=true),features[24,5](each start=0,each fixed=true),ping[65,32](each start=0,each fixed=true);
  Real receiverPosition[8,2],receiverWater[8];
  discrete Real sampledWake[8](each start=0,each fixed=true),priorWake[8](each start=0,each fixed=true);
equation
  sailLandingWrench=drone.sailWrench[7:12];
  committeeLandingWrench=drone.deckWrench[7:12];
  windProbe=drone.position[1:2];
  receiverPosition[1,:]=sub.position[1:2];
  receiverPosition[2:7,:]=sub.propPosition[:,1:2];
  receiverPosition[8,:]=drone.position[1:2];
  for i in 1:8 loop
    receiverWater[i]=(1-boat.waterFraction)*priorWake[i]+boat.waterFraction*sampledWake[i]
      +boat.swellAmplitude*sin(boat.swellPhase+boat.swellK*((receiverPosition[i,1]-boat.east)*cos(boat.swellBearing)
      +(receiverPosition[i,2]-boat.north)*sin(boat.swellBearing)));
  end for;
  when sample(0,.1) then
    for i in 1:8 loop
      sampledWake[i]=Regatta.localWaveElevation(waves.height,waves.wakeHeight,receiverPosition[i,:],
        {waves.driftE,waves.driftN},{boat.east,boat.north},waves.period)
        +Regatta.nearHullElevation(bowSources,bowFrame,bowSpeed,receiverPosition[i,:]);
    end for;
    priorWake=if initial() then sampledWake else pre(sampledWake);
  end when;
  when sample(0,.2) then
    previousGyro=sub.gyroAngle;
    (sensor,elev,image,estimate,keyframes,features,ping)=Wreck.Perception.sampleFrame(time,
      cat(1,sub.position,sub.orientation,sub.velocity,{sub.yawRate,sub.pressure},sub.specificForce,(sub.gyroAngle-pre(previousGyro))/.2),
      beams,zeros(1017),0,pre(image),pre(estimate),pre(keyframes), idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5 or subManual<.5 or imagingSonar>.5,sub.carrierFix);
  end when;
end OceanWorld;
