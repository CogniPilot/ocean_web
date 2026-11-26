model ScubaDiver "Neutrally trimmed recreational diver swimming in a current"
  function submergedFraction "Volume below a level surface for an inclined ellipsoid"
    input Real centreDepth;
    input Real axialUp "Vertical component of the long axis";
    input Real axialRadius;
    input Real transverseRadius;
    output Real fraction;
  protected
    Real radius;
    Real h;
  algorithm
    radius := sqrt(transverseRadius^2+(axialRadius^2-transverseRadius^2)*axialUp^2);
    h := max(-1,min(1,centreDepth/radius));
    fraction := .5+.25*h*(3-h*h);
  end submergedFraction;

  function endStop "Passive unilateral spring and damper at the anatomical end of travel"
    input Real angle,rate,lower,upper,stiffness,damping;
    output Real moment;
  algorithm
    moment := if angle>upper then -stiffness*(angle-upper)-damping*max(0,rate)
      else if angle<lower then stiffness*(lower-angle)-damping*min(0,rate) else 0;
  end endStop;

  function pitchVector "Rotate a bind-pose segment about its flexion axis"
    input Real v[3];
    input Real angle;
    output Real w[3];
  algorithm
    w := {cos(angle)*v[1]+sin(angle)*v[3],v[2],-sin(angle)*v[1]+cos(angle)*v[3]};
  end pitchVector;

  function yawVector
    input Real v[3];
    input Real angle;
    output Real w[3];
  algorithm
    w := {cos(angle)*v[1]-sin(angle)*v[2],sin(angle)*v[1]+cos(angle)*v[2],v[3]};
  end yawVector;

  function selfLoads "Unilateral capsule reactions in torso coordinates"
    input Real q[10];
    input Real qd[10];
    input Real lateral[4];
    input Real lateralRate[4];
    input Real axial[4],axialRate[4];
    input Real stiffness;
    output Real result[22] "Ten flexion moments, four diagnostics (count, compression, peak force, energy), four lateral and four axial moments";
  protected
    // First four capsules represent the two sides of the BCD, mask and cylinder.
    // Each arm and leg is a kinematic chain originating at a measured bind pivot.
    // Omit the joint it shares with its neighbour. Intersecting joint sockets
    // and fitted kit touching the trunk carry no artificial penalty preload.
    // 1/2 BCD (port/stbd), 3 mask, 4 tank. 5/10 upper arms, 6/11 hands
    // and forearms, 7/12 thighs, 8/13 shins, 9/15 and 14/16 fin edges.
    // Opposite arms, hands/legs, folded fins vs gear, and crossed legs.
    constant Integer pairs[60,2]=[
      6,1;6,2;6,3;6,4;11,1;11,2;11,3;11,4;
      6,11;6,10;11,5;5,10;
      6,7;6,8;6,9;6,15;6,12;6,13;6,14;6,16;
      11,7;11,8;11,9;11,15;11,12;11,13;11,14;11,16;
      8,1;8,4;13,2;13,4;
      9,1;9,4;15,1;15,4;14,2;14,4;16,2;16,4;
      9,7;15,7;14,12;16,12;7,12;7,13;8,12;8,13;
      9,12;15,12;14,7;16,7;9,13;15,13;14,8;16,8;
      9,14;9,16;15,14;15,16];
    constant Real radius[16]={.105,.105,.117,.093,.061,.065,.084,.064,.056,.061,.065,.084,.064,.056,.056,.056};
    // The last two rows belong to the outer edges of left/right blades.
    constant Integer firstJoint[16]={11,11,11,11,4,4,1,1,1,9,9,6,6,6,1,6};
    constant Integer lastJoint[16]={0,0,0,0,4,5,1,2,3,9,10,6,7,8,3,8};
    constant Integer sweepJoint[16]={0,0,0,0,0,0,1,1,1,0,0,3,3,3,1,3};
    constant Integer cantJoint[16]={0,0,0,0,0,0,0,0,2,0,0,0,0,4,2,4};
    Real startP[16,3],endP[16,3],pivot[10,3],axis[10,3],knee[3],ankle[3],tip[3],elbow[3];
    Real latPivot[4,3],latAxis[4,3],width[3],blade[3,3],chord[3],latJac[4],axJac[4],axPivot[4,3],axAxis[4,3],thigh[3,3],shank[3,3],sole[3,3];
    Real u[3],v[3],r[3],delta[3],pa[3],pb[3],n[3],jac[10];
    Real aa,bb,cc,ee,ff,denom,s,t,d,dist,force,ds,side,shoulder;
    Integer j,b,iA,iB;
  algorithm
    result := zeros(22);axPivot:=zeros(4,3);axAxis:=zeros(4,3);
    latPivot := zeros(4,3); latAxis := zeros(4,3);
    pivot := zeros(10,3); axis := zeros(10,3); startP := zeros(16,3); endP := zeros(16,3);
    startP[1,:] := {-.2,.075,.015}; endP[1,:] := {.22,.075,.015};
    startP[2,:] := {-.2,-.075,.015}; endP[2,:] := {.22,-.075,.015};
    startP[3,:] := {.486,0,.076}; endP[3,:] := {.54,0,.040};
    startP[4,:] := {-.206,0,.24}; endP[4,:] := {.245,0,.24};
    for k in 1:2 loop
      j := 5*(k-1); b := 5*k; side := if k==1 then 1 else -1;
      pivot[j+1,:] := {DiverTree.hipSocket[1],side*DiverTree.hipSocket[2],DiverTree.hipSocket[3]};
      thigh:=MultiBodyLie.Math.axisRotation({0,0,-1},lateral[2*k-1])*MultiBodyLie.Math.axisRotation({0,1,0},q[j+1])
        *MultiBodyLie.Math.axisRotation({-1,0,0},axial[2*k-1]);
      shank:=thigh*MultiBodyLie.Math.axisRotation({0,1,0},q[j+2]);
      sole:=shank*MultiBodyLie.Math.axisRotation({0,1,0},q[j+3]-1.5707963267948966);
      knee:=pivot[j+1,:]-DiverTree.thighLength*thigh[:,1];ankle:=knee-DiverTree.shankLength*shank[:,1];
      blade:=DiverTree.bladeAxes(sole,side,lateral[2*k]);chord:=blade[:,1];tip:=ankle+.596*chord;
      pivot[j+2,:] := knee; pivot[j+3,:] := ankle;
      width:=.055*blade[:,2];
      latPivot[2*k-1,:] := pivot[j+1,:]; latPivot[2*k,:] := ankle;
      latAxis[2*k-1,:] := {0,0,-1}; latAxis[2*k,:] := -sole[:,1];
      axPivot[2*k-1,:]:=pivot[j+1,:];axAxis[2*k-1,:]:=-thigh[:,1];
      axis[j+1,:]:=yawVector({0,1,0},-lateral[2*k-1]);axis[j+2,:]:=thigh[:,2];axis[j+3,:]:=shank[:,2];
      startP[b+2,:] := pivot[j+1,:]+.18*(knee-pivot[j+1,:]); endP[b+2,:] := knee;
      startP[b+3,:] := knee; endP[b+3,:] := ankle;
      startP[b+4,:] := ankle; endP[b+4,:] := tip-width;
      startP[14+k,:] := ankle; endP[14+k,:] := tip+width;
      shoulder := -side*q[j+4];
      pivot[j+4,:] := {.2755,side*.212,.0654+.0044*side};
      axis[j+4,:] := {0,0,-side};
      elbow := pivot[j+4,:]+yawVector({-.2463,side*.040,-.0277},shoulder);
      pivot[j+5,:] := elbow; axis[j+5,:] := yawVector({0,-1,0},shoulder);
      axPivot[2*k,:]:=elbow;axAxis[2*k,:]:=yawVector(pitchVector({-side,0,0},side*q[j+5]),shoulder);
      startP[b,:] := pivot[j+4,:]+.2*(elbow-pivot[j+4,:]); endP[b,:] := elbow;
      startP[b+1,:] := elbow;
      endP[b+1,:] := elbow+yawVector(pitchVector({-.319,side*(-.014),-.112},-q[j+5]),shoulder);
    end for;
    for pair in 1:60 loop
      iA := pairs[pair,1]; iB := pairs[pair,2];
      d := radius[iA]+radius[iB];
      if max(startP[iA,1],endP[iA,1])+d>min(startP[iB,1],endP[iB,1]) and
         max(startP[iB,1],endP[iB,1])+d>min(startP[iA,1],endP[iA,1]) and
         max(startP[iA,2],endP[iA,2])+d>min(startP[iB,2],endP[iB,2]) and
         max(startP[iB,2],endP[iB,2])+d>min(startP[iA,2],endP[iA,2]) and
         max(startP[iA,3],endP[iA,3])+d>min(startP[iB,3],endP[iB,3]) and
         max(startP[iB,3],endP[iB,3])+d>min(startP[iA,3],endP[iA,3]) then
        u := endP[iA,:]-startP[iA,:]; v := endP[iB,:]-startP[iB,:]; r := startP[iA,:]-startP[iB,:];
        aa := u*u; bb := u*v; ee := v*v; cc := u*r; ff := v*r;
        denom := aa*ee-bb*bb;
        s := if denom>1e-12 then min(1,max(0,(bb*ff-cc*ee)/denom)) else 0;
        t := (bb*s+ff)/ee;
        if t<0 then
          t := 0; s := min(1,max(0,-cc/aa));
        elseif t>1 then
          t := 1; s := min(1,max(0,(bb-cc)/aa));
        end if;
        pa := startP[iA,:]+s*u; pb := startP[iB,:]+t*v; delta := pa-pb;
        dist := sqrt(delta*delta);
        if dist<d then
          n := if dist>1e-9 then delta/dist else {0,1,0};
          // Virtual work of +Fn on A and -Fn on B. Since pa-pb is parallel
          // to n, these two forces also sum to zero moment about every origin.
          jac := zeros(10);
          for h in 1:10 loop
            if h>=firstJoint[iA] and h<=lastJoint[iA] then
              jac[h] := n*cross(axis[h,:],pa-pivot[h,:]);
            end if;
            if h>=firstJoint[iB] and h<=lastJoint[iB] then
              jac[h] := jac[h]-n*cross(axis[h,:],pb-pivot[h,:]);
            end if;
          end for;
          latJac := zeros(4);
          for h in 1:4 loop
            if h==sweepJoint[iA] or h==cantJoint[iA] then
              latJac[h] := n*cross(latAxis[h,:],pa-latPivot[h,:]);
            end if;
            if h==sweepJoint[iB] or h==cantJoint[iB] then
              latJac[h] := latJac[h]-n*cross(latAxis[h,:],pb-latPivot[h,:]);
            end if;
          end for;
          axJac:=zeros(4);
          for k in 1:2 loop
            if sweepJoint[iA]==2*k-1 then axJac[2*k-1]:=n*cross(axAxis[2*k-1,:],pa-axPivot[2*k-1,:]);end if;
            if sweepJoint[iB]==2*k-1 then axJac[2*k-1]:=axJac[2*k-1]-n*cross(axAxis[2*k-1,:],pb-axPivot[2*k-1,:]);end if;
            if iA==5*k+1 then axJac[2*k]:=n*cross(axAxis[2*k,:],pa-axPivot[2*k,:]);end if;
            if iB==5*k+1 then axJac[2*k]:=axJac[2*k]-n*cross(axAxis[2*k,:],pb-axPivot[2*k,:]);end if;
          end for;
          ds := jac*qd+latJac*lateralRate+axJac*axialRate;
          force := max(0,stiffness*(d-dist)-.007*stiffness*ds);
          for h in 1:10 loop
            result[h] := result[h]+force*jac[h];
          end for;
          for h in 1:4 loop
            result[14+h] := result[14+h]+force*latJac[h];result[18+h]:=result[18+h]+force*axJac[h];
          end for;
          result[11] := result[11]+1;
          result[12] := max(result[12],d-dist);
          result[13] := max(result[13],force);
          result[14] := result[14]+.5*stiffness*(d-dist)^2;
        end if;
      end if;
    end for;
  end selfLoads;

  parameter Real selfContactStiffness=18000 "Compliant body and gear contact stiffness (N/m)";
  output Real selfContactTorque[10] "Internal contact moments (N m)";
  output Real selfContactLateralTorque[4] "Internal reaction at hip sweep and blade cant joints (N m)";
  output Real selfContactStatus[4] "Overlapping pairs, maximum compression (m), peak normal load (N), elastic energy (J)";
  parameter Real initialState[16]={-18.6,16.4,-9.4,0,0,0,0,0,0,0,0,0,0,.25,0,0};
  constant Real surfaceBar=1.01325;
  parameter Real cylinderLitres=12;
  // Fresh tissues equilibrated with sea-level air, 0.79*(1.01325-0.0627) bar.
  // Keep this a literal FMI parameter so the room host can restore an ongoing dive.
  parameter Real initialDive[20]={200,
    .7509345,.7509345,.7509345,.7509345,.7509345,.7509345,.7509345,.7509345,
    .7509345,.7509345,.7509345,.7509345,.7509345,.7509345,.7509345,.7509345,0,0,0}
    "Cylinder pressure above surface pressure, 16 tissue tensions in bar, filtered ascent m/min, exposure in GF-excess seconds, submerged seconds";
  parameter Real initialPosture=0 "Grounded gait transition on restart";
  output Real upright "Grounded gait mount blend; zero in open water";
  Real stanceProgress(start=initialPosture,fixed=true);
  parameter Real initialPitchCommand=10 "Retained manual pitch trim, radians. Default sentinel initializes from body pitch";
  parameter Real pitchLimit=1.483529864 "85 degree trim limit in radians";
  output Real pitchCommand(start=if abs(initialPitchCommand)<=pitchLimit then initialPitchCommand else max(-pitchLimit,min(pitchLimit,initialState[8])),fixed=true) "Manual pitch trim, nose-up positive (radians)";
  input Real priorLog[5]={0,60,0,0,0} "Retained log at the preceding 1 Hz dive-computer sample";
  output Real diveLog[5]
    "Maximum dive depth, surface interval seconds, safety-stop credit seconds, safety-stop requested, submerged time at start";
  output Real computer[3] "Pressure depth metres, remaining no-stop minutes at this depth (99 display cap), minutes to 50 bar at this effort";
  input Real patrolOrigin[5]={-18.6,16.4,-9.4,0,0}
    "Autonomous patrol start east, north, height, heading and simulation time";
  input Real pilot[5]=zeros(5) "Occupied, turn, pitch, fin effort, bank";
  input Real currentVelocity[3]=zeros(3),waterLevel=0,bedHeight=-13.7,sprint=0;
  input Real bedSlope[2]=zeros(2) "East and north gradients of supporting sand";
  input Real avoidance[3]=zeros(3) "Velocity correction from nearby swimmers and craft";
  input Real contact[4]=zeros(4) "Wreck/ground contact normal ENU and predicted intrusion, metres";
  input Real contactLink=1 "Link carrying an external mesh hit, 1..15";
  input Real meshCollision=0 "Posed triangle collision active";
  input Real meshSelfContact[9]=zeros(9) "Two link IDs, B-to-A normal ENU, depth m, root-relative point ENU";
  input Real contactMomentArm[3]=zeros(3) "ENU vector from body origin to applied obstacle force (m)";
  input Real contactRelativeVelocity[3]=zeros(3) "Contact point articulation/rotation velocity minus moving obstacle velocity (ENU, m/s); excludes diver translation";
  input Real contactWitness[9]=zeros(9) "Enabled, link-local point (m), initial obstacle plane offset (m), obstacle velocity ENU (m/s), sample clock (s)";
  output Real state[16](start=initialState,each fixed=true)
    "ENU position and velocity, heading, pitch, roll and angular rates, kick phase, effort, time and breath phase";
  output Real activity[6] "Kick frequency, breathing phase, idle, immersed, grounded gait blend, pitch trim radians";
  output Real dive[20](start=initialDive,each fixed=true);
  output Real gauge[4] "Usable gauge bar, ambient pressure bar, GF85 ceiling metres, leading tissue gradient fraction";
  parameter Real initialJoints[20]={-.06,.80,.674,.03,.13,-.06,.80,.674,.03,-.13,0,0,0,0,0,0,0,0,0,0} "Left then right hip, knee, ankle, shoulder, elbow angles and their rates";
  input Real glideAssist=0 "Direct policy requests relaxed knee/feathering reflex from 0 to 1";
  input Real policyMode=0 "1 selects direct normalized joint position actions";
  input Real jointAction[10]=zeros(10) "Direct joint target as a fraction of range";
  input Real bladderAction=0 "Legacy policy demand for 0..3 L above neutral";
  input Real lateralPilot=0 "Signed body-side command";
  input Real verticalPilot=0 "Vertical speed request in units of 0.10 m/s, positive up";
  input Real torchEquipped=0 "Right hand reaches for the BCD-mounted lamp when commanded";
  parameter Real initialTorch=0;
  output Real torchDeployment(start=initialTorch,fixed=true) "Stow/equip travel, 0..1";
  input Real neutralTrim=0 "When enabled, trim the submerged jacket to the kit's neutral displacement";
  input Real vestValve=0 "Held power inflator (+1) or dump valve (-1); release closes both";
  parameter Real vestCapacity=15 "Maximum displaced litres";
  parameter Real neutralVestLitres=3 "Kit weighting: displacement needed at neutral trim, L";
  parameter Real initialWaterLevel=0 "Water surface ENU at spawn, m";
  parameter Real initialVestGas=-1 "Stored gas in bar L; default initializes neutrally at spawn depth";
  output Real vestGas(start=if initialVestGas>=0 then initialVestGas else neutralVestLitres*
    (surfaceBar+barPerMetre*max(0,initialWaterLevel-initialState[3])),fixed=true) "Pressure-volume inventory, bar L";
  output Real vestLitres "Displaced volume at local ambient pressure, L";
  input Real soleAction[2]=zeros(2) "Policy lateral/longitudinal sole-pressure shifts (normalized)";
  output Real jointAngles[10](start=initialJoints[1:10],each fixed=true);
  output Real jointRates[10](start=initialJoints[11:20],each fixed=true);
  output Real jointTorque[10] "Actuator effort, N m";
  output Real mechanicalPower "Sum of positive muscle power at joints, W";
  output Real footPosition[2,3] "Foot contact sphere center ENU position, m";
  output Real footContact[2] "Ground reaction normal load, newtons, left and right";
  output Real limbForces[4,3] "ENU force on left fin, right fin, left hand and right hand, newtons";
  parameter Real initialLateral[8]=zeros(8) "Hip sweep and ankle cant L/R, then rates";
  parameter Real initialAxial[8]=zeros(8) "L hip / forearm, R hip / forearm twist and rates";
  input Real axialAction[4]=zeros(4) "Normalized targets for independent hip rotation and forearm pronation";
  output Real axialAngles[4](start=initialAxial[1:4],each fixed=true);
  output Real axialRates[4](start=initialAxial[5:8],each fixed=true);
  output Real axialTorque[4] "Axial joint actuator effort, N m";
  input Real lateralAction[4]=zeros(4) "Policy hip ab/adduction and ankle inversion/eversion, signed L then R";
  output Real lateralAngles[4](start=initialLateral[1:4],each fixed=true);
  output Real lateralRates[4](start=initialLateral[5:8],each fixed=true);
  output Real lateralTorque[4] "Actuator torques at the hip sweep and ankle cant axes, N m";
  output Real finFluidPower "Fluid work rate on both blades relative to the water, W";
  output Real finMoment[3] "Body-frame moment of both blade loads about the diver origin, N m";
  output Real linkFluidWrench[15,6] "Per-link passive water force and moment about link origin in ENU, N and N m";
  output Real siteLoads[14,13] "Site and buoyancy-centre local positions (m), upward buoyancy (N), ENU drag (N) and drag moment about site centre (N m)";
  output Real linkWeights[15,4] "Anatomical link-local centre of mass (m) and signed ENU weight along z (N)";
  output Real fluidDragPower[15] "Dissipation rate per link in passive fluid loads, W";
  output Real bodyWrench[6] "Net ENU force (N) and body-frame moment (N m)";
