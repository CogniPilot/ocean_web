model DiverPolicyScore "Log score of one sampled Gaussian control under a linear mean shift"
  input Real features[5];
  input Real shift[5] "Perturbation to the current policy weights";
  input Real epsilon "Standard-normal sample held fixed during differentiation";
  input Real sigma "Latent action standard deviation";
  Real integral(start=0,fixed=true);
equation
  // For a fixed action sampled from the old mean, the new standardized
  // residual is epsilon - dot(shift,features)/sigma. Evaluate at zero shift.
  der(integral)=-0.5*(epsilon-(shift[1]*features[1]+shift[2]*features[2]+shift[3]*features[3]
    +shift[4]*features[4]+shift[5]*features[5])/sigma)^2;
end DiverPolicyScore;
