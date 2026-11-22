model HerringGull "Flap-gliding herring gull with paired wing strips and a trimming tail"
  parameter Real mass=.705,span=1.35,area=.200,rho=1.225;
  parameter Real startState[8]={4,-12,8,0,13.4,0,0,0};
  parameter Real startMemory[7]={0,0,.015,0,0,0,1};
  parameter Real beatFrequency=3.13,rollInertia=.027,pitchInertia=.0057;
  parameter Real maxMusclePower=35 "Combined positive aerodynamic work limit [W]";
  input Real wind[2],seaLevel,offset,glideOnly;
  input Real straightFlight=0 "Hold initial heading for straight-flight comparisons",trimSpeed=12.7;
  discrete Real flapping(start=startMemory[7],fixed=true);
  output Real x[8](start=startState,each fixed=true) "ENU, heading, horizontal airspeed, vertical speed, phase and stroke amplitude";
  output Real wings[4] "Shoulder elevation, folded wrist angle, sweep and left bank";
  output Real memory[7] "Bank, roll rate, nose-up pitch, pitch rate, differential incidence, tail incidence, flap latch";
  output Real power "Positive aerodynamic work rate of the two wings [W]";
  output Real moments[2] "Roll and pitch moments about the centre of mass [N m]";
  output Real tailLift "Positive upward tail force in the longitudinal plane [N]";
protected
  Real bank(start=startMemory[1],fixed=true),rollRate(start=startMemory[2],fixed=true);
  Real pitch(start=startMemory[3],fixed=true),pitchRate(start=startMemory[4],fixed=true);
  Real differential(start=startMemory[5],fixed=true),tailTrim(start=startMemory[6],fixed=true);
  Real zTarget,orbit,airCourse,headingError,bankTarget,drive,rate,stroke,sweep,strokeRate;
  Real gamma,pressure,refCl,desiredVz,pitchTarget,tailCommand,rollCommand;
  Real arm[4],side[4],strokeVz[4],inflow[4],stripCl[4],stripCd[4],stripQ[4],fx[4],fz[4];
  Real chordwiseFlow,stripVertical[4],stripFlow[4],sinInflow[4],cosInflow[4];
  Real lift,forward,scale,work,tailAngle,tailCl,tailPressure,tailDrag,bodyDrag;
