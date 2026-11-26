within Wreck;
function piccardDryInertia "Principal moments at the vehicle datum, x forward, y port, z up"
  input Real mass,hullLength,hullRadius,frameLength,frameBeam,frameHeight;
  input Real mounts[6,3];
  output Real J[3];
protected
  // Dry mass budget: loaded electronics barrel, two side plates, low battery
  // and tray assembly, and six nominal T200-class units at their actual mounts.
  Real barrel,plates,battery,pod,dimensions[3],center[3];
algorithm
  pod:=mass*.344/18;
  battery:=mass*2.4/18;
  plates:=mass*3.6/18;
  barrel:=mass-battery-plates-6*pod;
  J:=barrel*{hullRadius^2/2+.05^2,
    (3*hullRadius^2+hullLength^2)/12+.05^2,(3*hullRadius^2+hullLength^2)/12};
  J:=J+plates*{frameHeight^2/12+(frameBeam/2)^2+.012^2,
    (frameLength^2+frameHeight^2)/12+.012^2,frameLength^2/12+(frameBeam/2)^2};
  dimensions:={.35,.16,.05};center:={-.01,0,-.074};
  J:=J+battery*{(dimensions[2]^2+dimensions[3]^2)/12+center[3]^2,
    (dimensions[1]^2+dimensions[3]^2)/12+center[1]^2+center[3]^2,
    (dimensions[1]^2+dimensions[2]^2)/12+center[1]^2};
  for i in 1:6 loop
    J:=J+pod*{mounts[i,2]^2+mounts[i,3]^2+.0012,
      mounts[i,1]^2+mounts[i,3]^2+.0012,mounts[i,1]^2+mounts[i,2]^2+.0012};
  end for;
end piccardDryInertia;
