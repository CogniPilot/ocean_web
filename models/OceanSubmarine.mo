model OceanSubmarine "Submarine with onboard navigation and a shared sea"
  extends OceanMission;
  parameter Real surveyAtStartup=1;
  input Real idleCamera(start=0),subManual(start=1),subPilot[4];
  Wreck.Plant sub(seaClockOffset=seaClockOffset,windSpeed=windSpeed,windDirection=windBearing,
    sensor=sensor,elevationRanges=elev,manual=subManual,pilot=subPilot,
    hullSurfaceOffset=receiverWater[1],propSurfaceOffset=receiverWater[2:8]);
  final parameter Real beams[1017,3]=Wreck.Perception.directions();
  discrete output Real sensor[91](each start=0,each fixed=true),elev[100](each start=0,each fixed=true),
    image[864](each start=0,each fixed=true),estimate[21](each start=0,each fixed=true),
    keyframes[48,180](each start=0,each fixed=true),features[24,5](each start=0,each fixed=true);
  Real receiverPosition[8,2],receiverWater[8];
  discrete Real sampledWake[8](each start=0,each fixed=true),priorWake[8](each start=0,each fixed=true);
equation
  focus=sub.position;
  committeeLoad=zeros(6);
  receiverPosition[1,:]=sub.position[1:2];
  receiverPosition[2:8,:]=sub.propPosition[:,1:2];
  for i in 1:8 loop
    receiverWater[i]=(1-waterFraction)*priorWake[i]+waterFraction*sampledWake[i]
      +swell[1]*sin(swell[2]+receiverPosition[i,:]*swell[3:4]);
  end for;
  when sample(0,.1) then
    for i in 1:8 loop
      sampledWake[i]=Regatta.elevationAt(waves.height,receiverPosition[i,1]-waves.driftE,
        receiverPosition[i,2]-waves.driftN,waves.period);
    end for;
    priorWake=if initial() then sampledWake else pre(sampledWake);
  end when;
  when sample(0,.2) then
    (sensor,elev,image,estimate,keyframes,features)=Wreck.Perception.sampleFrame(time,
      cat(1,sub.position,sub.orientation,sub.velocity,{sub.yawRate,sub.pressure},sub.specificForce,sub.rates),
      beams,zeros(1017),0,pre(image),pre(estimate),pre(keyframes),idleCamera<surveyAtStartup-.5,
      idleCamera<surveyAtStartup-.5,idleCamera<surveyAtStartup-.5 or subManual<.5);
  end when;
end OceanSubmarine;
