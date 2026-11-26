within Wreck;
function sharkSubLoad "Force and moment in ENU on Piccard from a rigged shark"
  import MultiBodyLie.Frames.axisRotationT;
  input Real traffic[10,9],angles[10,4],position[3],worldToSub[3,3],velocity[3],omegaBody[3];
  output Real wrench[6];
protected
  Real shapeFrames[6,3,4],T[3,3],arm[3],p[3],hit[4],n[3],relative[3],load,best,force[3];
  // Sample Piccard's dome, barrel and lower skid with their local cover radii (metres).
  constant Real probes[7,4]=[.225,0,.025,.139;0,0,.025,.143;-.21,0,.025,.139;
    .18,.135,-.095,.072;.18,-.135,-.095,.072;-.19,.135,-.095,.072;-.19,-.135,-.095,.072];
algorithm
  wrench:=zeros(6);
  for k in 1:10 loop
    if traffic[k,1]>1.5 and traffic[k,1]<2.5 and (position-traffic[k,2:4])*(position-traffic[k,2:4])<10 then
      shapeFrames:=skinFrames(false,angles[k,:]);
      T:=axisRotationT(1,traffic[k,9])*axisRotationT(2,-traffic[k,6])*axisRotationT(3,traffic[k,5]);
      best:=0;
      for j in 1:7 loop
        arm:=transpose(worldToSub)*probes[j,1:3];
        p:=T*(position-traffic[k,2:4]+arm);
        hit:=skinContact(false,p,probes[j,4],shapeFrames);
        if hit[4]<0 then
          n:=transpose(T)*hit[1:3];
          relative:=velocity+transpose(worldToSub)*cross(omegaBody,probes[j,1:3])-{traffic[k,7],traffic[k,8],0};
          load:=max(0,min(180,(-1800*hit[4]-85*(relative*n))));
          if load>best then
            best:=load;force:=load*n;
            wrench[1:3]:=force;wrench[4:6]:=cross(arm,force);
          end if;
        end if;
      end for;
    end if;
  end for;
end sharkSubLoad;
