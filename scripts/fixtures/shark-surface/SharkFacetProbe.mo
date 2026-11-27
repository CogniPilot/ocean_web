model SharkFacetProbe "Exercise contacts whose witness is in the interior of a shark triangle"
  function test
    input Real x;
    output Real hit[14];
  protected
    Real points[48,3];
    Integer faces[92,3];
  algorithm
    points:=zeros(48,3);faces:=zeros(92,3);
    points[1,:]:={x-1,-1,-.02};points[2,:]:={x+1,-1,-.02};points[3,:]:={x,1,-.02};faces[1,:]:={1,2,3};
    hit[1:7]:=Wreck.SharkContact.floorPatch({-.05,-.05,0},{.05,-.05,0},{0,.05,0},points,3,1,1,faces);
    hit[8:14]:=Wreck.SharkContact.solid(points,{-.05,-.05,-.05},{.05,.05,.05},
      [-1,0,0,.05;1,0,0,.05;0,-1,0,.05;0,1,0,.05;0,0,-1,.05;0,0,1,.05],1,1,faces);
  end test;
  input Real offset;
  output Real hit[14];
equation
  hit=test(offset);
end SharkFacetProbe;
