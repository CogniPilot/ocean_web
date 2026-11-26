model DiverSwimPolicy "Open-water neural fin controller and training objective"
  input Real state[16],current[3],command[2] "Current ENU m/s; speed effort and left turn";
  input Real weights[8,15],noise[8],held[8] "Policy weights, pre-tanh Gaussian perturbation, held action";
  input Real seed=1,noiseSign=0,sigma=0 "Nonnegative 32-bit seed and exploration inputs";
  input Real attitudeStick[2]=zeros(2),previousTrim[2]=zeros(2) "Nose-up and right-roll commands; last commanded Euler trim [rad]";
  input Real fast=0 "Double requested body speed and all angular rates";
  input Real translationStick[2]=zeros(2),torch=0 "Positive port translation and ascent requests; right hand occupied";
  output Real axialAction[4],verticalAction,glideAssist;
  output Real nextTrim[2],targets[6] "Water-relative forward m/s, yaw, nose-up and roll rates rad/s";
  input Real previousTotal[5]=zeros(5),sampleCount=1;
  input Real batchElement[5]=zeros(5);
  output Real batchTotal[5],batchMean[5],nextBatchSeed,trainingSeed;
  output Real nextTrialSeed,nextNoiseSeed,trialDepth,trialCurrent[3],trialPose[16],perturbation[8],total[5],mean[5];
  input Real rolloutTime,depth,power "Seconds since start, start depth (m), mechanical W";
  output Real features[15],decision[8],jointAction[10],lateralAction[4];
  output Real measures[5] "Reward, forward-speed error, yaw-rate error, trim magnitude and mechanical W";
protected
  function randomStep "Numerical Recipes LCG; all integer products remain exact in binary64"
    input Real fromSeed;
    output Real toSeed;
  algorithm
    toSeed:=mod(1664525.0*fromSeed+1013904223.0,4294967296.0);
  end randomStep;
  function experimentSeed
    input Real u;
    output Real id;
  algorithm
    id:=floor(1e9*u);
  end experimentSeed;
  function clip
    input Real v;
    output Real c;
  algorithm
    c:=max(-1,min(1,v));
  end clip;
  Real rng[17],u[16];
  Real bow,twist,pitchDemand,rollDemand;
  Real forward,yaw,ramp,attitude,speedError,turnError,drive,turn,trim,steer;
  Real side[2],phase[2],swing[2],tuck[2],loadBlade[2],scoop[2],amp[2],hip[2],knee[2],ankle[2];
  Real readyPose,flutterAmp[2],sweepStroke[2],sideBlend,sideBeat[2],sideLoad[2],kneePose[2],swimActive,strafe,vertical,athwart,verticalSpeed,relative[3],longitudinal[3],port[3],sideSpeedError,verticalError,angularError,powerHand[2],anklePose[2];
  Real backPhase[2],backKnee[2],backHip[2],backBlade[2],reverseMax;
  Real outside[2],reverse,sense,armDrive,armBeat,shoulder[2],elbow[2],scale;