protected
  discrete Real selfResult[22](each start=0,each fixed=true);
  // Nitrogen-only Buhlmann coefficients, compartment 1b (5 min).
  // Numerical table: Subsurface core/deco.cpp. Ambient and tissue pressures are absolute bar.
  constant Real halfMin[16]={5,8,12.5,18.5,27,38.3,54.3,77,109,146,187,239,305,390,498,635};
  constant Real aN2[16]={1.1696,1,.8618,.7562,.62,.5043,.441,.4,.375,.35,.3295,.3065,.2835,.261,.248,.2327};
  constant Real bN2[16]={.5578,.6514,.7222,.7825,.8126,.8434,.8693,.891,.9092,.9222,.9319,.9403,.9477,.9544,.9602,.9653};
  constant Real barPerMetre=1025*9.80665/100000,gradientLimit=.85;
  discrete Real tree[392](each start=0,each fixed=true);
  Real treeQ[14],treeSpeed[14],treeShaft[14],treeRig[3,3],rootForce[3],rootMoment[3];
  Real torchGrip,torchRaise,unoccupiedTarget[10],neutralDemand;
  Real vestFill,vestDump,vestLift,inflateCommand,vestWet,selectedValve,volumeError;
  Real waterlineDepth,axialUp,dorsalUp;
  Real glideWeight,glideFlow[2,3],glideBlend[2],glideAnkle[2],glideJoint[10];
  constant Real relaxedHip=-.06,relaxedKnee=.80;
  Real depth,ambient,inspired,ventilation,available,gradient[16],ceilingBar[16];
  // Fin-force and strength coefficients are reduced-order game estimates. Empirical
  // benchmarks include Pendergast et al., Undersea Hyperb Med 30 (2003), PMID 12841609,
  // and Nakashima et al., doi:10.3390/proceedings2060288.
  Real noStop[16],surfaceLimit[16],bankRate;
  Boolean submerged,breathing;

  constant Real mass=88;
  // Preserve the action scale of saved controllers. Positive hip travel raises
  // the thigh behind the torso; adult hip extension is much smaller than flexion.
  constant Real actionPositive[5]={1.6,2.0,1.02,1.25,1.2},actionNegative[5]={-1.6,-.27,-.23,-1.15,-1.2};
  constant Real limit[5]={.32,2.0,1.02,1.25,1.2};
  constant Real jointInertia[5]={1.6,.7,.22,.5,.16},torqueLimit[5]={190,185,95,75,40};
  constant Real lowerLimit[5]={-1.6,-.05,-.23,-1.15,-1.2};
  Real pitchStick,pitchBias(start=0,fixed=true),yawGoalRate,pitchGoalRate,stopMoment[10],idleScull;
  Real target[10],loadTorque[10],hipWalk[2],kneeWalk[2],walkForward[2],walkReach[2],walkAmp[2],legLoad[2,3];
  Real routePhase,routeLocal[2],routeTangent[2],routeError[2],autoValve,course[2],turn,pitch,bank,effort,cruiseZ,climb,kickHz,standing;
  Real correctionGain,steer,bow,twist,drive,phase[2],builtIn[10],relative[3],omega[3],basis[3,3];
  Real helicopter,turnStrength,flutterMix,flutterPhase[2],backScoop[2],turnPhase[2],tuck[2],openHip[2],loadBlade[2],sweepTarget[2],cantTarget[2],sweepTorque[2],cantDrag[2];
  Real thighFrame[2,3,3],kneeFrame[2,3,3],soleFrame[2,3,3],sweepFrame[2,3,3],hipFrame[2,3,3];
  Real thighArm[2,3],shinArm[2,3],hipOmega[2,3],kneeOmega[2,3],soleOmega[2,3],axialShaft[4],axialTarget[4];
  Real soleMoment[2,3],kneeMoment[2,3],hipMoment[2,3],hipLoad[2],pronationRate[2],pronationDrag[2],forearmAxis[2,3],palmY[2],palmZ[2];
  Real bladeFrame[2,3,3],chord[2,3],cantAxis[2,3];
  Real cant[2],cantSpeed[2],hipToFoot[2,3];
  Real positionBody[4,3],jointVelocity[4,3],waterFlow[4,3];
  Real armSpan[2],handSide[2],shoulderAngle[2],handNormal[2,3],handSlip[2,3];
  Real shoulderJac[2,3],elbowJac[2,3];
  Real stroke[2],paddle[2],finSpeed[2],handSpeed[2],handAxis[2];
  // One element per fin. Wetted blade area (m²), pressure-center arm (m),
  // and flat-plate normal and in-plane drag coefficients are assumed.
  constant Real bladeArea=.060,bladeArm=.27,normalCd=1.15,skinCd=.012,rho=1025;
  Real rigFlow[4,3],rigForce[4,3],rigPosition[4,3],rigMotion[4,3],rigOmega[3];
  Real bladeWet[2],palmWet[2],surfaceNormalInRig[3],bladeNormal[2,3],bladeSlip[2,3];
  Real localForce[4,3],groundForce[2,3],footVelocity[2,3],normal[3],normalV[2],penetration[2];
  Real footLever[2,3],footLocal[2,3],footMotion[2,3],slip[2,3],contactForce,gravity;
  Real relativeWorld[3],wet;
  Real yDot,pDot,rDot,headingRate,mouthHeight,supportMoment[3],totalNormal,torsoReaction,headingGoal(start=initialState[7],fixed=true),strokeDrive[2],balance[3],filteredRate[3](each start=0,each fixed=true);
