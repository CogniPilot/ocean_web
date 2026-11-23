model Rdd2Survey "CogniPilot RDD2 hovering over the wreck survey area"
  input Real windENU[3] "Wind velocity at the aircraft [m/s]";
  input Real rotorWakeTraffic[4,12]=zeros(4,12)
    "Source type (0 empty, 1 measured rotors, 2 scripted patrol), ENU position, WXYZ quaternion, four speeds [rad/s]";
  parameter Real propellerRadius=.125 "Effective RDD2 rotor disk radius [m]";
  parameter Real washThrustSensitivity=.035 "Fractional thrust loss per m/s of incident axial wash";
  output Real rotorWakeWind[3] "Added air velocity at the vehicle center [m/s]";
  output Real rotorWakeWrench[6] "Rotor thrust correction, then moment, in ENU [N, N.m]";
  function rotorWake "Momentum-based Gaussian rotor jets sampled at the frame and each receiving rotor"
    input Real position[3],orientation[4],omega[4],wind[3],sources[4,12],hub[4,3];
    input Real thrustCoefficient,hoverOmega,maxOmega,radius,thrustSensitivity;
    output Real centerWind[3],wrench[6];
  protected
    constant Real airDensity=1.225;
    Real receiveRotation[3,3],sourceRotation[3,3],arm[4,3],point[5,3],wakeVelocity[5,3];
    Real up[3],down[3],drift[3],center[3],relative[3],radial[3],force[3];
    Real induced[4],sourcePower[5], axial,radial2,width,peak,onset,loss,maxInduced;
    Boolean receiving;
  algorithm
    centerWind:=zeros(3);
    wrench:=zeros(6);
    receiving:=false;
    for i in 1:4 loop
      relative:=position-sources[i,2:4];
      receiving:=receiving or (sources[i,1]>.5 and relative*relative<144);
    end for;
    if receiving then
      receiveRotation:=transpose(MultiBodyLie.Math.quaternionToT(orientation));
      up:=receiveRotation[:,3];
      point[1,:]:=position;
      for j in 1:4 loop
        arm[j,:]:=receiveRotation*hub[j,:];
        point[j+1,:]:=position+arm[j,:];
      end for;
      wakeVelocity:=zeros(5,3);
      for i in 1:4 loop
        relative:=position-sources[i,2:4];
        if sources[i,1]>.5 and relative*relative<144 then
          for k in 1:4 loop
            // Actuator-disk induced velocity at the source rotor.
            induced[k]:=sqrt(thrustCoefficient/(2*airDensity*Modelica.Constants.pi*radius^2))*
              (if sources[i,1]>1.5 then hoverOmega else min(maxOmega,max(0,sources[i,k+8])));
          end for;
          maxInduced:=max(induced);
          if maxInduced>.01 then
            sourceRotation:=transpose(MultiBodyLie.Math.quaternionToT(sources[i,5:8]));
            down:=-sourceRotation[:,3];
            drift:=wind-(wind*down)*down;
            drift:=drift/max(2*maxInduced,sqrt(drift*drift));
            sourcePower:=zeros(5);
            for k in 1:4 loop
              center:=sources[i,2:4]+sourceRotation*hub[k,:];
              for j in 1:5 loop
                relative:=point[j,:]-center;
                axial:=relative*down;
                if axial>0 and axial<12 then
                  radial:=relative-axial*(down+drift);
                  radial2:=radial*radial;
                  width:=.72*radius+.20*axial;
                  if radial2<20*width^2 then
                    // The integral of rho*V^2 over a circular Gaussian jet is
                    // rho*pi*width^2*peak^2. Rotor momentum adds where jets overlap.
                    peak:=sqrt(2)*induced[k]*radius/width;
                    onset:=min(1,axial/radius);
                    sourcePower[j]:=sourcePower[j]+peak^2*exp(-radial2/width^2)*
                      (onset^2*(3-2*onset))^2*(1-(axial/12)^2)^2;
                  end if;
                end if;
              end for;
            end for;
            for j in 1:5 loop
              wakeVelocity[j,:]:=wakeVelocity[j,:]+sqrt(sourcePower[j])*down;
            end for;
          end if;
        end if;
      end for;
      centerWind:=wakeVelocity[1,:];
      for j in 1:4 loop
        // First-order change in thrust coefficient with axial inflow at fixed RPM.
        loss:=thrustCoefficient*omega[j]^2*min(.75,thrustSensitivity*max(0,-(wakeVelocity[j+1,:]*up)));
        force:=-loss*up;
        wrench[1:3]:=wrench[1:3]+force;
        wrench[4:6]:=wrench[4:6]+cross(arm[j,:],force);
      end for;
    end if;
  end rotorWake;
  parameter Real bedHeight=-13.71, displacedVolume=.0012 "Flooded vehicle displacement [m3]";
  parameter Real waterDragArea=.075,bodyHeight=.16;
  input Real motorCut,waterLevel,currentENU[3];
  output Real immersed;
  Real waterSlip[3],waterLoad[3];
  Vehicles.Rdd2.Plant aircraft(initialGroundClearance_m=4.9-bedHeight,groundAltitude=bedHeight,
    windWorld=windENU+rotorWakeWind,exposedFraction=1-immersed,
    fluidForceWorld=waterLoad+deckWrench[1:3]+sailWrench[1:3]+(1-immersed)*rotorWakeWrench[1:3],
    contactMomentWorld=deckWrench[4:6]+sailWrench[4:6]+(1-immersed)*rotorWakeWrench[4:6]);

  input Real deckEnabled,deckState[12];
  input Real sailDeckEnabled,sailDeckState[12],isCatamaran;
  output Real sailWrench[12] "Contact on aircraft then sailboat in ENU";
  output Real deckWrench[12] "World force and torque on drone then launch";
  function landingContact
    input Real enabled,deck[12],p[3],quat[4],v[3],bodyRate[3];
    input Real surfaceKind "0 committee launch, 1 trampoline, 2 sloop hatch";
    output Real result[12];
  protected
    Real A[3,3],B[3,3],r[3],delta[3],w[3],f[3],m[3],fb[3],mb[3],y,a,b;
    constant Real centers[3]={-1.98,1.54,2.42},lengths[3]={.98,.55,.34},widths[3]={.86,.67,.32};
    MultiBodyLie.Collision.Material rubber(k=2600,d=5,mu=.9,eps=.0003,v_eps=.08);
    MultiBodyLie.Collision.ContactPoint pt;
  algorithm
    result:=zeros(12);delta:=p-deck[1:3];
    if enabled>.5 and delta*delta<16 then
      A:=MultiBodyLie.Math.quaternionToT(quat);
      w:=transpose(A)*bodyRate;
      y:=deck[4];a:=deck[5];b:=-deck[6];
      B[1,:]:={cos(y)*cos(b),sin(y)*cos(b),-sin(b)};
      B[2,:]:={cos(y)*sin(b)*sin(a)-sin(y)*cos(a),sin(y)*sin(b)*sin(a)+cos(y)*cos(a),cos(b)*sin(a)};
      B[3,:]:=cross(B[1,:],B[2,:]);
      for foot in 1:4 loop
        r:=transpose(A)*{if foot<=2 then .17 else -.17,if mod(foot,2)==0 then .17 else -.17,-.085};
        for section in 1:(if surfaceKind<.5 then 3 else 1) loop
          pt:=MultiBodyLie.Collision.sphereBox(p,r,.015,deck[1:3],transpose(B)*(if surfaceKind<.5 then {centers[section],0,.66} elseif surfaceKind<1.5 then {-.425,0,.40} else {-.27,0,.154}),B,if surfaceKind<.5 then {lengths[section],widths[section],.12} elseif surfaceKind<1.5 then {.975,.97,.014} else {.37,.20,.0045});
          if pt.gap<.004 then
            (f,m,fb,mb):=MultiBodyLie.Collision.pairWrenches(pt,v,w,deck[7:9],deck[10:12],rubber);
            result:=result+cat(1,f,m,fb,mb);
          end if;
        end for;
      end for;
    end if;
  end landingContact;

  function predictNavigation
    input Real state[9] "Position, velocity, accelerometer bias, and six covariance terms";
    input Real acceleration, step;
    output Real predicted[9];
  protected
    Real halfStepSquared, accelerationVariance, biasVariance;
  algorithm
    halfStepSquared := .5*step^2;
    accelerationVariance := .25;
    biasVariance := state[9];
    predicted[1] := state[1]+step*state[2]+halfStepSquared*(acceleration-state[3]);
    predicted[2] := state[2]+step*(acceleration-state[3]);
    predicted[3] := state[3];
    predicted[4] := state[4]+2*step*state[5]-2*halfStepSquared*state[6]+step^2*state[7]
      -2*step*halfStepSquared*state[8]+halfStepSquared^2*(biasVariance+accelerationVariance);
    predicted[5] := state[5]+step*state[7]-halfStepSquared*state[8]
      -step*(state[6]+step*state[8]-halfStepSquared*biasVariance)+halfStepSquared*step*accelerationVariance;
    predicted[6] := state[6]+step*state[8]-halfStepSquared*biasVariance;
    predicted[7] := state[7]-2*step*state[8]+step^2*(biasVariance+accelerationVariance);
    predicted[8] := state[8]-step*biasVariance;
    predicted[9] := biasVariance+.0004*step;
  end predictNavigation;

  function updateNavigation
    input Real state[9] "Position, velocity, accelerometer bias, and six covariance terms";
    input Real observation, variance;
    input Boolean positionFix;
    output Real corrected[9];
  protected
    Real covariance[3], innovation, precision;
  algorithm
    covariance := if positionFix then state[4:6] else {state[5],state[7],state[8]};
    innovation := observation-(if positionFix then state[1] else state[2]);
    precision := 1/((if positionFix then covariance[1] else covariance[2])+variance);
    corrected[1:3] := state[1:3]+precision*innovation*covariance;
    corrected[4:9] := state[4:9]-precision*{covariance[1]^2,covariance[1]*covariance[2],
      covariance[1]*covariance[3],covariance[2]^2,covariance[2]*covariance[3],covariance[3]^2};
  end updateNavigation;

  function navigateAxis
    input Real state[9], acceleration, step, gpsPosition, gpsVelocity, positionVariance, velocityVariance;
    input Boolean fixAvailable;
    output Real estimate[9];
  algorithm
    estimate := predictNavigation(state,acceleration,step);
    if fixAvailable then
      estimate := updateNavigation(estimate,gpsPosition,positionVariance,true);
      estimate := updateNavigation(estimate,gpsVelocity,velocityVariance,false);
    end if;
  end navigateAxis;

  function airVelocityFromDrag
    input Real force[3], linearDrag[3], quadraticDrag[3];
    output Real velocity[3];
  protected
    Real lo,hi,speed;
  algorithm
    // F = -v * (linearDrag + quadraticDrag * ||v||) on each body axis.
    lo := 0;
    velocity := -force./linearDrag;
    hi := sqrt(velocity*velocity);
    for i in 1:14 loop
      speed := .5*(lo+hi);
      velocity := -force./(linearDrag+quadraticDrag*speed);
      if velocity*velocity > speed^2 then
        lo := speed;
      else
        hi := speed;
      end if;
    end for;
  end airVelocityFromDrag;

  function updateWind
    input Real state[3] "East and north wind velocity, common marginal variance";
    input Real observation[2];
    input Boolean valid;
    output Real estimate[3];
  protected
    Real variance, gain;
  algorithm
    variance := min(64,state[3]+(if valid then .045 else .2));
    gain := if valid then variance/(variance+.64) else 0;
    estimate := cat(1,state[1:2]+gain*(observation-state[1:2]),{(1-gain)*variance});
  end updateWind;

  function updateEstimator
    input Real previous[37];
    input Real instant, step, position[3], velocity[3], specificForce[3], rotation[3,3];
    input Real rotorForce, mass, linearDrag[3], quadraticDrag[3];
    input Boolean gpsAvailable, windAvailable;
    output Real next[37];
  protected
    Real acceleration[3], measuredPosition[3], measuredVelocity[3], aircraftAirspeed[3];
    Boolean gpsTick;
  algorithm
    // GNSS fixes every fifth 50 Hz prediction. Add bounded deterministic
    // measurement error so that identical inputs reproduce the same flight.
    gpsTick := previous[37]<.5;
    measuredPosition := if gpsTick and gpsAvailable then position+
      {.06*sin(48.7*instant),.06*sin(31.4*instant),.09*sin(41.7*instant)} else previous[28:30];
    measuredVelocity := if gpsTick and gpsAvailable then velocity+
      {.02*sin(37.5*instant),.02*sin(43.1*instant),.03*sin(24.1*instant)} else previous[31:33];
    acceleration := rotation*specificForce-{0,0,9.80665};
    next[1:9] := navigateAxis(previous[1:9],acceleration[1],step,measuredPosition[1],measuredVelocity[1],
      .002,.0002,gpsTick and gpsAvailable);
    next[10:18] := navigateAxis(previous[10:18],acceleration[2],step,measuredPosition[2],measuredVelocity[2],
      .002,.0002,gpsTick and gpsAvailable);
    next[19:27] := navigateAxis(previous[19:27],acceleration[3],step,measuredPosition[3],measuredVelocity[3],
      .005,.0005,gpsTick and gpsAvailable);
    next[28:30] := measuredPosition;
    next[31:33] := measuredVelocity;
    next[34:36] := previous[34:36];
    if gpsTick then
      aircraftAirspeed := rotation*airVelocityFromDrag(mass*specificForce-{0,0,rotorForce},linearDrag,quadraticDrag);
      next[34:36] := updateWind(previous[34:36],{next[2],next[11]}-aircraftAirspeed[1:2],windAvailable);
    end if;
    next[37] := if previous[37]>=4 then 0 else previous[37]+1;
  end updateEstimator;

  output Real dragBody[3]=aircraft.aerodynamicDrag;
  parameter Real origin[2]={-5,0} "Survey launch coordinates ENU";
  input Real pilot,forward,left,climb,turn,stationEast,stationNorth;
  input Real flightMode(start=0) "Manual modes: 0 position hold, 1 auto level, 2 acro";
  Boolean positionHold,acro;
  parameter Real maxBodyRate=4.2,maxYawRate=2.2 "Manual rate limits [rad/s]";
  final parameter Real maxThrust=4*aircraft.thrustCoefficient_N_s2*aircraft.omegaMax^2;
  final parameter Real hoverFraction=aircraft.vehicleMass_kg*9.80665/maxThrust;
  Real throttle(start=hoverFraction,fixed=true) "Manual collective fraction; R/F adjust and release retains";
  Real gyroQ[4](start={1,0,0,0},each fixed=true),rotation[3,3],bodyRate[3];
  output Real position[3],quaternion[4],rotorSpeed[4];
  output Real rotorAngle[4](each start=0,each fixed=true);
  final parameter Real launchPosition[3]={origin[1],origin[2],5};
  Real target[3](start=launchPosition,each fixed=true),yawTarget(start=0,fixed=true);
  Real attitude[3];
  input Real gpsDropout(start=0) "Suppress simulated GNSS fixes when greater than .5";
  Real gps[3],gpsVelocity[3];
  final parameter Real navigationStep=.02 "Inertial prediction interval [s]";
  final parameter Real navigationPrior[8]={0,0,.04,0,0,.01,0,.01};
  final parameter Real estimatorStart[37]=cat(1,{launchPosition[1]},navigationPrior,{launchPosition[2]},
    navigationPrior,{launchPosition[3]},navigationPrior,launchPosition,{0,0,0,0,0,64,0});
  discrete Real estimator[37](start=estimatorStart,each fixed=true);
  output Real estimatedPosition[3],estimatedVelocity[3];
  output Real positionCovariance[3],velocityCovariance[3] "Marginal variances in East, North, Up order";
  Real rotorForce;
  // Calibrated nominal RDD2 drag parameters for dry flight.
  parameter Real navigationLinearDrag[3]={.12,.12,.18};
  parameter Real navigationQuadraticDrag[3]=.5*1.225*{.06,.08,.12};
  output Real estimatedWindENU[2],windCovariance,windEstimateValid;
  parameter Real holdIntegralGain=.36 "Position-loop integral gain [1/s3]";
  parameter Real maxIntegralAcceleration=6 "Bound on sustained disturbance rejection [m/s2]";
  parameter Real tiltLimit=.72 "Maximum roll or pitch for station keeping [rad]";
  Real integralAcceleration[3](each start=0,each fixed=true);
  Real forwardAcceleration,leftAcceleration,upAcceleration;
  Real minimumTargetHeight;
  Real desired[3],acceleration[3],rollTarget,pitchTarget,collective,torque[3],motorThrust[4];

