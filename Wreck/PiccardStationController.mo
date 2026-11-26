within Wreck;
block PiccardStationController "50 Hz current-compensated position hold for the two axial and four vertical motors"
  parameter Real dt=.02, dryMass=18, displaced=.0184, density=1025;
  parameter Real addedMass[3]={3,9,11} "Body-axis added masses, kg";
  parameter Real linearDrag=1.5, surgeDrag=2, swayDrag=5.75;
  parameter Real feedforwardGain(min=0,max=1)=1;
  parameter Real minVectorForce=2 "Bank responds to at least this effective vertical load, N";
  parameter Real ballastReserve=.00020 "Additional piston volume per tank in sustained current, m3";
  parameter Real arm=.16, foreX=.0325, aftX=-.215, motorLimit=14;
  input Real active "Positive while the pilot owns position control";
  input Real pose[3] "Measured east, north and pressure depth, metres (depth positive down)";
  input Real attitude[3] "Estimated roll, pitch and heading, radians";
  input Real gyro[3] "High-rate body angular velocity, rad/s";
  input Real groundSpeed[3] "Forward and port in the level heading frame, up in world frame, m/s";
  input Real bottomLock "Positive for valid horizontal velocity";
  input Real currentENU[2] "Estimated east/north water speed, m/s";
  input Real pilot[4] "Forward speed, port speed, yaw rate, up speed";
  input Real pitchReference "Requested FLU pitch angle, radians";
  input Real netWeight "Estimated weight minus buoyancy, newtons, positive down";
  input Real restoringMoment[3] "Estimated hydrostatic moment in body-axis newton metres";
  output Real motors[6]=sampleState[9:14] "Signed motor commands, N";
  output Real tankTargets[2]=sampleState[15:16] "Fore and aft tank targets, cubic metres";
  output Real targetRoll=sampleState[17];
  output Real forceTarget[3]=sampleState[18:20] "Forward, port, and up forces, N";
