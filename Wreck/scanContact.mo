within Wreck;
function scanContact "Unilateral contact between Piccard's support points and stationary scan facets"
  input Real pos[3],T[3,3],velocity[3],omega[3];
  input Real constraints[8,10] "Rows: world witness, world unit normal, body-frame guard centre, guard radius [m]";
  input Real bodyMass[3],inertia[3] "Translational effective masses [kg] and principal moments [kg m2] about the body origin";
  output Real force[3],moment[3] "World-frame wrench about the body origin";
protected
  constant Real stiffness=5200 "N/m";
  constant Real dampingRatio=.85;
  constant Real transition=.001 "Damping engages over the first millimetre of penetration";
  Real n[3],arm[3],w[3],gap,f[3],v[3],vt[3],vn;
  Real bodyNormal[3],angularJacobian[3],contactMass,engagement,fn;
algorithm
  force:=zeros(3);moment:=zeros(3);
  if constraints[1,10]<=0 then return;end if;
  w:=transpose(T)*omega;
  for i in 1:8 loop
    if constraints[i,10]>0 then
      n:=constraints[i,4:6];arm:=transpose(T)*constraints[i,7:9]-constraints[i,10]*n;
      gap:=(pos+arm-constraints[i,1:3])*n;
      if gap<0 then
        bodyNormal:=T*n;
        angularJacobian:=T*cross(arm,n);
        contactMass:=1/(bodyNormal*(bodyNormal ./ bodyMass)+angularJacobian*(angularJacobian ./ inertia));
        v:=velocity+cross(w,arm);vn:=v*n;vt:=v-vn*n;
        engagement:=min(1,-gap/transition);
        fn:=max(0,-stiffness*gap-2*dampingRatio*sqrt(stiffness*contactMass)*engagement*vn);
        f:=fn*(n-.22*vt/sqrt(vt*vt+.12^2));
        force:=force+f;moment:=moment+cross(arm,f);
      end if;
    end if;
  end for;
end scanContact;
