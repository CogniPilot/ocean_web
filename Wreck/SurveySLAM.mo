within Wreck;
model SurveySLAM "Measurement-only 5 Hz wreck-survey estimator for replay and hardware integration"
  parameter Real initialPosition[3]={0,0,0},pressureDatum=0 "Local ENU reference at zero gauge pressure";
  input Real dvlRange[4],dvlVelocity[4] "Forward, aft, port, starboard beams; zero range means invalid";
  input Real sonarRange[49] "Measured slant ranges across the forward fan from starboard to port; zero means no echo";
  input Real bodyRate[3],specificForce[3] "FLU rad/s and m/s2, upright rest reads +g on Z";
  input Real gaugePressure "Pa relative to the reference water surface";
  input Real grayscale[864] "Rectified 36 by 24 row-major intensity subset, 0..255";
  input Boolean imageValid=true,sonarValid=true;
  discrete output Real state[21](each start=0,each fixed=true),keyframes[48,180](each start=0,each fixed=true);
  discrete output Real telemetry[91],features[24,5];
protected
  discrete Real previousImage[864](each start=0,each fixed=true);
  Real packet[195];
equation
  packet=cat(1,dvlRange,if sonarValid then sonarRange else zeros(49),zeros(100),dvlVelocity,
    {gaugePressure},bodyRate,specificForce,zeros(31));
  when sample(0,.2) then
    (state,keyframes,telemetry,features)=Perception.estimate(time,packet,Perception.directions(),grayscale,
      pre(previousImage),pre(state),pre(keyframes),imageValid,sonarValid,initialPosition,pressureDatum,
      Perception.dvlMount,Perception.cameraMount,ImagingSonar.mount);
    previousImage=if imageValid then grayscale else zeros(864);
  end when;
end SurveySLAM;