protected
  discrete Real sampleState[26](each start=0,each fixed=true);
  function stationSample "One controller sample including its retained state"
    input Real prev[26];
    input Real active,pose[3],attitude[3],gyro[3],groundSpeed[3],bottomLock,currentENU[2],pilot[4];
    input Real pitchReference,netWeight,restoringMoment[3];
    input Real dryMass,displaced,density,addedMass[3],linearDrag,surgeDrag,swayDrag,arm,foreX,aftX,motorLimit,feedforwardGain,dt,minVectorForce,ballastReserve;
    output Real nextSample[26];
  protected
    Real station[3],bias[3],yawRef,motors[6],tankTargets[2],targetRoll,forceTarget[3];
    Boolean engaged;
    Real yawLead,cs,sn,holdE,holdN,depthError,relativeSurge,relativeSway;
    Real axialDemand,uprightDemand,surgeSpeed,swaySpeed,upSpeed,surge,sway,vertical,heave,bank,trim,waterSpeed;
    Real rollTorque,pitchTorque,yawTorque,rawMotors[6];
    Real cosBank,sinBank,cosPitch,sinPitch,headingRate,pitchRate,headingMoment,pitchMoment,headingNow;
    Real upBody[3],steepWeight,poleYawRate,steepMoment[3],headingPredicted,compassOffset,poleRecovery;
    Real yawDifferential,axialRoom,axial,rollDifferential,pitchDifferential,attitudeScale;
    Real foreRatio,aftRatio,minHeave,maxHeave,fore,aft;
    Real waterForward,waterPort,groundUp,relBody[3],hydroMoment[3];
    Boolean moving,horizontalValid;
  algorithm
    engaged:=active>.5;
    moving:=abs(pilot[1])>.025 or abs(pilot[2])>.01;
    horizontalValid:=bottomLock>.5;
    for i in 1:3 loop
      // Track the measured pose during travel and capture it on the first
      // neutral sample, independently for depth and horizontal position.
      station[i]:=if not engaged or prev[8]<.5 or
        (if i==3 then abs(pilot[4])>.025 or prev[24]>.5 else moving or prev[23]>.5)
        then pose[i] else prev[i];
    end for;
    holdE:=station[1]-pose[1]; holdN:=station[2]-pose[2]; depthError:=pose[3]-station[3];
    for i in 1:3 loop
      bias[i]:=if not engaged or prev[8]<.5 then 0
        elseif (if i==3 then abs(pilot[4])>.025 else moving) then prev[3+i]*(1-dt/.8)
        elseif i<3 and not horizontalValid then prev[3+i]
        else max(-5,min(5,prev[3+i]+.35*dt*(if i==3 then depthError else station[i]-pose[i])));
    end for;
    // Allow for the motor and attitude response during a deliberate change of heading.
    yawLead:=attitude[3]+.35*pilot[3];
    cs:=cos(yawLead); sn:=sin(yawLead);
    surgeSpeed:=if moving then pilot[1] else max(-.55,min(.55,.8*(holdE*cs+holdN*sn)));
    swaySpeed:=if moving then pilot[2] else max(-.4,min(.4,.8*(-holdE*sn+holdN*cs)));
    upSpeed:=if abs(pilot[4])>.025 then pilot[4] else max(-.4,min(.4,.8*depthError));
    relativeSurge:=surgeSpeed-feedforwardGain*(currentENU[1]*cs+currentENU[2]*sn);
    relativeSway:=swaySpeed+feedforwardGain*(currentENU[1]*sn-currentENU[2]*cs);
    surge:=linearDrag*relativeSurge+surgeDrag*relativeSurge*abs(relativeSurge)+bias[1]*cs+bias[2]*sn
      +(if horizontalValid then 18*(surgeSpeed-groundSpeed[1]) else 0);
    sway:=linearDrag*relativeSway+swayDrag*relativeSway*abs(relativeSway)-bias[1]*sn+bias[2]*cs
      +(if horizontalValid then 12*(swaySpeed-groundSpeed[2]) else 0);
    vertical:=netWeight+bias[3]+24*(upSpeed-groundSpeed[3]);
    forceTarget:={surge,sway,vertical};
    // Resolve commanded force in the pitched frame before banking to produce sway.
    cosBank:=cos(attitude[1]); sinBank:=sin(attitude[1]);
    cosPitch:=cos(attitude[2]); sinPitch:=sin(attitude[2]);
    axialDemand:=cosPitch*surge-sinPitch*vertical;
    uprightDemand:=sinPitch*surge+cosPitch*vertical;
    bank:=-max(-.80,min(.80,atan2(sway,max(minVectorForce,abs(uprightDemand)))))*uprightDemand/sqrt(uprightDemand*uprightDemand+.04);
    targetRoll:=bank;
    heave:=uprightDemand/max(.55,cosBank);
    upBody:={-sinPitch,sinBank*cosPitch,cosBank*cosPitch};
    steepWeight:=max(0,min(1,(abs(attitude[2])-pi/3)/(pi/12)));
    poleYawRate:=(upBody[1]*gyro[1]+upBody[3]*gyro[3])/max(.1,1-upBody[2]^2);
    // Use one observable yaw axis throughout a vertical maneuver. Wait for
    // level attitude and two full navigator samples before changing references.
    poleRecovery:=if not engaged then 0
      elseif abs(attitude[2])>pi/3 or abs(pitchReference)>pi/3 then .6
      elseif abs(attitude[2])<pi/18 and abs(gyro[2])<.1 then max(0,prev[26]-dt)
      else prev[26];
    headingRate:=if poleRecovery>0 then poleYawRate
      else (sinBank*gyro[2]+cosBank*gyro[3])/max(.4,cosPitch);
    pitchRate:=cosBank*gyro[2]-sinBank*gyro[3];
    // At the pole the forward-axis bearing is undefined. Carry the observable
    // port-axis azimuth through the maneuver. Reconcile its reference with
    // the navigator before resuming the ordinary 5 Hz heading corrections.
    headingPredicted:=prev[22]+dt*headingRate;
    compassOffset:=if not engaged or prev[8]<.5 then 0
      elseif poleRecovery>0 or prev[26]>0 then headingPredicted-attitude[3] else prev[25];
    headingNow:=if not engaged or prev[8]<.5 then attitude[3]
      elseif poleRecovery<=0 and abs(attitude[3]-prev[21])>1e-9 then attitude[3]+compassOffset
      else headingPredicted;
    yawRef:=if not engaged or prev[8]<.5 or abs(pilot[3])>.015 then headingNow else prev[7];
    headingMoment:=7*(pilot[3]-headingRate)+11*atan2(sin(yawRef-headingNow),cos(yawRef-headingNow));
    pitchMoment:=10*(pitchReference-attitude[2])-4*pitchRate;
    // Translating through a beam current produces a Munk moment on this
    // elongated hull. Estimate it from onboard velocity/current measurements.
    waterForward:=(if horizontalValid then groundSpeed[1] else surgeSpeed)
      -feedforwardGain*(currentENU[1]*cos(attitude[3])+currentENU[2]*sin(attitude[3]));
    waterPort:=(if horizontalValid then groundSpeed[2] else swaySpeed)
      -feedforwardGain*(-currentENU[1]*sin(attitude[3])+currentENU[2]*cos(attitude[3]));
    groundUp:=groundSpeed[3];
    relBody:={cosPitch*waterForward-sinPitch*groundUp,
      sinBank*sinPitch*waterForward+cosBank*waterPort+sinBank*cosPitch*groundUp,
      cosBank*sinPitch*waterForward-sinBank*waterPort+cosBank*cosPitch*groundUp};
    hydroMoment:=cross(relBody,addedMass.*relBody);
    rollTorque:=9*(targetRoll-attitude[1])-3.6*(gyro[1]+sinPitch*headingRate)
      -sinPitch*headingMoment-restoringMoment[1]+hydroMoment[1];
    pitchTorque:=cosBank*pitchMoment+sinBank*cosPitch*headingMoment-restoringMoment[2]+hydroMoment[2];
    yawTorque:=-sinBank*pitchMoment+cosBank*cosPitch*headingMoment-restoringMoment[3]+hydroMoment[3];
    steepMoment:=steepTiltMoment(upBody,targetRoll,pitchReference,gyro,headingMoment)-restoringMoment+hydroMoment;
    rollTorque:=(1-steepWeight)*rollTorque+steepWeight*steepMoment[1];
    pitchTorque:=(1-steepWeight)*pitchTorque+steepWeight*steepMoment[2];
    yawTorque:=(1-steepWeight)*yawTorque+steepWeight*steepMoment[3];
    // A common axial command spends only the thrust left after differential yaw.
    yawDifferential:=max(-motorLimit,min(motorLimit,yawTorque/(2*arm)));
    axialRoom:=motorLimit-abs(yawDifferential);
    axial:=max(-axialRoom,min(axialRoom,axialDemand/2));
    // Preserve attitude moments as a pair. Collective can use the remaining
    // headroom on each motor pair without inducing an unwanted pitch moment.
    rollDifferential:=rollTorque/(4*arm);
    pitchDifferential:=-pitchTorque/(2*(foreX-aftX));
    attitudeScale:=min(1,motorLimit/max(.0001,abs(rollDifferential)+abs(pitchDifferential)));
    rollDifferential:=rollDifferential*attitudeScale;
    pitchDifferential:=pitchDifferential*attitudeScale;
    foreRatio:=-aftX/(2*(foreX-aftX)); aftRatio:=foreX/(2*(foreX-aftX));
    minHeave:=max((-motorLimit+abs(rollDifferential)-pitchDifferential)/foreRatio,
                  (-motorLimit+abs(rollDifferential)+pitchDifferential)/aftRatio);
    maxHeave:=min((motorLimit-abs(rollDifferential)-pitchDifferential)/foreRatio,
                  (motorLimit-abs(rollDifferential)+pitchDifferential)/aftRatio);
    heave:=max(minHeave,min(maxHeave,heave));
    fore:=foreRatio*heave+pitchDifferential; aft:=aftRatio*heave-pitchDifferential;
    rawMotors:={axial-yawDifferential,axial+yawDifferential,
      fore+rollDifferential,fore-rollDifferential,aft+rollDifferential,aft-rollDifferential};
    for i in 1:6 loop
      motors[i]:=if engaged then max(-motorLimit,min(motorLimit,rawMotors[i])) else 0;
    end for;
    // At zero lateral demand trim for neutral buoyancy. Under sustained beam
    // current, admit enough water to vector upward thrust at a moderate bank.
    waterSpeed:=sqrt(currentENU*currentENU);
    trim:=(displaced-dryMass/density)/2+min(.00030,ballastReserve*waterSpeed/(waterSpeed+.12)
      +abs(sway)/(2*density*9.80665*tan(.45)))-.00010*depthError;
    tankTargets:={max(0,min(.0008,trim-.0002*(attitude[2]-pitchReference))),max(0,min(.0008,trim+.0002*(attitude[2]-pitchReference)))};
    nextSample:=cat(1,station,bias,{yawRef,if engaged then 1 else 0},motors,tankTargets,{targetRoll},forceTarget,{attitude[3],headingNow,if moving then 1 else 0,if abs(pilot[4])>.025 then 1 else 0,compassOffset,poleRecovery});
  end stationSample;
equation
  when sample(0,dt) then
    sampleState=stationSample(pre(sampleState),active,pose,attitude,gyro,groundSpeed,bottomLock,currentENU,
      pilot,pitchReference,netWeight,restoringMoment,dryMass,displaced,density,addedMass,linearDrag,surgeDrag,swayDrag,
      arm,foreX,aftX,motorLimit,feedforwardGain,dt,minVectorForce,ballastReserve);
  end when;
end PiccardStationController;