equation
  deckWrench=landingContact(deckEnabled,deckState,position,quaternion,aircraft.truth.velocityWorldEnu_m_s,aircraft.truth.angularVelocityBodyFlu_rad_s,0);
  sailWrench=landingContact(sailDeckEnabled,sailDeckState,position,quaternion,aircraft.truth.velocityWorldEnu_m_s,aircraft.truth.angularVelocityBodyFlu_rad_s,if isCatamaran>.5 then 1 else 2);
  position=aircraft.truth.positionWorldEnu_m+{origin[1],origin[2],0};
  quaternion=aircraft.truth.quaternionWorldBody;
  immersed=min(1,max(0,.5+(waterLevel-position[3])/bodyHeight));
  waterSlip=currentENU-aircraft.truth.velocityWorldEnu_m_s;
  waterLoad=immersed*1025*({0,0,9.80665*displacedVolume}+.5*waterDragArea*sqrt(waterSlip*waterSlip+1e-12)*waterSlip);
  rotorSpeed=aircraft.motorOmega_rad_s;
  (rotorWakeWind,rotorWakeWrench)=rotorWake(position,quaternion,rotorSpeed,windENU,rotorWakeTraffic,
    aircraft.rotorGeometry.positionBodyFlu_m,aircraft.thrustCoefficient_N_s2,aircraft.hoverRotorSpeed_rad_s,
    aircraft.omegaMax,propellerRadius,washThrustSensitivity);
  der(rotorAngle)={1,-1,1,-1}.*rotorSpeed;
  when sample(0,.02) then
    estimator=updateEstimator(pre(estimator),time,if time<navigationStep/2 then 0 else navigationStep,
      position,aircraft.truth.velocityWorldEnu_m_s,aircraft.imu.specificForceBodyFlu_m_s2,rotation,rotorForce,
      aircraft.vehicleMass_kg,navigationLinearDrag,navigationQuadraticDrag,gpsDropout<=.5,
      motorCut<=.5 and immersed<.01 and position[3]>bedHeight+.25 and bodyRate*bodyRate<4
      and deckWrench*deckWrench+sailWrench*sailWrench<.01 and rotorForce>.25*aircraft.vehicleMass_kg*9.80665);
  end when;
  gps=estimator[28:30];
  gpsVelocity=estimator[31:33];
  estimatedPosition={estimator[1],estimator[10],estimator[19]};
  estimatedVelocity={estimator[2],estimator[11],estimator[20]};
  positionCovariance={estimator[4],estimator[13],estimator[22]};
  velocityCovariance={estimator[7],estimator[16],estimator[25]};
  // Body-rate gyro integration starts from the calibrated level launch pose.
  bodyRate=aircraft.imu.angularVelocityBodyFlu_rad_s;
  der(gyroQ)=LieGroups.SO3.Quat.kinematics(gyroQ,bodyRate);
  rotation=LieGroups.SO3.Quat.to_DCM(gyroQ);
  rotorForce=aircraft.thrustCoefficient_N_s2*(rotorSpeed*rotorSpeed);
  estimatedWindENU=estimator[34:35];
  windCovariance=estimator[36];
  windEstimateValid=if windCovariance<1 then 1 else 0;
  attitude={atan2(rotation[3,2],rotation[3,3]),atan2(-rotation[3,1],sqrt(rotation[1,1]^2+rotation[2,1]^2)),atan2(rotation[2,1],rotation[1,1])};
  positionHold=pilot<=.5 or flightMode<.5;
  acro=pilot>.5 and flightMode>1.5;
  der(yawTarget)=if not positionHold then 12*atan2(sin(attitude[3]-yawTarget),cos(attitude[3]-yawTarget)) elseif pilot>.5 then turn else 0;
  der(throttle)=if positionHold then 8*(max(0,min(1,collective/maxThrust))-throttle)
    elseif (throttle>=1 and climb>0) or (throttle<=0 and climb<0) then 0 else .45*climb;
  desired=if pilot>.5 then {2*(forward*cos(yawTarget)-left*sin(yawTarget)),2*(forward*sin(yawTarget)+left*cos(yawTarget)),climb}
    else {max(-2,min(2,stationEast-target[1])),max(-2,min(2,stationNorth-target[2])),max(-1,min(1,5-target[3]))};
  der(target[1:2])=if positionHold then desired[1:2] else estimatedVelocity[1:2]+10*(estimatedPosition[1:2]-target[1:2]);
  minimumTargetHeight=if deckEnabled>.5 and (position[1]-deckState[1])^2+(position[2]-deckState[2])^2<16 then deckState[3]+.35 elseif sailDeckEnabled>.5 and (position[1]-sailDeckState[1])^2+(position[2]-sailDeckState[2])^2<9 then sailDeckState[3]-.15 else 1;
  der(target[3])=if not positionHold then estimatedVelocity[3]+10*(estimatedPosition[3]-target[3]) else max(desired[3],-4*max(0,target[3]-minimumTargetHeight));
  for i in 1:3 loop
    der(integralAcceleration[i])=if not positionHold or motorCut>.5 or immersed>.5 then -integralAcceleration[i]
      elseif (integralAcceleration[i]>=maxIntegralAcceleration and target[i]>estimatedPosition[i]) or
             (integralAcceleration[i]<=-maxIntegralAcceleration and target[i]<estimatedPosition[i]) then 0
      else holdIntegralGain*(target[i]-estimatedPosition[i]);
  end for;
  acceleration=1.4*(target-estimatedPosition)+2.4*(desired-estimatedVelocity)+integralAcceleration;
  forwardAcceleration=cos(attitude[3])*acceleration[1]+sin(attitude[3])*acceleration[2];
  leftAcceleration=-sin(attitude[3])*acceleration[1]+cos(attitude[3])*acceleration[2];
  upAcceleration=max(1,9.80665+acceleration[3]);
  pitchTarget=if not positionHold then tiltLimit*max(-1,min(1,forward)) else max(-tiltLimit,min(tiltLimit,atan2(forwardAcceleration,upAcceleration)));
  rollTarget=if not positionHold then -tiltLimit*max(-1,min(1,left)) else max(-tiltLimit,min(tiltLimit,atan2(-leftAcceleration,sqrt(forwardAcceleration^2+upAcceleration^2))));
  collective=if not positionHold then maxThrust*max(0,min(1,throttle)) else aircraft.vehicleMass_kg*(9.80665+acceleration[3])/max(.5,cos(attitude[1])*cos(attitude[2]));
  torque={if acro then -.23*maxBodyRate*max(-1,min(1,left)) else .86*atan2(sin(rollTarget-attitude[1]),cos(rollTarget-attitude[1])),
    if acro then .23*maxBodyRate*max(-1,min(1,forward)) else .86*(pitchTarget-attitude[2]),
    if positionHold then .42*atan2(sin(yawTarget-attitude[3]),cos(yawTarget-attitude[3])) else .18*maxYawRate*turn}
    -{.23*bodyRate[1],.23*bodyRate[2],.18*bodyRate[3]};
  for k in 1:4 loop
    // The RDD2 effectiveness matrix has orthogonal rows. Use its actual motor order.
    motorThrust[k]=collective/4+sum(aircraft.rotorEffectiveness[j+1,k]*torque[j]/
      (aircraft.rotorEffectiveness[j+1,:]*aircraft.rotorEffectiveness[j+1,:]) for j in 1:3);
    aircraft.commands.motor[k]=if motorCut>.5 or immersed>.5 then 0 else sqrt(max(0,min(aircraft.omegaMax^2,motorThrust[k]/aircraft.thrustCoefficient_N_s2)))/aircraft.omegaMax;
  end for;
end Rdd2Survey;
