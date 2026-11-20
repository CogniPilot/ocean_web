within;
model SailImmersionCheck "A wave passes a stationary rectangular sail strip"
  parameter Real corners[4,3]=[0,0,0; 1,0,0; 1,0,1; 0,0,1];
  input Real surface(start=0.5), orbitalSpeed(start=2);
  output Real wet, force[3];
equation
  (wet,force)=Sailboat.waterStrip(corners,{0,1,0},{0,orbitalSpeed,0},zeros(3),surface,0,0,1);
end SailImmersionCheck;