equation
  // Resolve internal contacts at 200 Hz; reuse their moments between contact samples.
  when sample(0,.005) then
    selfResult=if meshCollision>.5 then zeros(22) else selfLoads(jointAngles,jointRates,lateralAngles,lateralRates,axialAngles,axialRates,selfContactStiffness);
  end when;
  // All joints and the six floating coordinates share one CRBA/RNEA solve.
  // Hold acceleration across the 5 ms contact/control sample; positions and
  // speeds remain continuous integrator states between these sample events.
  when sample(0,.005) then
    tree=DiverTree.forwardDynamics(state[1:3],basis,treeRig,state[4:6],omega,treeQ,treeSpeed,treeShaft,axialAngles,axialRates,axialShaft,
      rootMoment,rootForce,currentVelocity,waterLevel,.001*vestLitres,.001*neutralVestLitres,standing,
      contact,contactMomentArm,contactRelativeVelocity,contactLink,meshSelfContact,contactWitness,state[15]);
  end when;
  // Swimming uses the free torso pose. Only the ground gait has a prescribed mount.
  treeRig=MultiBodyLie.Math.axisRotation({0,-1,0},1.5707963267948966*upright);
  bodyWrench=tree[35:40];
  for link in 1:15 loop
    linkWeights[link,:]=tree[324+4*link:327+4*link];
    linkFluidWrench[link,:]=tree[6*link+35:6*link+40];
  end for;
  for site in 1:14 loop
    siteLoads[site,:]=tree[133+13*site:145+13*site];
  end for;
  fluidDragPower=tree[131:145];
  selfContactLateralTorque=selfResult[15:18];
  selfContactTorque=selfResult[1:10];
  selfContactStatus=selfResult[11:14];
  // A local four-metre-radius patrol begins along the swimmer's current heading.
  // Rotate both the waypoint and its tangent around the selected dive site.
  routePhase=.12*(state[15]-patrolOrigin[5]);
  routeLocal={4*sin(routePhase),4*(1-cos(routePhase))};
  routeTangent=.48*{cos(patrolOrigin[4]+routePhase),sin(patrolOrigin[4]+routePhase)};
  routeError=patrolOrigin[1:2]-state[1:2]+
    {cos(patrolOrigin[4])*routeLocal[1]-sin(patrolOrigin[4])*routeLocal[2],
     sin(patrolOrigin[4])*routeLocal[1]+cos(patrolOrigin[4])*routeLocal[2]};
  course=routeTangent+.65*routeError/max(1,sqrt(sum(routeError[i]^2 for i in 1:2))/1.5)
    -currentVelocity[1:2]+avoidance[1:2];
  turn=if pilot[1]>.5 then pilot[2] else max(-1,min(1,2*atan2(sin(atan2(course[2],course[1]+1e-8)-state[7]),cos(atan2(course[2],course[1]+1e-8)-state[7]))));
  cruiseZ=max(bedHeight+1.25,min(waterLevel-.85,patrolOrigin[3]));
  climb=if pilot[1]>.5 then 0 else max(-.40,min(.40,.56*(cruiseZ-state[3])+avoidance[3]));
  standing=max(0,min(1,(1.50-(waterLevel-bedHeight))/.85))*max(0,min(1,(1.40-(state[3]-bedHeight))/.30));
  der(stanceProgress)=(standing-stanceProgress)/.7;
  upright=standing*stanceProgress;
  glideWeight=(1-standing)*(if policyMode>.5 then min(1,max(0,glideAssist)) else if pilot[1]>.5 then
    max(0,1-8*max(abs(pilot[2]),max(abs(pilot[3]),max(abs(pilot[4]),abs(pilot[5]))))) else 0);
  // While pitching the pilot directly biases the fins. Track the reached
  // attitude so releasing the stick can hold it without seeking a preset angle.
  pitchStick=max(-1,min(1,pilot[3]));
  der(pitchCommand)=if policyMode>.5 or pilot[1]<.5 or standing>.5 or abs(pitchStick)>.025 then
    20*(max(-pitchLimit,min(pitchLimit,state[8]))-pitchCommand) else 0;
  pitch=(1-standing)*(if pilot[1]>.5 then max(-pitchLimit,min(pitchLimit,pitchCommand)) else atan2(climb,.58));
  bank=-.16*turn;
  bankRate=if pilot[1]>.5 then .85*pilot[5] else 0;
  effort=if policyMode>.5 then min(1,mechanicalPower/260) else if pilot[1]>.5 then max(0,min(1,pilot[4]))*(if sprint>.5 then 1 else .75)
         else min(.8,sqrt(course[1]^2+course[2]^2));
  der(filteredRate)=(state[10:12]-filteredRate)/.45;
  // Resolve desired yaw and pitch rates into the rolled body axes before choosing strokes.
  // During an intentional turn, follow the diver's heading so command lag cannot wind up.
  der(headingGoal)=if abs(turn)>.05 or pilot[1]<.5 then headingRate+2*(state[7]-headingGoal) else 0;
  yawGoalRate=(.80-.25*standing)*turn+(if abs(turn)>.05 or pilot[1]<.5 then 0
     else atan2(sin(headingGoal-state[7]),cos(headingGoal-state[7])));
  // Remove persistent trim error only during small-error, steady trim holds.
  der(pitchBias)=if policyMode>.5 or standing>.5 or abs(pitchStick)>.025 or abs(bankRate)>.05 then -5*pitchBias else
    max(-3*(.32+pitchBias),min(3*(.32-pitchBias),.6*(pitch-state[8])*max(0,1-((pitch-state[8])/.65)^2)));
  pitchGoalRate=1.6*(pitch-state[8])+pitchBias;
  // A coasting diver feathers the blades. Avoid chasing each recoil from the
  // last kick with another full-power kick. Larger trim errors still engage.
  correctionGain=if pilot[1]<.5 then 1 else .12+.88*min(1,3*max(abs(pitch-state[8]),
    max(max(0,pilot[4]),max(abs(turn),max(abs(pitchStick),abs(pilot[5]))))));
  steer=correctionGain*max(-1,min(1,1.6*(cos(state[9])*cos(state[8])*yawGoalRate+sin(state[9])*pitchGoalRate-filteredRate[1])));
  bow=if pilot[1]>.5 and abs(pitchStick)>.025 then
    max(-1,min(1,.72*pitchStick*max(0,min(1,4*(pitchLimit-sign(pitchStick)*state[8])))-1.25*filteredRate[2]))
    else correctionGain*max(-1,min(1,1.65*(cos(state[9])*pitchGoalRate-sin(state[9])*cos(state[8])*yawGoalRate-filteredRate[2])));
  twist=correctionGain*max(-1,min(1,2.2*(bankRate+sin(state[8])*yawGoalRate-filteredRate[3])+
    (if pilot[1]>.5 and standing<.5 then 0 else atan2(sin(bank-state[9]),cos(bank-state[9])))));
  drive=min(1,max(state[14],max(abs(steer),max(abs(bow),abs(twist)))));
  kickHz=(1-standing)*((1-helicopter)*(.45+.82*drive)+helicopter*(.50+.22*drive))+standing*(.62+.25*abs(state[14]));
  der(state[13])=6.28318530718*kickHz;
  der(state[14])=(effort-state[14])/.45;
  der(state[15])=1;
  // Rz(heading) Ry(-pitch) Rx(roll), columns are forward, port, dorsal in ENU.
  basis=[cos(state[7])*cos(state[8]),-sin(state[7])*cos(state[9])-cos(state[7])*sin(state[8])*sin(state[9]),sin(state[7])*sin(state[9])-cos(state[7])*sin(state[8])*cos(state[9]);
         sin(state[7])*cos(state[8]),cos(state[7])*cos(state[9])-sin(state[7])*sin(state[8])*sin(state[9]),-cos(state[7])*sin(state[9])-sin(state[7])*sin(state[8])*cos(state[9]);
         sin(state[8]),cos(state[8])*sin(state[9]),cos(state[8])*cos(state[9])];
  omega={state[12],-state[11],state[10]};
  relativeWorld=state[4:6]-currentVelocity;
  relative=transpose(basis)*relativeWorld;
  // The local water plane uses the same rigid-body attitude as all immersed links.
  waterlineDepth=waterLevel-state[3];
  surfaceNormalInRig=transpose(treeRig)*basis[3,:];
  axialUp=surfaceNormalInRig[1];dorsalUp=surfaceNormalInRig[3];
  // Fixed displacement of head, torso with equipment, and lower body.
  wet=.08*submergedFraction(waterlineDepth-.55*axialUp,axialUp,.14,.11)
     +.56*submergedFraction(waterlineDepth-.09*axialUp,axialUp,.37,.17)
     +.36*submergedFraction(waterlineDepth+.54*axialUp,axialUp,.51,.12);
  // Jacket bladder wraps the upper torso, aft of the centre of mass.
  vestWet=submergedFraction(waterlineDepth-.055*axialUp-.13*dorsalUp,axialUp,.275,.125);
  normal={-bedSlope[1],-bedSlope[2],1}/sqrt(1+bedSlope[1]^2+bedSlope[2]^2);
  // Both legs turn together. Yaw feedback controls stroke size while the
  // sign of the command selects which leg performs the forward frog kick.
  helicopter=(1-standing)*min(1,abs(turn)/.06);
  turnStrength=helicopter*min(1,.55*abs(turn)+.65*max(0,sign(turn)*steer));
  // Reserve joint travel for both gaits when swimming, pitching or rolling in a turn.
  flutterMix=1-helicopter+helicopter*.72*max(state[14],max(abs(pitchStick),abs(pilot[5])));
  idleScull=(1-standing)*max(0,1-4*max(state[14],max(abs(turn),max(abs(pilot[3]),abs(bankRate)))));
  for k in 1:2 loop
    phase[k]=state[13]+(k-1)*3.14159265359;
    // The high-level gait only commands joint angles. A policy bypasses it entirely.
    strokeDrive[k]=max(0,min(1,state[14]+(1-helicopter)*.9*(if k==1 then -steer else steer)+.58*abs(bow)+.85*abs(twist)));
    // The outside fin follows the return path in reverse: extend feathered,
    // turn the blade, then draw the heel toward the body against the water.
    turnPhase[k]=if (k==1 and turn>=0) or (k==2 and turn<0) then state[13]
      else 2.05*3.14159265359-state[13];
    tuck[k]=max(0,cos(turnPhase[k]-.52*3.14159265359))^2;
    openHip[k]=max(0,cos(turnPhase[k]-.94*3.14159265359))^2;
    loadBlade[k]=max(0,cos(turnPhase[k]-.82*3.14159265359))^2;
    backScoop[k]=if (k==2 and turn>0) or (k==1 and turn<0) then
      max(0,cos(turnPhase[k]-.75*3.14159265359))^2 else 0;
    sweepTarget[k]=max(if k==1 then -.25 else -.75,min(if k==1 then .75 else .25,if policyMode>.5 then .75*max(-1,min(1,lateralAction[2*k-1])) else
      (if k==1 then 1 else -1)*turnStrength*(.04+.22*openHip[k])
        +standing*max(-.30,min(.30,.40*(-sin(state[7])*state[4]+cos(state[7])*state[5])))));
    cantTarget[k]=if policyMode>.5 then .55*max(-1,min(1,lateralAction[2*k])) else
      max(-.55,min(.55,(if k==1 then 1 else -1)*turnStrength*(.025-.80*loadBlade[k])));
    der(lateralAngles[2*k-1])=lateralRates[2*k-1];
    der(lateralAngles[2*k])=lateralRates[2*k];
    lateralTorque[2*k-1]=max(-75,min(75,200*(sweepTarget[k]-lateralAngles[2*k-1])-31*lateralRates[2*k-1]-standing*sweepTorque[k]));
    lateralTorque[2*k]=max(-22,min(22,43*(cantTarget[k]-lateralAngles[2*k])-5*lateralRates[2*k]));
    treeQ[7*k-6:7*k]={lateralAngles[2*k-1],jointAngles[5*k-4],jointAngles[5*k-3],jointAngles[5*k-2],lateralAngles[2*k],jointAngles[5*k-1],jointAngles[5*k]};
    treeSpeed[7*k-6:7*k]={lateralRates[2*k-1],jointRates[5*k-4],jointRates[5*k-3],jointRates[5*k-2],lateralRates[2*k],jointRates[5*k-1],jointRates[5*k]};
    treeShaft[7*k-6]=lateralTorque[2*k-1]+sweepTorque[k]+selfContactLateralTorque[2*k-1]
      +endStop(lateralAngles[2*k-1],lateralRates[2*k-1],if k==1 then -.25 else -.75,if k==1 then .75 else .25,1400,36);
    treeShaft[7*k-2]=lateralTorque[2*k]+cantAxis[k,:]*soleMoment[k,:]+selfContactLateralTorque[2*k]
      +endStop(lateralAngles[2*k],lateralRates[2*k],-.55,.55,160,6);
    der(lateralRates[2*k-1])=tree[7*k];
    der(lateralRates[2*k])=tree[7*k+4];
    walkAmp[k]=max(-1,min(1,state[14]+.52*(if k==1 then -1 else 1)*steer));
    walkForward[k]=.24*walkAmp[k]*cos(phase[k])-.55*sin(state[8]);
    walkReach[k]=.83-.46*sqrt(abs(walkAmp[k]))*max(0,-sin(phase[k]))^2;
    kneeWalk[k]=2*acos(min(1,sqrt(walkForward[k]^2+walkReach[k]^2)/.86));
    hipWalk[k]=-atan2(walkForward[k],walkReach[k])-.5*kneeWalk[k];
    // Vary angular speed within the cycle, so the loaded half-stroke and
    // feathered return sweep at different speeds under a pitch command.
    flutterPhase[k]=phase[k]+.32*bow*sin(phase[k]);
    // Feather against the direction of blade travel during the flutter kick.
    // Opposing ankle biases produce bank; common bias controls pitch.
    builtIn[5*k-4]=(1-standing)*flutterMix*strokeDrive[k]*(-.10+.34*sin(flutterPhase[k]))-turnStrength*(.40*tuck[k]+.80*backScoop[k])+standing*hipWalk[k];
    builtIn[5*k-3]=(1-standing)*flutterMix*strokeDrive[k]*(1.15+.38*sin(flutterPhase[k])+.28*bow-handSide[k]*.22*twist)
       +turnStrength*(.10+1.85*tuck[k])+standing*kneeWalk[k];
    builtIn[5*k-2]=(1-standing)*(.69+flutterMix*strokeDrive[k]*(-.34+.75*bow-handSide[k]*.78*twist)*cos(flutterPhase[k])
       -.44*turnStrength*(.08+1.03*tuck[k]-.20*loadBlade[k]+2.55*backScoop[k]+(if (k==2 and turn>0) or (k==1 and turn<0) then .72 else 0)))+standing*(-.13-hipWalk[k]-kneeWalk[k]);
    builtIn[5*k-1]=idleScull*(.10+.08*sin(1.8*state[15]));
    builtIn[5*k]=idleScull*(.16+.12*cos(1.8*state[15]));
    // Resolve the incident flow at the ankle into the moving shank frame.
    // A blade can feather in either direction. Use the double angle so the
    // reference is continuous through fore/aft flow reversal and blend into
    // a relaxed ankle at very low water-relative speed.
    glideFlow[k,:]=transpose(kneeFrame[k,:,:])*(transpose(treeRig)*relative+cross(rigOmega,footLocal[k,:])+footMotion[k,:]);
    glideBlend[k]=(glideFlow[k,1]^2+glideFlow[k,3]^2)/(.0144+glideFlow[k,1]^2+glideFlow[k,3]^2);
    glideAnkle[k]=max(lowerLimit[3],min(limit[3],1.5707963267948966-atan2(.09365,.591)
      -(1-glideBlend[k])*(relaxedHip+relaxedKnee)
      -.5*glideBlend[k]*atan2(2*glideFlow[k,1]*glideFlow[k,3],glideFlow[k,1]^2-glideFlow[k,3]^2+.0001)));
    glideJoint[5*k-4:5*k]={relaxedHip,relaxedKnee,glideAnkle[k],.03,.13*handSide[k]};
    for j in 1:5 loop
      der(jointAngles[5*k-5+j])=jointRates[5*k-5+j];
      unoccupiedTarget[5*k-5+j]=glideWeight*glideJoint[5*k-5+j]+(1-glideWeight)*max(lowerLimit[j],min(limit[j],if policyMode>.5 then
        max(0,min(1,jointAction[5*k-5+j]))*actionPositive[j]-min(0,max(-1,jointAction[5*k-5+j]))*actionNegative[j]
        else builtIn[5*k-5+j]));
      target[5*k-5+j]=if k==2 and j>=4 then
        (1-torchGrip)*unoccupiedTarget[5*k-5+j]+torchGrip*(if j==4 then .12+.26*torchRaise else -.24-.81*torchRaise)
        else unoccupiedTarget[5*k-5+j];
      // A torque-limited tracking servo compensates resolved external load until saturation.
      jointTorque[5*k-5+j]=max(-torqueLimit[j],min(torqueLimit[j],jointInertia[j]*
        ((145+95*standing)*(target[5*k-5+j]-jointAngles[5*k-5+j])-(22+7*standing)*jointRates[5*k-5+j])-loadTorque[5*k-5+j]));
      stopMoment[5*k-5+j]=endStop(jointAngles[5*k-5+j],jointRates[5*k-5+j],lowerLimit[j],limit[j],1400,36);
      treeShaft[7*k-6+j+(if j>3 then 1 else 0)]=jointTorque[5*k-5+j]+loadTorque[5*k-5+j]+stopMoment[5*k-5+j]+selfContactTorque[5*k-5+j];
      der(jointRates[5*k-5+j])=tree[7*k+j+(if j>3 then 1 else 0)];
    end for;
    // Kinematics of the same nested hinges used by the inertial tree.
    sweepFrame[k,:,:]=MultiBodyLie.Math.axisRotation({0,0,-1},lateralAngles[2*k-1]);
    hipFrame[k,:,:]=sweepFrame[k,:,:]*MultiBodyLie.Math.axisRotation({0,1,0},jointAngles[5*k-4]);
    thighFrame[k,:,:]=hipFrame[k,:,:]*MultiBodyLie.Math.axisRotation({-1,0,0},axialAngles[2*k-1]);
    kneeFrame[k,:,:]=thighFrame[k,:,:]*MultiBodyLie.Math.axisRotation({0,1,0},jointAngles[5*k-3]);
    soleFrame[k,:,:]=kneeFrame[k,:,:]*MultiBodyLie.Math.axisRotation({0,1,0},jointAngles[5*k-2]-1.5707963267948966);
    thighArm[k,:]=-DiverTree.thighLength*thighFrame[k,:,1];
    shinArm[k,:]=-DiverTree.shankLength*kneeFrame[k,:,1];
    hipToFoot[k,:]=thighArm[k,:]+shinArm[k,:];
    footLocal[k,:]={DiverTree.hipSocket[1],if k==1 then DiverTree.hipSocket[2] else -DiverTree.hipSocket[2],DiverTree.hipSocket[3]}+hipToFoot[k,:];
    hipOmega[k,:]={0,0,-lateralRates[2*k-1]}+jointRates[5*k-4]*sweepFrame[k,:,2]-axialRates[2*k-1]*hipFrame[k,:,1];
    kneeOmega[k,:]=hipOmega[k,:]+jointRates[5*k-3]*thighFrame[k,:,2];
    soleOmega[k,:]=kneeOmega[k,:]+jointRates[5*k-2]*kneeFrame[k,:,2];
    footMotion[k,:]=cross(hipOmega[k,:],thighArm[k,:])+cross(kneeOmega[k,:],shinArm[k,:]);
    footLever[k,:]=basis*treeRig*footLocal[k,:];
    footPosition[k,:]=state[1:3]+footLever[k,:];
    footVelocity[k,:]=state[4:6]+basis*treeRig*(footMotion[k,:]+cross(rigOmega,footLocal[k,:]));
    penetration[k]=bedHeight-state[3]-footLever[k,3]+bedSlope[1]*footLever[k,1]+bedSlope[2]*footLever[k,2]+.06;
    normalV[k]=sum(footVelocity[k,j]*normal[j] for j in 1:3);
    footContact[k]=if penetration[k]>0 then max(0,13000*penetration[k]-630*normalV[k]) else 0;
    slip[k,:]=footVelocity[k,:]-normalV[k]*normal;
    groundForce[k,:]=footContact[k]*normal-min(850,.72*footContact[k]/sqrt(.0001+sum(slip[k,j]^2 for j in 1:3)))*slip[k,:];
    rigPosition[k,:]=footLocal[k,:]+bladeArm*(1-standing)*chord[k,:];
    rigMotion[k,:]=footMotion[k,:]+bladeArm*(1-standing)*cross(soleOmega[k,:]+lateralRates[2*k]*cantAxis[k,:],chord[k,:]);
    // Palm centre on the fifteen-body tree; these are its exact shoulder
    // and elbow columns of the position Jacobian in the trim frame.
    handSide[k]=if k==1 then 1 else -1;
    shoulderAngle[k]=jointAngles[5*k-1];
    handAxis[k]=jointAngles[5*k];
    armSpan[k]=.25+.30*cos(handAxis[k]);
    rigPosition[k+2,:]={.25-armSpan[k]*cos(shoulderAngle[k]),handSide[k]*(.24+armSpan[k]*sin(shoulderAngle[k])),
      -.045+handSide[k]*.30*sin(handAxis[k])};
    shoulderJac[k,:]=armSpan[k]*{sin(shoulderAngle[k]),handSide[k]*cos(shoulderAngle[k]),0};
    elbowJac[k,:]=.30*{sin(handAxis[k])*cos(shoulderAngle[k]),-handSide[k]*sin(handAxis[k])*sin(shoulderAngle[k]),handSide[k]*cos(handAxis[k])};
    rigMotion[k+2,:]=shoulderJac[k,:]*jointRates[5*k-1]+elbowJac[k,:]*jointRates[5*k];
    cant[k]=lateralAngles[2*k];
    bladeFrame[k,:,:]=DiverTree.bladeAxes(soleFrame[k,:,:],handSide[k],cant[k]);
    cantAxis[k,:]=-soleFrame[k,:,1];chord[k,:]=bladeFrame[k,:,1];
    bladeNormal[k,:]=bladeFrame[k,:,3];
    // Integrated normal drag across a 0.18 m blade span opposes twist about its chord.
    cantSpeed[k]=lateralRates[2*k]+cantAxis[k,:]*(rigOmega+soleOmega[k,:]);
    bladeWet[k]=submergedFraction(waterlineDepth-surfaceNormalInRig*rigPosition[k,:],
      surfaceNormalInRig*chord[k,:],.27,.035);
    palmWet[k]=submergedFraction(waterlineDepth-surfaceNormalInRig*rigPosition[k+2,:],axialUp,.095,.028);
    cantDrag[k]=-.125*rho*normalCd*bladeArea*.09^3*bladeWet[k]*(1-standing)*cantSpeed[k]*abs(cantSpeed[k]);
    finSpeed[k]=sum(rigFlow[k,j]*bladeNormal[k,j] for j in 1:3);
    bladeSlip[k,:]=rigFlow[k,:]-finSpeed[k]*bladeNormal[k,:];
    stroke[k]=-.5*rho*bladeArea*normalCd*(1-standing)*bladeWet[k]*abs(finSpeed[k])*finSpeed[k];
    rigForce[k,:]=stroke[k]*bladeNormal[k,:]-.5*rho*bladeArea*skinCd*(1-standing)*bladeWet[k]*
      sqrt(sum(bladeSlip[k,j]^2 for j in 1:3))*bladeSlip[k,:];
    // The cupped hand rotates with its forearm; projected normal drag opposes
    // water-relative motion. Palm area 0.016 m2, normal Cd 1.15, tangent Cd .07.
    palmY[k]=.6*cos(axialAngles[2*k])+.8*sin(axialAngles[2*k]);
    palmZ[k]=.8*cos(axialAngles[2*k])-.6*sin(axialAngles[2*k]);
    handNormal[k,:]={handSide[k]*palmZ[k]*sin(handAxis[k])*cos(shoulderAngle[k])+palmY[k]*sin(shoulderAngle[k]),
      -palmZ[k]*sin(handAxis[k])*sin(shoulderAngle[k])+handSide[k]*palmY[k]*cos(shoulderAngle[k]),palmZ[k]*cos(handAxis[k])};
    forearmAxis[k,:]={-handSide[k]*cos(handAxis[k])*cos(shoulderAngle[k]),cos(handAxis[k])*sin(shoulderAngle[k]),sin(handAxis[k])};
    pronationRate[k]=axialRates[2*k]+forearmAxis[k,:]*(rigOmega+{0,0,-handSide[k]*jointRates[5*k-1]});
    pronationDrag[k]=-.125*rho*.016*1.15*.045^3*palmWet[k]*pronationRate[k]*abs(pronationRate[k]);
    handSpeed[k]=handNormal[k,:]*rigFlow[k+2,:];
    handSlip[k,:]=rigFlow[k+2,:]-handSpeed[k]*handNormal[k,:];
    paddle[k]=-.5*rho*.016*(if k==2 then 1-.75*torchGrip else 1)*1.15*palmWet[k]*handSpeed[k]*abs(handSpeed[k]);
    rigForce[k+2,:]=paddle[k]*handNormal[k,:]-.5*rho*.016*.07*palmWet[k]*sqrt(handSlip[k,:]*handSlip[k,:])*handSlip[k,:];
    // J-transpose transmits the blade-center force through all three joints.
    // The foot-ground load acts at the ankle and has no blade lever.
    legLoad[k,:]=rigForce[k,:]+transpose(treeRig)*transpose(basis)*groundForce[k,:];
    soleMoment[k,:]=bladeArm*(1-standing)*cross(chord[k,:],rigForce[k,:])+cantDrag[k]*cantAxis[k,:];
    kneeMoment[k,:]=soleMoment[k,:]+cross(shinArm[k,:],legLoad[k,:]);
    hipMoment[k,:]=kneeMoment[k,:]+cross(thighArm[k,:],legLoad[k,:]);
    sweepTorque[k]=-hipMoment[k,3];hipLoad[k]=-hipFrame[k,:,1]*hipMoment[k,:];
    loadTorque[5*k-4]=sweepFrame[k,:,2]*hipMoment[k,:];
    loadTorque[5*k-3]=thighFrame[k,:,2]*kneeMoment[k,:];
    loadTorque[5*k-2]=kneeFrame[k,:,2]*soleMoment[k,:];
    loadTorque[5*k-1]=shoulderJac[k,:]*rigForce[k+2,:]-handSide[k]*forearmAxis[k,3]*pronationDrag[k];
    loadTorque[5*k]=elbowJac[k,:]*rigForce[k+2,:];
    axialTarget[2*k-1]=if policyMode>.5 then .70*max(-1,min(1,axialAction[2*k-1])) else
      handSide[k]*turnStrength*(.36*loadBlade[k]-.16*tuck[k]);
    axialTarget[2*k]=if policyMode>.5 then 1.38*max(0,min(1,axialAction[2*k]))+1.52*min(0,max(-1,axialAction[2*k]))
      else .12*idleScull*cos(1.8*state[15]);
    axialTorque[2*k-1]=max(-48,min(48,95*(axialTarget[2*k-1]-axialAngles[2*k-1])-10*axialRates[2*k-1]-hipLoad[k]));
    axialTorque[2*k]=max(-8,min(8,13*(axialTarget[2*k]-axialAngles[2*k])-1.65*axialRates[2*k]-pronationDrag[k]));
    axialShaft[2*k-1]=axialTorque[2*k-1]+hipLoad[k]+selfResult[18+2*k-1]+endStop(axialAngles[2*k-1],axialRates[2*k-1],-.70,.70,430,19);
    axialShaft[2*k]=axialTorque[2*k]+pronationDrag[k]+selfResult[18+2*k]+endStop(axialAngles[2*k],axialRates[2*k],-1.52,1.38,90,4);
    der(axialAngles[2*k-1])=axialRates[2*k-1];der(axialAngles[2*k])=axialRates[2*k];
    der(axialRates[2*k-1])=tree[387+2*k-1];der(axialRates[2*k])=tree[387+2*k];
  end for;
  finFluidPower=sum(cantDrag[k]*cantSpeed[k] for k in 1:2)+sum(sum(rigForce[k,j]*rigFlow[k,j] for j in 1:3) for k in 1:2);
  finMoment=treeRig*(cantDrag[1]*cantAxis[1,:]+cantDrag[2]*cantAxis[2,:]+cross(rigPosition[1,:],rigForce[1,:])+cross(rigPosition[2,:],rigForce[2,:]));
  mechanicalPower=sum(max(0,jointTorque[i]*jointRates[i]) for i in 1:10)+sum(max(0,lateralTorque[i]*lateralRates[i])+max(0,axialTorque[i]*axialRates[i]) for i in 1:4);
  rigOmega=transpose(treeRig)*omega;
  for k in 1:4 loop
    positionBody[k,:]=treeRig*rigPosition[k,:];
    jointVelocity[k,:]=treeRig*rigMotion[k,:];rigFlow[k,:]=transpose(treeRig)*waterFlow[k,:];
    localForce[k,:]=treeRig*rigForce[k,:];
    waterFlow[k,:]=relative+cross(omega,positionBody[k,:])+jointVelocity[k,:];
    limbForces[k,:]=basis*localForce[k,:];
  end for;
  contactForce=if contactWitness[1]>.5 then tree[392] else if contact[4]>0 then max(0,3600*contact[4]-650*sum(contact[i]*(state[i+3]+contactRelativeVelocity[i]) for i in 1:3)) else 0;
  // Body immersion: full neutral displacement below trim depth; loss of buoyancy above it.
  torsoReaction=if bedHeight+.25>state[3] then max(0,14000*(bedHeight+.25-state[3])-900*sum(state[j+3]*normal[j] for j in 1:3)) else 0;
  // An isothermal flexible bladder displaces more water as pressure falls.
  // The inflator transfers gas from the cylinder; the dump and relief vent to sea.
  vestLitres=min(vestCapacity,max(0,vestGas/ambient));
  // At full immersion fixed body and kit displace mass/rho - neutralVestLitres/1000.
  // A quiet band around that displacement avoids cycling the air valves.
  der(torchDeployment)=max(-1.35,min(1.35,9*(max(0,min(1,torchEquipped))-torchDeployment)));
  torchGrip=min(1,torchDeployment*4);
  torchRaise=max(0,min(1,(torchDeployment-.22)/.68));
  // At release the vest trims to neutral displacement. A signed pilot command
  // requests a modest ascent/descent, feeding back actual ENU vertical speed.
  neutralDemand=if abs(verticalPilot)>.01 then max(-2,min(2,8*(.10*max(-2,min(2,verticalPilot))-state[6]))) else 0;
  volumeError=neutralVestLitres+neutralDemand-vestLitres;
  autoValve=if neutralTrim>.5 then
    (if depth>1.2 and standing<.05 then max(-1,min(1,1.6*(max(0,volumeError-.12)+min(0,volumeError+.12)))) else 0)
    else if policyMode>.5 or pilot[1]>.5 or standing>.5 then 0 else
      max(-1,min(1,neutralVestLitres+max(-1.2,min(1.2,.32*(cruiseZ-state[3])-.85*state[6]))-vestLitres));
  selectedValve=if abs(vestValve)>.001 then vestValve else
    (if neutralTrim<.5 and policyMode>.5 and bladderAction>0 then
      max(0,min(1,(neutralVestLitres+3*min(1,bladderAction)-vestLitres)*2))
      else (if abs(autoValve)>.08 then autoValve else 0));
  inflateCommand=max(0,min(1,selectedValve));
  vestFill=2.0*inflateCommand*min(1,available/.2)*min(1,max(0,(vestCapacity-vestLitres)*4));
  vestDump=1.6*ambient*max(0,min(1,-selectedValve))*min(1,vestLitres*4)
    +10*max(0,vestGas-ambient*vestCapacity);
  der(vestGas)=vestFill-vestDump;
  vestLift=.001*rho*9.80665*(vestWet*vestLitres-wet*neutralVestLitres);
  gravity=mass*9.80665*(wet-1)+vestLift;
  rootForce=transpose(basis)*(torsoReaction*normal+groundForce[1,:]+groundForce[2,:])
    +localForce[1,:]+localForce[2,:]+localForce[3,:]+localForce[4,:];
  // Buoyancy acts dorsally to the centre of mass. When planted, limited
  // shifts of sole pressure inside the support polygon resist overturning.
  totalNormal=footContact[1]+footContact[2];
  supportMoment=cross(treeRig*footLocal[1,:],transpose(basis)*groundForce[1,:])
              +cross(treeRig*footLocal[2,:],transpose(basis)*groundForce[2,:]);
  balance={max(-.23*totalNormal,min(.23*totalNormal,if policyMode>.5 then .23*totalNormal*soleAction[1] else -supportMoment[1]-2600*sin(state[9])-230*omega[1])),
      max(-.39*totalNormal,min(.39*totalNormal,if policyMode>.5 then .39*totalNormal*soleAction[2] else -supportMoment[2]+3200*sin(state[8])-260*omega[2])),
      -min(.11*totalNormal,38*abs(omega[3]))*sign(omega[3])};
  rootMoment=balance+finMoment+treeRig*(pronationDrag[1]*forearmAxis[1,:]+pronationDrag[2]*forearmAxis[2,:])+cross(positionBody[3,:],localForce[3,:])+cross(positionBody[4,:],localForce[4,:])+supportMoment;
  der(state[1:3])=state[4:6];
  der(state[4:6])=tree[4:6];
  {rDot,-pDot,yDot}=tree[1:3];
  der(state[10])=yDot;
  der(state[11])=pDot;
  der(state[12])=rDot;
  der(state[7])=headingRate;
  headingRate=(sin(state[9])*omega[2]+cos(state[9])*omega[3])/
    (if cos(state[8])>=0 then max(.05,cos(state[8])) else min(-.05,cos(state[8])));
  der(state[8])=sin(state[9])*omega[3]-cos(state[9])*omega[2];
  der(state[9])=omega[1]-sin(state[8])*headingRate;
  depth=max(0,waterLevel-state[3]);
  ambient=surfaceBar+barPerMetre*depth;
  // Regulator location in the actual torso frame, including the ground stance.
  mouthHeight=state[3]+.545*axialUp+.020*dorsalUp;
  submerged=mouthHeight<waterLevel;
  available=max(0,dive[1]+surfaceBar-ambient);
  breathing=not submerged or available>.01;
  ventilation=13+19*state[14];
  // At the surface the diver breathes atmospheric air. Surfacing preserves the cylinder contents.
  der(dive[1])=-(vestFill+(if submerged and breathing then ventilation*ambient/60 else 0))/cylinderLitres;
  inspired=.79*((if submerged then ambient else surfaceBar)-.0627);
  for i in 1:16 loop
    der(dive[1+i])=if breathing then log(2)*(inspired-dive[1+i])/(60*halfMin[i]) else 0;
    // Constant-depth time to the surface limit, without credit for washout during ascent.
    surfaceLimit[i]=surfaceBar+gradientLimit*(aN2[i]+surfaceBar*(1/bN2[i]-1));
    noStop[i]=if dive[1+i]>=surfaceLimit[i] then 0 else if inspired<=surfaceLimit[i] then 99
      else min(99,halfMin[i]*log(max(1,(inspired-dive[1+i])/max(1e-12,inspired-surfaceLimit[i])))/log(2));
    gradient[i]=(dive[1+i]-ambient)/(aN2[i]+ambient*(1/bN2[i]-1));
    ceilingBar[i]=(dive[1+i]-gradientLimit*aN2[i])/(1-gradientLimit+gradientLimit/bN2[i]);
  end for;
  der(dive[18])=((if submerged then 60*state[6] else 0)-dive[18])/2;
  // Accumulated excess over the unmodified M-value is a game exposure indicator.
  der(dive[19])=max(0,max(gradient)-1);
  der(dive[20])=if submerged then 1 else 0;
  computer={depth,min(noStop),max(0,available-50)*cylinderLitres/(ventilation*ambient)};
  gauge={available,ambient,max(0,(max(ceilingBar)-surfaceBar)/barPerMetre),max(0,max(gradient))};
  der(state[16])=if submerged and breathing then .21+.09*state[14] else 0;
  activity={kickHz,state[16],if state[14]<.15 then 1 else 0,if submerged then 1 else 0,standing,pitchCommand};
  // Sample the recreational log once per simulated second. A minute at the
  // surface starts a fresh log on immersion while dissolved nitrogen carries on.
  diveLog={if submerged then (if priorLog[2]>=60 then depth else max(depth,priorLog[1])) else priorLog[1],
      if submerged then 0 else priorLog[2]+1,
      if depth>=10 or submerged and priorLog[2]>=60 then 0
      else if depth>=4 and depth<=6 and priorLog[4]>.5 then min(180,priorLog[3]+1)
      else priorLog[3],
      if depth>=10 then 1 else if submerged and priorLog[2]>=60 then 0 else priorLog[4],
      if submerged and priorLog[2]>=60 then max(0,dive[20]-1) else priorLog[5]};
end ScubaDiver;
