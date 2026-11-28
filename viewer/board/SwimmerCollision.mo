package SwimmerCollision "MultiBodyLie shapes in the whale's articulated body frames"
  import Collision = .Collision;
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

  function skinFrames = Wreck.skinFrames;

  function skinContact = Wreck.skinContact;

  function worldFrame "Whale world-to-body rotation, with positive nose-up pitch"
    input Real yaw,pitch,roll;
    output Real T[3,3];
  algorithm
    T:=axisRotationT(1,roll)*axisRotationT(2,-pitch)*axisRotationT(3,yaw);
  end worldFrame;
end SwimmerCollision;
