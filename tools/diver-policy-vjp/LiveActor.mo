model LiveActor "One row of a bounded linear policy for independently sized FMI control tasks"
  input Real features[32]=zeros(32),weights[32]=zeros(32),perturbation=0;
  output Real mean,action;
equation
  mean=weights*features+perturbation;
  action=tanh(mean);
end LiveActor;
