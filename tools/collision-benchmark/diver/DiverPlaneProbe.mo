model DiverPlaneProbe "Reference mesh support along a known terrain normal"
  function supportGap
    input Real height[:](each unit="m") "Posed vertices in the terrain frame";
    input Real offset(unit="m");
    output Real gap(unit="m");
  algorithm
    gap := height[1];
    for i in 2:size(height,1) loop
      gap := min(gap,height[i]);
    end for;
    gap := gap + offset;
  end supportGap;
  parameter Integer vertexCount=807;
  input Real heights[vertexCount];
  input Real offset;
  output Real gap;
equation
  gap=supportGap(heights,offset);
end DiverPlaneProbe;
