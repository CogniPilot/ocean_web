model DiverOptimizer "One Adam ascent parameter, paired discounted reward step and score aggregation"
  input Real weight,moment,variance,gradient,step,lr,beta1,beta2,epsilon;
  input Real rewardA,rewardB,futureA,futureB,futureAdv,gamma;
  input Real total,sampleValue,count;
  Real results[12](each start=0);
equation
  der(results[1])=weight+lr*((beta1*moment+(1-beta1)*gradient)/(1-beta1^(step+1)))/(sqrt((beta2*variance+(1-beta2)*gradient^2)/(1-beta2^(step+1)))+epsilon);
  der(results[2])=(beta1*moment+(1-beta1)*gradient);
  der(results[3])=(beta2*variance+(1-beta2)*gradient^2);
  der(results[4])=(step+1);
  der(results[5])=rewardA+gamma*futureA;
  der(results[6])=rewardB+gamma*futureB;
  der(results[7])=(rewardA-rewardB+gamma*futureAdv);
  der(results[8])=-(rewardA-rewardB+gamma*futureAdv);
  der(results[9])=total+sampleValue;
  der(results[10])=(total+sampleValue)/count;
  der(results[11])=total+gradient^2;
  der(results[12])=sqrt(total);
end DiverOptimizer;
