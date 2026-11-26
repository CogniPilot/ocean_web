model DiverLiveUpdate "One actor coefficient in a four-diver, six-decision policy-gradient batch"
  input Real feature[4,6],noise[4,6],reward[4,6];
  input Real weight,moment,variance,step,sigma,learningRate,previousGradient,groupCount;
  // Each adjacent pair has the same initial state, current and task and uses
  // opposing Gaussian draws. Use their discounted reward difference to
  // weight the two signed score samples, as in the native paired trainer.
  Real advantage[2,6],gradient,nextMoment,nextVariance,newWeight;
  output Real update[4];
equation
  for pair in 1:2 loop
    advantage[pair,6]=reward[2*pair-1,6]-reward[2*pair,6];
    for t in 1:5 loop
      advantage[pair,t]=reward[2*pair-1,t]-reward[2*pair,t]+.94*advantage[pair,t+1];
    end for;
  end for;
  // Analytic VJP of DiverPolicyScore at zero mean shift, averaged over
  // the 24 state/action samples. The returns come from articulated rollouts.
  gradient=previousGradient+sum(advantage[pair,t]*(noise[2*pair-1,t]*feature[2*pair-1,t]
    -noise[2*pair,t]*feature[2*pair,t]) for pair in 1:2,t in 1:6)/(24*sigma*groupCount);
  nextMoment=.90*moment+.10*gradient;
  nextVariance=.99*variance+.01*gradient^2;
  newWeight=weight+learningRate*(nextMoment/(1-.90^(step+1)))/(sqrt(nextVariance/(1-.99^(step+1)))+1e-7);
  update[1]=newWeight;
  update[2]=nextMoment;
  update[3]=nextVariance;
  update[4]=gradient;
end DiverLiveUpdate;
