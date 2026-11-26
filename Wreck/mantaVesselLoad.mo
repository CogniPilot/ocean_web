within Wreck;
function mantaVesselLoad "ENU contact wrench on a vessel from registered manta rays"
  input Real traffic[10,9],articulation[10,4];
  input Real pose[6] "East, north, up, roll, nose-down pitch and yaw";
  input Real velocity[3] "East and north speeds, yaw rate";
  input Real length,halfWidth,spacing,draft;
  input Real vertical=0,rollRate=0,pitchRate=0;
  output Real wrench[6];
protected
  Real contact[12],wing,difference;
algorithm
  wrench:=zeros(6);
  for k in 1:10 loop
    if traffic[k,1]>2.5 and traffic[k,1]<3.5 and
       (pose[1]-traffic[k,2])^2+(pose[2]-traffic[k,3])^2<(length*.5+5.7)^2 and
       abs(pose[3]-traffic[k,4])<3+abs(draft) then
      wing:=.MantaContact.strokeAngle(articulation[k,1],articulation[k,2]);
      difference:=if traffic[k,1]>3.05 then articulation[k,2]*cos(articulation[k,1]) else 0;
      contact:=.MantaContact.pair(traffic[k,:],wing+difference,pose,velocity,length,halfWidth,spacing,draft,
        articulation[k,4],zeros(3),articulation[k,3],vertical,rollRate,pitchRate,wing-difference,articulation[k,3]);
      wrench:=wrench+contact[1:6];
    end if;
  end for;
end mantaVesselLoad;
