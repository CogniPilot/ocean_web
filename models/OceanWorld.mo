model OceanWorld "Single-clock marine world, with onboard perception and guidance"
  extends OceanRace;
  parameter Real surveyAtStartup=1 "Enable SLAM for clients that leave idleCamera at its default";
  input Real idleCamera(start=0) "Camera and SLAM mode: -1 active, 0 use startup setting, 1 idle";
  input Real subManual(start=1),subPilot[4],subMode(start=0),subAttitudePilot[2],flightManual(start=1),flightPilot[4],motorCut;
  input Real flightMode(start=0),racePilot(start=0),station[2](each start=0);
  Wreck.Plant sub(seaClockOffset=seaClockOffset,seaState=seaState,windSpeed=windSpeed,windDirection=windBearing,sensor=sensor,elevationRanges=elev,
    manual=subManual,pilot=subPilot,manualMode=subMode,attitudePilot=subAttitudePilot,hullSurfaceOffset=receiverWater[1],propSurfaceOffset=receiverWater[2:7]);
  Wreck.Ocean droneWater(seaClockOffset=seaClockOffset,seaState=seaState,pos=drone.position,windSpeed=windSpeed,windDirection=windBearing);
  input Real rotorWakeTraffic[4,12]=zeros(4,12),droneTraffic[4,14]=zeros(4,14);
  Rdd2Survey drone(rotorWakeTraffic=rotorWakeTraffic,droneTraffic=droneTraffic,flightMode=flightMode,gpsDropout=0,sailDeckEnabled=1,sailDeckState=boat.landingDeck,isCatamaran=if hobie then 1 else 0,deckEnabled=1,deckState=race.deckState,windENU=wind.droneWind,currentENU=droneWater.velocity,waterLevel=droneWater.surface+receiverWater[8],
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
      beams,zeros(1017),0,pre(image),pre(estimate),pre(keyframes), idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5 or subManual<.5);
  end when;
end OceanWorld;
