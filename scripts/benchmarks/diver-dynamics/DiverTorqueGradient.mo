model DiverTorqueGradient "Derivative of generalized acceleration at fixed pose and velocity"
  parameter Real inertia[20,20] = identity(20);
  input Real effort[20] = zeros(20) "Applied generalized effort minus the fixed bias";
  output Real acceleration[20];
equation
  acceleration = CholeskyCopy.solveSPD(inertia,effort);
end DiverTorqueGradient;
