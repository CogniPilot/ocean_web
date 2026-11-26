package DiverHydrodynamics "Distributed water loads on the fitted diver"
  function linkWrench "ENU water wrench about the site center, local dissipation and immersed fraction"
    input Integer kind "Trunk, head, cylinder, upper arm, forearm, thigh, shank, boot, BCD gas (1..9)";
    input Real center[3] "Site center in ENU metres";
    input Real rotation[3,3] "Principal site axes in ENU, longitudinal/port/dorsal columns";
    input Real velocity[3] "Site-center velocity in ENU m/s";
    input Real omega[3] "Site angular velocity in ENU rad/s";
    input Real current[3] "Water velocity in ENU m/s";
    input Real waterLevel "Local free surface ENU z, m";
    input Real volume "Fully submerged exterior displacement of this site, m3";
    output Real result[15] "ENU total wrench, drag power, wet fraction, buoyancy (N), local wetted centroid (m), ENU drag couple about site center (N m)";
  protected
    constant Real rho=1025;
    constant Real g=9.80665;
    constant Real pi=3.141592653589793;
    // Longitudinal, lateral and dorsal semiaxes in metres, estimated from the fitted rig.
    // The boot excludes the blade; the elbow link's dry envelope excludes the active palm.
    constant Real axes[9,3]=[.37,.19,.135; .14,.10,.105; .285,.09,.09;
      .13,.055,.055; .135,.049,.045; .215,.085,.079; .235,.062,.057; .130,.052,.050; .275,.155,.125];
    // Dimensionless directional drag coefficients. Trunk includes the jacket exterior.
    constant Real cd[9,3]=[.68,.96,1.00; .50,.65,.65; .72,1.00,1.00;
      .42,1.05,1.05; .45,1.05,1.05; .38,1.00,1.00; .42,1.00,1.00; .52,.95,.95; 0,0,0];
    Real a[3],up[3],normal[3],height,cap,wet;
    Real meanFromBottom,meanSqFromBottom,normalSpread,tangentSpread,centroid[3],lift;
    Real localV[3],localW[3],projection[3],sampleArm[3],offset[3],pointFlow[3];
    Real sampleForce[3],force[3],moment[3],power;
  algorithm
    a := axes[kind,:];
    up := rotation[3,:];
    height := sqrt(sum((a[j]*up[j])^2 for j in 1:3));
    cap := max(0,min(2,1+(waterLevel-center[3])/height));
    wet := cap^2*(3-cap)/4;
    result := zeros(15);
    if wet>0 then
      // Map the wetted ellipsoid to a unit sphere cut by a plane. These are the
      // exact first two moments of depth measured from the bottom of the sphere.
      normal := a.*up/height;
      meanFromBottom := cap*(8-3*cap)/(4*(3-cap));
      meanSqFromBottom := cap^2*(15-6*cap)/(10*(3-cap));
      centroid := (meanFromBottom-1)*(a.*normal);
      lift := rho*g*volume*wet;
      force := lift*up;
      moment := cross(centroid,force);
      power := 0;
      if kind<>9 then
        localV := transpose(rotation)*(velocity-current);
        localW := transpose(rotation)*omega;
        projection := {.5*rho*pi*cd[kind,1]*a[2]*a[3],.5*rho*pi*cd[kind,2]*a[1]*a[3],
          .5*rho*pi*cd[kind,3]*a[1]*a[2]};
        // Six weighted points reproduce the centroid and principal second moments
        // of the wet volume. A rotating link thus feels drag couples even at rest
        // at its center. Forces use the water-relative velocity at each point.
        normalSpread := sqrt(3*max(0,meanSqFromBottom-meanFromBottom^2));
        tangentSpread := sqrt(.75*max(0,2*meanFromBottom-meanSqFromBottom));
        for axis in 1:3 loop
          for j in 1:3 loop
            offset[j] := a[j]*((normalSpread-tangentSpread)*normal[axis]*normal[j]+
              (if j==axis then tangentSpread else 0));
          end for;
          for side in 1:2 loop
            sampleArm := centroid+(if side==1 then -1 else 1)*offset;
            pointFlow := localV+cross(localW,sampleArm);
            for j in 1:3 loop
              sampleForce[j] := -(wet/6)*projection[j]*abs(pointFlow[j])*pointFlow[j];
            end for;
            force := force+sampleForce;
            moment := moment+cross(sampleArm,sampleForce);
            power := power+sum(sampleForce[j]*pointFlow[j] for j in 1:3);
          end for;
        end for;
      end if;
      result[1:3] := rotation*force;
      result[4:6] := rotation*moment;
      result[7] := power;
      result[8] := wet;
      result[9] := lift;
      result[10:12] := centroid;
      result[13:15] := rotation*(moment-cross(centroid,lift*up));
    end if;
  end linkWrench;
end DiverHydrodynamics;
