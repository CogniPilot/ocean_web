model OceanSubmarine "Submarine with onboard navigation and a shared sea"
  extends OceanMission;
  parameter Real surveyAtStartup=1;
  input Real imagingSonar(start=0) "Request a sonar ping independently of optical acquisition and mapping";
  input Real idleCamera(start=0),subManual(start=1),subPilot[4],subMode(start=0),subAttitudePilot[2];
  input Real subBallastTrim(start=-1);
  input Real peerCruisers[9,14](each start=0),peerLiftStates[9,2](each start=0);
  input Real animalTraffic[10,9](each start=0),animalJoints[10,4](each start=0);
  input Real mappedCurrent[4](each start=0) "Coverage and local mean ENU current at Piccard";
  input Real scanConstraints[8,10](each start=0) "Local scan contacts for Piccard";
  input Real subFlood(start=0) "Trip Piccard power and open the flooded housing";
  output Real subFloodState[4]=sub.floodState;
  input Real subHoist[8](each start=0),subHoistUp[3](start={0,0,1});
  input Real subHoistQuaternion[4](each start=0),subHoistAngularVelocity[3](each start=0);
  Wreck.Plant sub(mappedCurrent=mappedCurrent,animalTraffic=animalTraffic,animalJoints=animalJoints,flood=subFlood,peerCruisers=peerCruisers,peerLiftStates=peerLiftStates,hoist=subHoist,hoistUp=subHoistUp,hoistQuaternion=subHoistQuaternion,
    hoistAngularVelocity=subHoistAngularVelocity,scanConstraints=scanConstraints,seaClockOffset=seaClockOffset,seaState=seaState,windSpeed=windSpeed,windDirection=windBearing,
    sensor=sensor,elevationRanges=elev,navigationUp=estimate[3],navigationUpValid=if estimate[9]>0 then 1 else 0,manual=subManual,pilot=subPilot,manualMode=subMode,attitudePilot=subAttitudePilot,ballastTrim=subBallastTrim,
    hullSurfaceOffset=receiverWater[1],propSurfaceOffset=receiverWater[2:7]);
  discrete Real previousGyro[3](each start=0,each fixed=true);
  final parameter Real beams[1017,3]=Wreck.Perception.directions();
  discrete output Real sensor[91](each start=0,each fixed=true),elev[100](each start=0,each fixed=true),
    image[864](each start=0,each fixed=true),estimate[21](each start=0,each fixed=true),
    keyframes[48,180](each start=0,each fixed=true),features[24,5](each start=0,each fixed=true),ping[65,32](each start=0,each fixed=true);
  Real receiverPosition[7,2],receiverWater[7];
  discrete Real sampledWake[7](each start=0,each fixed=true),priorWake[7](each start=0,each fixed=true);
equation
  focus=sub.position;
  committeeLoad=zeros(6);
  receiverPosition[1,:]=sub.position[1:2];
  receiverPosition[2:7,:]=sub.propPosition[:,1:2];
  for i in 1:7 loop
    receiverWater[i]=(1-waterFraction)*priorWake[i]+waterFraction*sampledWake[i]
      +swell[1]*sin(swell[2]+receiverPosition[i,:]*swell[3:4]);
  end for;
  when sample(0,.1) then
    for i in 1:7 loop
      sampledWake[i]=Regatta.elevationAt(waves.height,receiverPosition[i,1]-waves.driftE,
        receiverPosition[i,2]-waves.driftN,waves.period);
    end for;
    priorWake=if initial() then sampledWake else pre(sampledWake);
  end when;
  when sample(0,.2) then
    previousGyro=sub.gyroAngle;
    (sensor,elev,image,estimate,keyframes,features,ping)=Wreck.Perception.sampleFrame(time,
      cat(1,sub.position,sub.orientation,sub.velocity,{sub.yawRate,sub.pressure},sub.specificForce,(sub.gyroAngle-pre(previousGyro))/.2),
      beams,zeros(1017),0,pre(image),pre(estimate),pre(keyframes),idleCamera<surveyAtStartup-.5,
      idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5 or subManual<.5 or imagingSonar>.5,sub.carrierFix);
  end when;
end OceanSubmarine;
