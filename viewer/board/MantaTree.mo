package MantaTree "Floating trunk and independent lateral pectoral hinges"
  function solve
    input Real properties[3,7] "Mass, local COM and principal moments about COM";
    input Real rotation[3,3],velocity[3],omega[3],angle[2],rate[2];
    input Real moment[3],force[3],hingeLoad[2],wet,mass;
    output Real acceleration[8] "Body angular, ENU linear and two hinge accelerations";
  protected
    Real inertia[3,6,6],mount[2,3,3],matrix[8,8],bias[8],a[8],v[3];
  algorithm
    for b in 1:3 loop
      inertia[b,:,:]:=MultiBodyLie.Math.spatialInertia(properties[b,1],properties[b,2:4],diagonal(properties[b,5:7]));
    end for;
    // Existing transverse and normal entrained-water estimates, expressed
    // in body axes. Airborne pitches and rolls use physical segment inertia.
    for i in 1:3 loop
      inertia[1,i,i]:=inertia[1,i,i]+wet*(if i==1 then 490 elseif i==2 then 295 else 155);
      inertia[1,i+3,i+3]:=inertia[1,i+3,i+3]+mass*wet*(if i==3 then .85 else .16);
    end for;
    mount[1,:,:]:=identity(3);mount[2,:,:]:=identity(3);
    v:=transpose(rotation)*velocity;
    (matrix,bias,a):=MultiBodyLie.Math.floatingTreeDynamics({0,1,1},[0,.48,0;0,-.48,0],mount,
      [1,0,0;-1,0,0],angle,cat(1,omega,v,rate),inertia,{.1,.1},zeros(3),cat(1,moment,force,hingeLoad));
    acceleration:=cat(1,a[1:3],rotation*(a[4:6]+cross(omega,v)),a[7:8]);
  end solve;
end MantaTree;
