package HarborGrid "Hex mesh coordinates shared by the live harbor and its offline flow solution"
  function axisStrip
    input Integer n;
    input Real rawLower,rawUpper,nearLower,nearUpper,outerLower,outerUpper;
    output Real faces[n+1];
  protected
    Real section[n+1,2,2,3],p[:,3];
    Meshing.PolyMesh strip;
    Integer i;
  algorithm
    for k in 1:2 loop
      for j in 1:2 loop
        for s in 1:n+1 loop
          section[s,j,k,:]:={rawLower+(rawUpper-rawLower)*(s-1)/n,j-1,k-1};
        end for;
      end for;
    end for;
    strip:=Meshing.loftHexMesh(section);
    p:=Meshing.stretchFarField(strip,{nearLower,.25,.25},{nearUpper,.75,.75},
        {outerLower,0,0},{outerUpper,1,1});
    for v in 1:strip.nPoints loop
      if strip.points[v,2]==0 and strip.points[v,3]==0 then
        i:=1+integer(floor((strip.points[v,1]-rawLower)*n/(rawUpper-rawLower)+.5));
        faces[i]:=p[v,1];
      end if;
    end for;
  end axisStrip;

  impure function writeGrid
    input String path;
    output Boolean success;
  protected
    Real x1[:]=axisStrip(34,-45,-3,-36,-12,-190,15),x2[:]=axisStrip(40,25,87,34,77,15,260);
    Real y1[:]=axisStrip(34,-72,-28,-60,-40,-245,-10),y2[:]=axisStrip(34,7,50,14,37,-10,185);
    Real z[:]=axisStrip(26,-24,0,-15,-1,-50,0);
  algorithm
    for i in 1:size(x1,1) loop
      Modelica.Utilities.Streams.print("E "+String(x1[i],significantDigits=15),path);
    end for;
    for i in 2:size(x2,1) loop
      Modelica.Utilities.Streams.print("E "+String(x2[i],significantDigits=15),path);
    end for;
    for i in 1:size(y1,1) loop
      Modelica.Utilities.Streams.print("N "+String(y1[i],significantDigits=15),path);
    end for;
    for i in 2:size(y2,1) loop
      Modelica.Utilities.Streams.print("N "+String(y2[i],significantDigits=15),path);
    end for;
    for i in 1:size(z,1) loop
      Modelica.Utilities.Streams.print("U "+String(z[i],significantDigits=15),path);
    end for;
    success:=true;
  end writeGrid;
end HarborGrid;