equation
  zTarget=seaLevel+9+2*offset;
  when sample(0,.1) then
    flapping=if x[5]<trimSpeed-1.1 or x[3]<zTarget-.8 then 1
      elseif x[5]>trimSpeed+.2 and x[3]>zTarget+.6 then 0 else pre(flapping);
  end when;
  drive=if glideOnly>.5 then 0 else flapping;
  rate=2*3.14159265*beatFrequency;
  der(x[8])=(drive-x[8])/.32;
  der(x[7])=rate;
  stroke=.095+.64*x[8]*sin(x[7]);
  strokeRate=.64*(der(x[8])*sin(x[7])+x[8]*rate*cos(x[7]));
  sweep=x[8]*(1+cos(x[7]))/2;
  orbit=if straightFlight>.5 then startState[4] else
    atan2(x[2]+15,x[1]-3)+1.571+atan((sqrt((x[2]+15)^2+(x[1]-3)^2)-23-6*offset)/13);
  // Crab into the crosswind to hold the requested course over the harbour.
  airCourse=if straightFlight>.5 then orbit else orbit+asin(max(-.94,min(.94,
    (wind[1]*sin(orbit)-wind[2]*cos(orbit))/max(2,x[5]))));
  headingError=atan2(sin(airCourse-x[4]),cos(airCourse-x[4]));
  bankTarget=max(-.70,min(.70,1.25*headingError));
  rollCommand=max(-.095,min(.095,.16*(bankTarget-bank)-.040*rollRate));
  der(differential)=max(-.95,min(.95,(rollCommand-differential)/.10));

  gamma=atan2(x[6],max(1,x[5]));
  pressure=.5*rho*(x[5]^2+x[6]^2);
  refCl=mass*9.81/max(1,pressure*area*cos(bank));
  desiredVz=(if glideOnly>.5 then -.65 else max(-1,min(1.35,.55*(zTarget+2.3-x[3]))))+
            max(-2,min(1.5,.75*(x[5]-trimSpeed)));
  pitchTarget=max(-.45,min(.52,gamma+refCl/4.7-.065+.075*(desiredVz-x[6])));
  tailCommand=max(-.30,min(.30,-.73*(pitchTarget-pitch)+.076*pitchRate));
  der(tailTrim)=max(-2.5,min(2.5,(tailCommand-tailTrim)/.065));

  chordwiseFlow=max(1,x[5]);
  for j in 1:4 loop
    side[j]=if j<=2 then -1 else 1;
    arm[j]=span*(if mod(j,2)==1 then .12 else .36)*(1-(if mod(j,2)==1 then .03 else .27)*sweep);
    strokeVz[j]=arm[j]*strokeRate*cos(stroke);
    stripVertical[j]=x[6]+strokeVz[j]+side[j]*arm[j]*rollRate;
    inflow[j]=atan2(stripVertical[j],chordwiseFlow);
    // Wrist flexion reduces the outer upstroke area and distal feathers twist
    // toward the local inflow. Opposite incidence changes roll the bird.
    stripCl[j]=max(-.70,min(1.48,4.7*(.065+pitch+side[j]*differential-inflow[j]
      +(if mod(j,2)==1 then .26 else .47)*(inflow[j]-gamma))));
    stripCd[j]=.012+.045*stripCl[j]^2;
    stripQ[j]=.125*rho*area*(x[5]^2+stripVertical[j]^2)*
      (1-(if mod(j,2)==1 then .04 else .30)*sweep);
    // Rotate the foil force with the normalized inflow components.
    stripFlow[j]=sqrt(chordwiseFlow^2+stripVertical[j]^2);
    sinInflow[j]=stripVertical[j]/stripFlow[j];
    cosInflow[j]=chordwiseFlow/stripFlow[j];
    fx[j]=stripQ[j]*(-stripCl[j]*sinInflow[j]-stripCd[j]*cosInflow[j]);
    fz[j]=stripQ[j]*( stripCl[j]*cosInflow[j]-stripCd[j]*sinInflow[j])*cos(stroke);
  end for;
  work=sum({max(0,-fz[j]*strokeVz[j]) for j in 1:4});
  scale=min(1,maxMusclePower/max(.001,work));power=scale*work;
  tailAngle=pitch-atan2(x[6]-.255*pitchRate,max(1,x[5]))+tailTrim-.16*refCl;
  tailCl=max(-.95,min(.95,3.15*tailAngle));
  tailPressure=.82*pressure*.024;
  tailLift=tailPressure*tailCl;
  tailDrag=tailPressure*(.014+.12*tailCl^2);
  lift=scale*sum(fz)+tailLift*cos(gamma)-tailDrag*sin(gamma);
  bodyDrag=.00077*x[5]*abs(x[5]);
  forward=scale*sum(fx)-tailLift*sin(gamma)-tailDrag*cos(gamma)-bodyDrag;
  // Positive left bank means the starboard wing rises. The aft tail sees
  // increased effective incidence in a nose-up pitch rate and damps the rate.
  moments[1]=scale*sum({side[j]*arm[j]*fz[j] for j in 1:4});
  moments[2]=(-.006-.015*sweep)*scale*sum(fz)-.255*tailLift-.050*pitchRate;
  der(bank)=rollRate;der(rollRate)=moments[1]/rollInertia;
  der(pitch)=pitchRate;der(pitchRate)=moments[2]/pitchInertia;
  der(x[1])=x[5]*cos(x[4])+wind[1];der(x[2])=x[5]*sin(x[4])+wind[2];der(x[3])=x[6];
  der(x[4])=lift*sin(bank)/(mass*max(2,x[5]));
  der(x[5])=forward/mass;der(x[6])=lift*cos(bank)/mass-9.81;
  wings={stroke,-.40*sweep,.50*sweep,bank};
  memory={bank,rollRate,pitch,pitchRate,differential,tailTrim,flapping};
end HerringGull;
