model SphereBoxProbe
  input Real center[3];
  input Real worldToBox[3,3];
  input Real halfExtent[3];
  input Real radius;
  output MultiBodyLie.Collision.ContactPoint point;
equation
  point = MultiBodyLie.Collision.sphereBox(center,zeros(3),radius,zeros(3),zeros(3),worldToBox,halfExtent);
end SphereBoxProbe;
