function walkingSole
  input Real x[18];
  output Real y[6];
protected
  Real f[3];
  Real tau[3];
algorithm
  (f,tau) := groundWrench(x[1:3], {{x[4],x[5],x[6]}, {x[7],x[8],x[9]}, {x[10],x[11],x[12]}},
    x[13:15], x[16:18], {{-.035,-.020,0},{-.035,.020,0},{.035,-.020,0},{.035,.020,0}},
    {.003,.003,.003,.003}, 10000, .5, .8, .0001, .01);
  y := {f[1],f[2],f[3],tau[1],tau[2],tau[3]};
end walkingSole;

model WalkingSole
  input Real x[18];
  output Real y[6];
equation
  y = walkingSole(x);
end WalkingSole;
