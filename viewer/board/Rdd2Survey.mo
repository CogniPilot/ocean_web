model Rdd2Survey "CogniPilot RDD2 hovering over the wreck survey area"
  input Real windENU[3] "Wind velocity at the aircraft [m/s]";
  parameter Real bedHeight=-13.71, displacedVolume=.0012 "Flooded vehicle displacement [m3]";
  parameter Real waterDragArea=.075,bodyHeight=.16;
  input Real motorCut,waterLevel,currentENU[3];
  output Real immersed;
  Real waterSlip[3],waterLoad[3];
  Vehicles.Rdd2.Plant aircraft(initialGroundClearance_m=4.9-bedHeight,groundAltitude=bedHeight,
    windWorld=windENU,exposedFraction=1-immersed,fluidForceWorld=waterLoad);

  output Real dragBody[3]=aircraft.aerodynamicDrag;
  parameter Real origin[2]={-5,0} "Survey launch coordinates ENU";
  input Real pilot,forward,left,climb,turn,stationEast,stationNorth;
  output Real position[3],quaternion[4],rotorSpeed[4];
  output Real rotorAngle[4](each start=0,each fixed=true);
  Real target[3](start={-5,0,5},each fixed=true),yawTarget(start=0,fixed=true);
  Real attitude[3](each start=0,each fixed=true);
  discrete Real gps[3](start={-5,0,5},each fixed=true),gpsVelocity[3](each start=0,each fixed=true);
  Real desired[3],acceleration[3],rollTarget,pitchTarget,collective,torque[3],motorThrust[4];

equation
  position=aircraft.truth.positionWorldEnu_m+{origin[1],origin[2],0};
  quaternion=aircraft.truth.quaternionWorldBody;
  immersed=min(1,max(0,.5+(waterLevel-position[3])/bodyHeight));
  waterSlip=currentENU-aircraft.truth.velocityWorldEnu_m_s;
  waterLoad=immersed*1025*({0,0,9.80665*displacedVolume}+.5*waterDragArea*sqrt(waterSlip*waterSlip+1e-12)*waterSlip);
  rotorSpeed=aircraft.motorOmega_rad_s;
  der(rotorAngle)={1,-1,1,-1}.*rotorSpeed;
  when sample(0,.1) then
    gps=position;
    gpsVelocity=aircraft.truth.velocityWorldEnu_m_s;
  end when;
  // Ideal 10 Hz GNSS plus body-rate gyro integration, initialized on a level pad.
  der(attitude[1])=aircraft.imu.angularVelocityBodyFlu_rad_s[1]+tan(attitude[2])*(sin(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[2]+cos(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[3]);
  der(attitude[2])=cos(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[2]-sin(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[3];
  der(attitude[3])=(sin(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[2]+cos(attitude[1])*aircraft.imu.angularVelocityBodyFlu_rad_s[3])/cos(attitude[2]);
  der(yawTarget)=if pilot>.5 then turn else 0;
  desired=if pilot>.5 then {2*(forward*cos(yawTarget)-left*sin(yawTarget)),2*(forward*sin(yawTarget)+left*cos(yawTarget)),climb}
    else {max(-2,min(2,stationEast-target[1])),max(-2,min(2,stationNorth-target[2])),max(-1,min(1,5-target[3]))};
  der(target[1:2])=desired[1:2];
  der(target[3])=if target[3]<1 and desired[3]<0 then 0 else desired[3];
  acceleration=1.4*(target-gps)+2.4*(desired-gpsVelocity);
  pitchTarget=max(-.32,min(.32,(cos(attitude[3])*acceleration[1]+sin(attitude[3])*acceleration[2])/9.80665));
  rollTarget=max(-.32,min(.32,(sin(attitude[3])*acceleration[1]-cos(attitude[3])*acceleration[2])/9.80665));
  collective=aircraft.vehicleMass_kg*(9.80665+acceleration[3])/max(.5,cos(attitude[1])*cos(attitude[2]));
  torque={.86*(rollTarget-attitude[1]),.86*(pitchTarget-attitude[2]),.42*atan2(sin(yawTarget-attitude[3]),cos(yawTarget-attitude[3]))}-
    {.23*aircraft.imu.angularVelocityBodyFlu_rad_s[1],.23*aircraft.imu.angularVelocityBodyFlu_rad_s[2],.18*aircraft.imu.angularVelocityBodyFlu_rad_s[3]};
  for k in 1:4 loop
    // The RDD2 effectiveness matrix has orthogonal rows. Use its actual motor order.
    motorThrust[k]=collective/4+sum(aircraft.rotorEffectiveness[j+1,k]*torque[j]/
      (aircraft.rotorEffectiveness[j+1,:]*aircraft.rotorEffectiveness[j+1,:]) for j in 1:3);
    aircraft.commands.motor[k]=if motorCut>.5 or immersed>.5 then 0 else sqrt(max(0,min(aircraft.omegaMax^2,motorThrust[k]/aircraft.thrustCoefficient_N_s2)))/aircraft.omegaMax;
  end for;
end Rdd2Survey;
