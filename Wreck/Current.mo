within Wreck;
package Current "Residual, tidal and wind-driven water velocity"
  constant Real profile[3,3]=[0,.26,.07;8,.19,.04;16,.08,.02];
  function shelterAt
    input Real pos[3];
    output Real shelter;
  algorithm
    shelter:=1-.78*(.5+.5*tanh(pos[1]-1))*(.5+.5*tanh(28-pos[1]))*(.5+.5*tanh(4-abs(pos[2])))*(.5+.5*tanh(-6-pos[3]));
  end shelterAt;
  function meanVelocity
    input Real z,tide,wind,bearing,tidalEast,residual[2],shelter;
    output Real velocity[3];
  algorithm
    velocity:=shelter*({residual[1]+tidalEast,residual[2],0}+
      .014*wind*exp(min(0,z-tide)/2.2)*{cos(bearing),sin(bearing),0});
  end meanVelocity;
end Current;
