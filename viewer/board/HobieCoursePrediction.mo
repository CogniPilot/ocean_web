model HobieCoursePrediction "Reduced-order predictor for a Hobie tactical heading sequence"
  input Real state[5] "East and north distance to gate, heading, yaw rate, forward speed";
  input Real bearings[3] "Commanded absolute headings, five seconds per segment";
  input Real forecast[15,2] "Wind-from angle (rad) and true speed (m/s), one row per second";
  input Real current[2] "East and north current (m/s)";
  output Real cost;
  function evaluate
    input Real state[5], bearings[3], forecast[15,2], current[2];
    output Real loss;
  protected
    Real east,north,heading,rate,speed,previousSpeed,targetSpeed,off,err,turnEffort,range,bestRange,approachCost;
  algorithm
    east:=state[1];north:=state[2];heading:=state[3];rate:=state[4];speed:=state[5];
    turnEffort:=0;approachCost:=0;bestRange:=sqrt(east*east+north*north);
    for k in 1:15 loop
      err:=atan2(sin(bearings[div(k-1,5)+1]-heading),cos(bearings[div(k-1,5)+1]-heading));
      rate:=rate+.55*(max(-.42,min(.42,err*.7))-rate);
      heading:=heading+rate;
      off:=abs(atan2(sin(heading-forecast[k,1]),cos(heading-forecast[k,1])));
      // Speed polar used by the regatta tactics, with finite surge and yaw response.
      targetSpeed:=min(1.7,max(0,forecast[k,2])/11)*max(0,min(1,(off-.50)/.45))*
        (if off<1.38 then 3.8+.9*(off-.94) elseif off<2.49 then 5.25 else 5.25-2.3*(off-2.49));
      previousSpeed:=speed;
      speed:=speed+(targetSpeed-speed)*.22-.20*abs(rate)*speed;
      east:=east-.5*(speed+previousSpeed)*cos(heading)-current[1];
      north:=north-.5*(speed+previousSpeed)*sin(heading)-current[2];
      range:=sqrt(east*east+north*north);
      bestRange:=min(bestRange,range);
      approachCost:=approachCost+bestRange/15;
      turnEffort:=turnEffort+rate*rate;
    end for;
    loss:=bestRange+approachCost+.7*turnEffort;
  end evaluate;
equation
  cost=evaluate(state,bearings,forecast,current);
end HobieCoursePrediction;
