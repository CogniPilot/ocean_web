within Wreck;
function manualAxisTorque "Manual angular feedback for one axis with a first-order thruster"
  input Boolean levelControl "Track an angle with roll or pitch in Auto level";
  input Real angleError "Commanded minus estimated angle, rad";
  input Real referenceRate "Commanded body rate in Acro or manual yaw, rad/s";
  input Real rate "Body gyro rate, rad/s";
  input Real appliedMoment "Moment from actual thruster forces, N.m";
  input Real trim "Hydrostatic restoring moment, N.m";
  input Real trimRate "Change in restoring moment due to rotation, N.m/s";
  input Real inertia "Body rotational inertia about this axis, kg.m2";
  input Real drag "Viscous torque coefficient, N.m.s/rad";
  input Real lag "Thruster time constant, s";
  input Real pole "Target closed-loop pole magnitude, 1/s";
  output Real moment "Requested total thruster moment, N.m";
protected
  Real actuatorGain, rateGain, reference;
algorithm
  // Match (s + pole)^2 for rate tracking or (s + pole)^3 for attitude tracking.
  // The actuator state and angular drag both contribute to the rate coefficient.
  actuatorGain:=(if levelControl then 3 else 2)*lag*pole-lag*drag/inertia-1;
  rateGain:=(if levelControl then 3 else 1)*inertia*lag*pole^2-drag*(1+actuatorGain);
  reference:=inertia*lag*pole^2*(if levelControl then pole*angleError else referenceRate);
  moment:=reference-rateGain*rate-actuatorGain*(appliedMoment+trim)-trim-lag*trimRate;
end manualAxisTorque;
