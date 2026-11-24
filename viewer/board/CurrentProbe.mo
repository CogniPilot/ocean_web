model CurrentProbe "On-demand 3D samples of the Piccard's ambient mean current in ENU m/s"
  input Real points[125,3],tide,wind,bearing,tidalEast;
  output Real velocity[125,3];
  function sampleField
    input Real points[125,3],tide,wind,bearing,tidalEast;
    output Real velocity[125,3];
  protected
    Real residual[2],depth;
    constant Real layers[3,3]=Wreck.Current.profile;
  algorithm
    for i in 1:size(points,1) loop
      depth:=min(max(-points[i,3],layers[1,1]),layers[3,1]);
      for j in 1:2 loop
        residual[j]:=Modelica.Math.Vectors.interpolate(layers[:,1],layers[:,j+1],depth);
      end for;
      velocity[i,:]:=Wreck.Current.meanVelocity(points[i,3],tide,wind,bearing,tidalEast,residual,Wreck.Current.shelterAt(points[i,:]));
    end for;
  end sampleField;
equation
  velocity=sampleField(points,tide,wind,bearing,tidalEast);
end CurrentProbe;
