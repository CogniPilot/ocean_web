model DryDiverDynamics "Generate the 15-frame specialization of the production CRBA/RNEA kernel"
  Real phase(start=0);
  Real M[20,20], bias[20], acceleration[20];
equation
  (M,bias,acceleration) = MultiBodyLie.Math.floatingTreeDynamics(
    {0,1,2,3,4,5,1,7,1,9,10,11,12,1,14}, zeros(14,3),
    {identity(3) for i in 1:14}, {{0,1,0} for i in 1:14},
    fill(phase,14), zeros(20), {identity(6) for i in 1:15},
    ones(14), zeros(3), ones(20));
  der(phase) = acceleration[7];
end DryDiverDynamics;
