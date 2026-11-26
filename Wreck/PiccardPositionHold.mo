within Wreck;
block PiccardPositionHold "Piccard submerged positioning from measured sensors to motor thrust and piston targets"
  extends SurveySLAM;
  input Real enable(start=0) "Above 0.5 engages position control";
  input Real secured(start=0) "Above 0.5 means the carrier owns the vehicle";
  input Real pilot[4](each start=0) "Surge, port, yaw rate and upward speeds (m/s, m/s, rad/s, m/s)";
  input Real pitchReference(start=0) "Commanded FLU pitch angle (radians, positive nose down)";
  input Real measuredTankVolume[2](each start=piccardInitialTankVolume) "Fore and aft piston feedback (m3)";
  input Real estimatedMotorThrust[6](each start=0) "Achieved thrust estimate from each motor (N), axial pair then four verticals";
  parameter Real dryMass=piccardDryMass, displaced=piccardDisplacement, addedMass[3]={3,9,11};

  output Real motorCommand[6] "Signed thrust targets (N), in estimatedMotorThrust order";
  output Real tankTarget[2] "Fore and aft piston volume targets (m3)";
  output Real currentENU[2] "Estimated horizontal water velocity (m/s)";
  output Real currentSigma[2] "East and north one-standard-deviation uncertainties (m/s)";
protected
  discrete Real filter[19](start={0,0,0,.36,0,0,0,.36,0,0,0,.36,0,0,0,0,0,0,0},each fixed=true);
  Real groundBody[3],upBody[3],thrustBody[3],restoring[3];
  Real mass,depth,pressureDepthFiltered(start=pressureDatum-initialPosition[3],fixed=true);
  Real groundLevel[3];
  PiccardStationController control(dryMass=dryMass,displaced=displaced,
    density=rho,addedMass=addedMass,linearDrag=piccardLinearDrag,surgeDrag=piccardDrag[1],swayDrag=piccardDrag[2],
    active=if enable>.5 and secured<.5 and state[9]>0 then 1 else 0,pose={state[1],state[2],depth},
    attitude={state[7],state[8],state[4]},gyro=bodyRate,
    groundSpeed=groundLevel,bottomLock=telemetry[63],currentENU=currentENU,
    pilot=pilot,pitchReference=pitchReference,netWeight=(mass-rho*displaced)*g,
    restoringMoment=restoring);
equation
  depth=pressureDatum-state[3];
  der(pressureDepthFiltered)=(depth-pressureDepthFiltered)/.6;
  groundBody={telemetry[64],telemetry[65],-sum(dvlVelocity)/(4*cos(pi/8))};
  upBody={-sin(state[8]),cos(state[8])*sin(state[7]),cos(state[8])*cos(state[7])};
  groundLevel={
    cos(state[8])*groundBody[1]+sin(state[8])*(sin(state[7])*groundBody[2]+cos(state[7])*groundBody[3]),
    cos(state[7])*groundBody[2]-sin(state[7])*groundBody[3],
    if telemetry[63]>.5 then upBody*groundBody else max(-1,min(1,(pressureDepthFiltered-depth)/.6))};
  thrustBody={sum(estimatedMotorThrust[1:2]),0,sum(estimatedMotorThrust[3:6])};
  mass=dryMass+rho*sum(measuredTankVolume);
  restoring=cross({0,0,.0275},rho*g*displaced*upBody)
    +cross({.17,0,-.04},-rho*g*measuredTankVolume[1]*upBody)
    +cross({-.17,0,-.04},-rho*g*measuredTankVolume[2]*upBody);
  when sample(0,.2) then
    filter=currentStep(pre(filter),telemetry[63]>.5 and gaugePressure>rho*g*.35,secured>.5,
      {state[7],state[8],state[4]},groundBody,bodyRate,specificForce,thrustBody,
      mass,displaced,addedMass,piccardDrag,piccardLinearDrag);
  end when;
  currentENU=filter[1:2];
  currentSigma={sqrt(max(0,filter[4])),sqrt(max(0,filter[8]))};
  motorCommand=if enable>.5 and secured<.5 and state[9]>0 then control.motors else zeros(6);
  tankTarget=if enable>.5 and secured<.5 and state[9]>0 then control.tankTargets else measuredTankVolume;
end PiccardPositionHold;
