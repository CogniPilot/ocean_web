package SwimmerCollision "MultiBodyLie shapes in the whale's articulated body frames"
  import MultiBodyLie.Collision;
  import MultiBodyLie.Frames.axisRotationT;

  function whale "Shape kind, origin, shape-to-body rotation by rows, and size"
    input Real bend,feather,port,starboard;
    output Real shape[7,16];
  protected
    Real tail[3,3],fluke[3,3],fin[3,3],center[3],side,angle;
    constant Real hinge[3]={-2.35,0,0};
  algorithm
    shape[1,:]:={3,.32,0,-.02,1,0,0,0,1,0,0,0,1,1.04,1.46,0};
    shape[2,:]:={3,2.63,0,-.07,1,0,0,0,1,0,0,0,1,.66,1.10,0};
    shape[3,:]:={3,-1.47,0,-.04,1,0,0,0,1,0,0,0,1,.73,.89,0};
    tail:=axisRotationT(2,bend);
    center:=hinge+tail*{-1.43,0,0};
    shape[4,:]:=cat(1,{3},center,tail[1,:],tail[2,:],tail[3,:],{.35,1.31,0});
    fluke:=tail*axisRotationT(2,feather);
    center:=hinge+tail*{-3.20,0,0}+fluke*{-.29,0,-.09};
    shape[5,:]:=cat(1,{4},center,fluke[1,:],fluke[2,:],fluke[3,:],{.56,2.02,.13});
    for i in 1:2 loop
      side:=3-2*i;
      angle:=if i==1 then port else starboard;
      fin:=axisRotationT(2,angle)*transpose(axisRotationT(1,-side*.47));
      center:={.30,side*.85,-.60}+fin*{-.26,side*1.28,0};
      shape[5+i,:]:=cat(1,{4},center,fin[1,:],fin[2,:],fin[3,:],{.49,1.31,.135});
    end for;
  end whale;

  function skinFrames "Inverse skin transforms mapping a body-local point into each neutral joint frame"
    input Boolean whale;
    input Real angles[4] "Whale bend, feather, pectorals or shark trunk, peduncle, caudal";
    output Real frames[6,3,4];
  protected
    Real R[3,3],offset[3],pivot[3],delta;
    Integer parent;
  algorithm
    frames:=zeros(6,3,4);frames[1,:,1:3]:=identity(3);
    for joint in 1:(if whale then 5 else 3) loop
      parent:=if joint<4 then joint else 1;
      delta:=if whale then (if joint==1 then .60*angles[1] elseif joint==2 then .40*angles[1]
        elseif joint==3 then angles[2] else angles[joint-1])
        else (if joint==1 then angles[1] else angles[joint]-angles[joint-1]);
      pivot:=Wreck.SwimmerHulls.pivots[joint+(if whale then 0 else 5),:];
      R:=if whale then axisRotationT(2,-delta) else axisRotationT(3,delta);
      offset:=pivot-R*pivot;
      frames[joint+1,:,1:3]:=R*frames[parent,:,1:3];
      frames[joint+1,:,4]:=R*frames[parent,:,4]+offset;
    end for;
  end skinFrames;

  function skinContact "Contact of a hull-sampling sphere with the baked compound convex swimmer skin"
    input Boolean whale;
    input Real p[3],radius,frames[6,3,4];
    output Real contact[4] "Outward normal in body axes and signed clearance";
  protected
    Real q[3],n[3],plane[4],gap,d;
    Integer joint,part;
  algorithm
    contact:={0,0,0,1e6};
    for k in 1:max(Wreck.SwimmerHulls.count) loop
      if k>Wreck.SwimmerHulls.count[if whale then 1 else 2] then break;end if;
      part:=k+(if whale then 0 else Wreck.SwimmerHulls.count[1]);
      joint:=1+Wreck.SwimmerHulls.joint[part];
      q:=frames[joint,:,1:3]*p+frames[joint,:,4];
      if min(q-Wreck.SwimmerHulls.bounds[part,1:3])>=-radius and
          min(Wreck.SwimmerHulls.bounds[part,4:6]-q)>=-radius then
        gap:=-1e6;n:=zeros(3);
        // Most separated face of the sphere-expanded convex hull. Adjacent
        // support planes conservatively enclose rounded edge/corner contacts.
        for i in 1:26 loop
          plane:=Wreck.SwimmerHulls.planes[(part-1)*26+i,:];
          d:=q*plane[1:3]-plane[4]-radius;
          if d>gap then gap:=d;n:=plane[1:3];end if;
        end for;
        if gap<contact[4] then
          contact[1:3]:=transpose(frames[joint,:,1:3])*n;contact[4]:=gap;
        end if;
      end if;
    end for;
  end skinContact;

  function worldFrame "Whale world-to-body rotation, with positive nose-up pitch"
    input Real yaw,pitch,roll;
    output Real T[3,3];
  algorithm
    T:=axisRotationT(1,roll)*axisRotationT(2,-pitch)*axisRotationT(3,yaw);
  end worldFrame;
end SwimmerCollision;
