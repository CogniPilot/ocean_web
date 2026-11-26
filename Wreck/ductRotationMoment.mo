within Wreck;
function ductRotationMoment "Rotational drag on the six outboard thruster ducts, body FLU, N.m"
  input Real velocity[3] "Vehicle velocity relative to the local water in body coordinates, m/s";
  input Real omega[3] "Body angular velocity, rad/s";
  input Real mount[6,3] "Duct centres relative to the vehicle datum, m";
  input Real density,dragArea "Water density and effective drag area of one duct";
  output Real moment[3];
protected
  Real baseline[3],localVelocity[3],increment[3];
algorithm
  baseline:=sqrt(velocity*velocity)*velocity;
  moment:=zeros(3);
  for i in 1:6 loop
    localVelocity:=velocity+cross(omega,mount[i,:]);
    // The straight-line hull drag is accounted for separately. Only the
    // change in drag due to rotation loads the rotational degree of freedom.
    increment:=sqrt(localVelocity*localVelocity)*localVelocity-baseline;
    moment:=moment-.5*density*dragArea*cross(mount[i,:],increment);
  end for;
end ductRotationMoment;
