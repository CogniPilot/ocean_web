within Wreck;
function steepTiltMoment "Body-axis attitude moment using gravity as the tilt reference"
  input Real up[3] "Estimated world up, unit vector in body coordinates";
  input Real bank,pitch,gyro[3],yawMoment;
  output Real moment[3];
protected
  Real desiredUp[3],tilt[3],transverseRate[3];
algorithm
  desiredUp:={-sin(pitch),sin(bank)*cos(pitch),cos(bank)*cos(pitch)};
  tilt:=cross(desiredUp,up);
  transverseRate:=gyro-up*(up*gyro);
  moment:=10*tilt-4*transverseRate+up*yawMoment;
end steepTiltMoment;
