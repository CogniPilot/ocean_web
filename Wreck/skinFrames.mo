within Wreck;
function skinFrames "Inverse skin transforms mapping a body-local point into each neutral joint frame"
    import MultiBodyLie.Frames.axisRotationT;
    input Boolean whale;
    input Real angles[4] "Whale bend, feather, pectorals or shark trunk, peduncle, caudal";
    input Real starboard=angles[4] "Starboard incidence when the paired shark fins move independently";
    input Real forebody=0 "Shark anterior yaw relative to its torso";
    output Real frames[7,3,4];
  protected
    Real R[3,3],offset[3],pivot[3],delta;
    Integer parent;
  algorithm
    frames:=zeros(7,3,4);frames[1,:,1:3]:=identity(3);
    for joint in 1:5 loop
      parent:=if joint<4 then joint else 1;
      delta:=if whale then (if joint==1 then .60*angles[1] elseif joint==2 then .40*angles[1]
        elseif joint==3 then angles[2] else angles[joint-1])
        else (if joint==1 then angles[1] elseif joint<=3 then angles[joint]-angles[joint-1] elseif joint==4 then angles[4] else starboard);
      pivot:=Wreck.SwimmerHulls.pivots[joint+(if whale then 0 else 5),:];
      R:=if whale or joint>3 then axisRotationT(2,-delta) else axisRotationT(3,delta);
      offset:=pivot-R*pivot;
      frames[joint+1,:,1:3]:=R*frames[parent,:,1:3];
      frames[joint+1,:,4]:=R*frames[parent,:,4]+offset;
    end for;
    if not whale then
      pivot:=Wreck.SwimmerHulls.pivots[11,:];
      R:=axisRotationT(3,forebody);
      frames[7,:,1:3]:=R;
      frames[7,:,4]:=pivot-R*pivot;
    end if;
  end skinFrames;