equation
  rng[1]=seed;
  for i in 1:16 loop
    rng[i+1]=randomStep(rng[i]);
    u[i]=(rng[i+1]+.5)/4294967296.0;
  end for;
  nextBatchSeed=rng[2];trainingSeed=experimentSeed(u[1]);
  batchTotal=previousTotal+batchElement;batchMean=batchTotal/max(1,sampleCount);
  nextTrialSeed=rng[8];nextNoiseSeed=rng[17];
  trialDepth=7+6*u[4];trialCurrent={.5*(u[2]-.5),.5*(u[3]-.5),0};
  trialPose={0,0,-trialDepth,trialCurrent[1],trialCurrent[2],0,6.28*u[1],.12*(u[5]-.5),.15*(u[6]-.5),0,0,0,6.28*u[7],0,0,0};
  for k in 1:8 loop
    perturbation[k]=noiseSign*sqrt(-2*log(u[2*k-1]))*cos(6.283185307179586*u[2*k]);
  end for;
  relative=state[4:6]-current;
  longitudinal={cos(state[7])*cos(state[8]),sin(state[7])*cos(state[8]),sin(state[8])};
  port={-sin(state[7])*cos(state[9])-cos(state[7])*sin(state[8])*sin(state[9]),
    cos(state[7])*cos(state[9])-sin(state[7])*sin(state[8])*sin(state[9]),cos(state[8])*sin(state[9])};
  forward=longitudinal*relative;athwart=port*relative;verticalSpeed=relative[3];
  scale=if noEvent(fast>.5) then 2 else 1;
  reverseMax=if noEvent(command[1]<0) then .16 else .36;
  targets=scale*{reverseMax*clip(command[1]),.14*clip(command[2]),.46*clip(attitudeStick[1]),.65*clip(attitudeStick[2]),.17*clip(translationStick[1]),.10*clip(translationStick[2])};
  features={1,targets[1]/(2*reverseMax),targets[2]/.28,targets[3]/.92,targets[4]/1.30,targets[5]/.34,targets[6]/.20,
    min(1,max(0,torch)),clip(forward),clip(athwart),clip(verticalSpeed),clip(state[10]),clip(state[11]),clip(state[12]),clip(state[8])};
  for i in 1:8 loop
    decision[i]=tanh(sum(weights[i,k]*features[k] for k in 1:15)+sigma*noise[i]);
  end for;
  pitchDemand=clip(attitudeStick[1]);rollDemand=clip(attitudeStick[2]);
  // Direct strokes while the stick is held. On release retain the attitude
  // reached, then damp body rotation using opposite fin feathering.
  nextTrim[1]=if noEvent(abs(pitchDemand)>.025) then state[8] else previousTrim[1];
  nextTrim[2]=if noEvent(abs(rollDemand)>.025) then state[9] else previousTrim[2];
  bow=clip(1.3*abs(pitchDemand)*held[5]+.50*targets[3]+1.8*(nextTrim[1]-state[8])-.55*state[11]);
  twist=clip(1.3*abs(rollDemand)*held[6]+.50*targets[4]+.95*atan2(sin(nextTrim[2]-state[9]),cos(nextTrim[2]-state[9]))-.75*state[12]);
  reverse=if noEvent(command[1]<-.015) then 1 else 0;
  sense=1-2*reverse;
  swimActive=if noEvent(abs(command[1])+abs(command[2])+abs(translationStick[1])>.015) then 1 else 0;
  drive=max(swimActive*max(0,sense*held[1]),.66*max(abs(pitchDemand),abs(rollDemand)));
  turn=swimActive*held[2];trim=swimActive*held[3];steer=abs(turn);
  strafe=if noEvent(abs(translationStick[1])>.015) then clip(.55*scale*translationStick[1]+.7*held[7]) else 0;
  vertical=if noEvent(abs(translationStick[2])>.015) then scale*translationStick[2] else 0;
  verticalAction=max(-2,min(2,vertical*(1+.22*held[8])));
  armDrive=min(1,max(abs(targets[1])/(1.65*reverseMax),abs(strafe)))*(.55+.45*held[4]);
  armBeat=state[13]-.75*sense*sin(state[13]);
  glideAssist=max(0,1-8*max(abs(command[1]),max(abs(command[2]),max(abs(pitchDemand),max(abs(rollDemand),abs(translationStick[1]))))));
  sideBlend=abs(strafe);
  readyPose=min(1,3*(abs(command[1])+abs(command[2])+abs(pitchDemand)+abs(rollDemand)+abs(strafe)));
  for k in 1:2 loop
    side[k]=if k==1 then 1 else -1;
    outside[k]=if noEvent(side[k]*turn<0) then 1 else 0;
    phase[k]=state[13]+(k-1)*3.141592653589793;
    sideBeat[k]=state[13]-.80*sign(strafe)*side[k]*sin(state[13]);
    sideLoad[k]=max(0,-cos(phase[k]))^2;
    swing[k]=if noEvent(outside[k]>.5) then 2.05*3.141592653589793-state[13] else state[13];
    tuck[k]=steer*max(0,cos(swing[k]-.52*3.141592653589793))^2;
    loadBlade[k]=steer*max(0,cos(swing[k]-.82*3.141592653589793))^2;
    scoop[k]=if noEvent(outside[k]>.5) then steer*max(0,cos(swing[k]-.75*3.141592653589793))^2 else 0;
    amp[k]=max(0,min(1,drive+.65*(if noEvent(outside[k]>.5) then steer else -steer)))*(1-.22*steer);
    flutterAmp[k]=min(1,1.3*amp[k]);
    backPhase[k]=phase[k]+.6*sin(phase[k]);
    backKnee[k]=sqrt(amp[k])*(.12+1.7*(.5+.5*sin(backPhase[k])));
    backHip[k]=-.50*backKnee[k]-.30*sqrt(amp[k])*cos(backPhase[k]);
    backBlade[k]=1.3*sqrt(amp[k])*(.55+.55*cos(backPhase[k]))-backHip[k]-backKnee[k];
    hip[k]=(if noEvent(reverse>.5) then backHip[k] else -.10*readyPose+.32*flutterAmp[k]*sin(phase[k]))-.25*tuck[k]-.45*scoop[k];
    knee[k]=(if noEvent(reverse>.5) then backKnee[k] else 1.15*readyPose+.35*flutterAmp[k]*sin(phase[k]))+1.05*tuck[k]+.07*steer;
    ankle[k]=(if noEvent(reverse>.5) then backBlade[k] else -amp[k]*(1.25*cos(phase[k])+1.30*sin(phase[k])))+.55*trim-.05*steer-.60*tuck[k]+.12*loadBlade[k]-1.2*scoop[k]
      -(if noEvent(outside[k]>.5) then .30*steer else 0)+.70*bow-side[k]*twist;
    // Both arms scull symmetrically. The elbow angles the palm for the
    // loaded sweep and feathers it on recovery; no arm-generated turn target.
    powerHand[k]=if noEvent(k==2 and torch>.5) then 0 else 1;
    shoulder[k]=1.25*powerHand[k]*armDrive*(.55+.53*sin(armBeat));
    elbow[k]=1.2*side[k]*powerHand[k]*armDrive*(.50+.60*sin(armBeat));
    // Anatomical zero is a right angle between boot and tibia. Keep the
    // swimming boot plantarflexed, feathering within adult range.
    anklePose[k]=min(1.02,max(-.23,if noEvent(reverse>.5 or steer>.7) then .72*readyPose+.43*ankle[k]
      else .69*readyPose+flutterAmp[k]*(-.32+.65*bow-.52*side[k]*twist)*cos(phase[k])+.15*trim*readyPose));
    // Sweep alternate knees laterally while opening both palms on the
    // power stroke and turning them edge-on during recovery.
    sweepStroke[k]=side[k]*.17*sideBlend-.30*strafe*sin(phase[k]);
    axialAction[2*k-1:2*k]={clip((1-sideBlend)*side[k]*steer*(.35*loadBlade[k]-.18*tuck[k])+strafe*sideLoad[k]),
      clip(powerHand[k]*((1-sideBlend)*armDrive*(.52*cos(armBeat)+.28*held[4]*sin(armBeat))
        +sideBlend*(.14-.90*side[k]*sign(strafe)*cos(sideBeat[k]))))};
    kneePose[k]=(1-sideBlend)*knee[k]+.85*sideBlend;
    jointAction[5*k-4:5*k]={clip(((1-sideBlend)*hip[k]-.30*sideBlend)/1.6),
      clip(kneePose[k]/(if noEvent(kneePose[k]<0) then .27 else 2)),
      clip((1-sideBlend)*anklePose[k]/(if noEvent(anklePose[k]<0) then .23 else 1.02)+.78*sideBlend),
      clip((1-sideBlend)*shoulder[k]/1.25+sideBlend*powerHand[k]*(.58+.55*sin(sideBeat[k]))),
      clip((1-sideBlend)*elbow[k]/1.2+sideBlend*powerHand[k]*side[k]*(.25+.62*sin(sideBeat[k])))};
    lateralAction[2*k-1:2*k]={clip(((1-sideBlend)*side[k]*steer*(.04+.22*max(0,cos(swing[k]-.94*3.141592653589793))^2)+sweepStroke[k])/.75),
      clip((1-sideBlend)*side[k]*(.025*steer-.80*loadBlade[k])/.55+strafe*sideLoad[k])};
  end for;
  ramp=min(1,rolloutTime/1.5);
  yaw=state[10];
  speedError=abs(forward-targets[1]*ramp);
  turnError=abs(yaw-targets[2]*ramp);
  sideSpeedError=abs(athwart-targets[5]*ramp);verticalError=abs(verticalSpeed-targets[6]*ramp);
  angularError=abs(state[11]-targets[3]*ramp)+abs(state[12]-targets[4]*ramp);
  attitude=sqrt((if noEvent(abs(pitchDemand)>.01) then 0 else state[8]^2)+(if noEvent(abs(rollDemand)>.01) then 0 else state[9]^2));
  measures={1-1.55*speedError-1.9*turnError-.8*sideSpeedError-.85*verticalError-.30*angularError-.24*attitude-.00018*power-.04*abs(state[3]+depth-rolloutTime*targets[6]),speedError,turnError,attitude,power};
  total=previousTotal+measures;
  mean=total/max(1,sampleCount);
end DiverSwimPolicy;
