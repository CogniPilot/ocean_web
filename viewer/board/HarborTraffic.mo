model HarborTraffic "Shared background swimmers, sailing pilot and camera drone in ENU metres"
  // The authority transfers the full state vector when it hands over the room.
  parameter Real initialState[17]={0,-28,6,0,2,-25,2,6,0,9,-12,-4,0,-.06,0,0,0};
  input Real wind[2]={0,11};
  input Real craft[32,8]=zeros(32,8),sharkSurface=0,whaleSlope[2]={0,0},sharkSlope[2]={0,0};
  input Real whalePrey[5]=zeros(5),sharkPrey[5]=zeros(5);
  parameter Real behaviorOffset=0 "Seconds of offset between NPC activity schedules";
  Real foragePhase[2];
  output Real feedingAttempt[2] "Open mouth for a live prey encounter during an autonomous foraging bout";
  parameter Real initialGuidance[6]=zeros(6);
  discrete Real whaleGuide[9](start=cat(1,{0,0,1.7,1,0,0},initialGuidance[1:3]),each fixed=true);
  discrete Real sharkGuide[9](start=cat(1,{0,0,1.65,1,0,0},initialGuidance[4:6]),each fixed=true);
  output Real guidanceMemory[6],whaleSources[12,5],sharkSources[12,5];
  Real encounter[6],sharkVisit[6];
  discrete Real whaleBottomAhead(start=-13.7,fixed=true);
  input Real waterLevel=0,whaleTurn=0,sharkTurn=0;
  input Real whalePilot[4]={0,0,0,-1},sharkPilot[4]={0,0,0,-1};
  input Real whaleBank=0,whaleDirect=0,whaleActuators[5]=zeros(5);
  input Real sharkBank=0;
  parameter Real initialSwimReserve[2]={1,1};
  output Real swimReserve[2] "Available muscle burst reserves for whale and shark";
  Real whaleReserve(start=initialSwimReserve[1],fixed=true);
  Real sharkReserve(start=initialSwimReserve[2],fixed=true);
  Real whaleRequest,sharkRequest,whaleRoom,sharkRoom,sharkSprint;
  output Real whaleShapeFrames[7,16] "MultiBodyLie shape tables in the displayed whale frame";
  output Real whaleContact[2],whaleFinLift[2] "Normal load (N), minimum gap (m); port and starboard lift (N)";
  parameter Real initialFish[10]={1.65,0,0,0,0,0,0,0,0,0};
  output Real sharkTrunkFlex "Anterior trunk flexion in radians";
  parameter Real initialSharkBank[2]={0,0};
  GreatWhite whiteShark(startState=initialFish,startBank=initialSharkBank);
  output Real fish[10],sharkTailForce,sharkTailPower,sharkFin;
  output Real sharkBankState[2] "Roll and roll rate";
  output Real sharkContact[2] "Terrain normal load (N) and minimum signed gap (m)";
  input Real craftHull[32,5]=zeros(32,5) "Hull class (Hobie, sloop, cruiser), yaw, heel, pitch and yaw rate";
  input Real npcTraffic[10,9]=zeros(10,9) "Shared animals surrounding the background Hobie";
  discrete output Real npcContact[6](each start=0,each fixed=true);
  discrete output Real hullReaction[2,3](each start=0,each fixed=true) "Forward/port reaction and yaw moment on each animal";
  function vesselReactions
    input Real whale[9],shark[9],craft[32,8],hulls[32,5],joints[4];
    output Real reaction[2,3];
  protected
    Real a[9],traffic[10,9],load[6],mass,length,width,spacing,draft,dx,dy,articulation[10,4];
  algorithm
    reaction:=zeros(2,3);traffic:=zeros(10,9);articulation:=zeros(10,4);
    articulation[1,:]:=joints;
    for k in 1:2 loop
      a:=if k==1 then whale else shark;traffic[1,:]:=a;
      for i in 1:32 loop
        dx:=craft[i,3]-a[2];dy:=craft[i,4]-a[3];
        if hulls[i,1]>.5 and dx*dx+dy*dy<100 and abs(craft[i,5]-a[4])<7 then
          mass:=if hulls[i,1]>2.5 then 3250 elseif hulls[i,1]>1.5 then 64 else 265;
          length:=if hulls[i,1]>2.5 then 7.6 elseif hulls[i,1]>1.5 then 2.32 else 5.04;
          width:=if hulls[i,1]>2.5 then 1.22 elseif hulls[i,1]>1.5 then .33 else .18;
          spacing:=if hulls[i,1]<1.5 then 1.02 else 0;
          draft:=if hulls[i,1]>2.5 then .58 elseif hulls[i,1]>1.5 then .28 else .25;
          load:=WildlifeContact(zeros(2,6),{craft[i,3],craft[i,4],craft[i,5],hulls[i,3],hulls[i,4],hulls[i,2]},
             {craft[i,6],craft[i,7],hulls[i,5]},mass,length,width,spacing,draft,traffic,articulation);
          reaction[k,1]:=reaction[k,1]-load[1]*cos(a[5])-load[2]*sin(a[5]);
          reaction[k,2]:=reaction[k,2]+load[1]*sin(a[5])-load[2]*cos(a[5]);
          reaction[k,3]:=reaction[k,3]-load[6]-dx*load[2]+dy*load[1];
        end if;
      end for;
    end for;
  end vesselReactions;
  Real fishSpeed,fishRequested,sharkNoseDepth,sharkSwimPitch;
  parameter Real initialSwimmer[18]={2,-18,-3,1.7,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
  input Real localSurface=0,currentVelocity[2]={0,0},strokeGain=1;
  Humpback swimmer(startState=initialSwimmer);
  Real whaleJoints[4];
  output Real swimmerState[18],wetSections[6,3],tailForce,tailPower;
  input Real droneSubject=0 "0 alternates, 1 follows the Hobie, 2 follows the whale";
  output Real state[17](start=initialState,each fixed=true)
    "Clock; boat E,N,yaw,speed; drone E,N,Z,yaw; shark E,N,Z,yaw; breath timer,contact sway; sheet angle,heel";
  output Real whale[5] "E,N,Z,yaw,pitch (positive nose up)";
  discrete Real priorHeight(start=-3,fixed=true);
  parameter Real initialImpact[5]={-100,0,0,0,0};
  discrete output Real impact[5](start=initialImpact,each fixed=true) "Impact time, east, north, surface height and downward speed";
  output Real breathAge "Seconds since start of this surfacing exhalation";
  Real route,course,relative,steer,windFrom,windSpeed,sailSpeed,offWind;
  Real subWeight,sharkE,sharkN,sharkZ,sharkHeading;
  Real followWhale,droneE,droneN,droneZ,lookYaw;
equation
  whaleJoints={swimmer.x[8]-swimmer.x[6],swimmer.x[16],swimmer.x[17],swimmer.x[18]};
  whaleShapeFrames=SwimmerCollision.whale(whaleJoints[1],whaleJoints[2],whaleJoints[3],whaleJoints[4]);
  when sample(0,.025) then
    npcContact=WildlifeContact(zeros(2,6),{state[2],state[3],waterLevel+.18,state[17],0,state[4]},
      {state[5]*cos(state[4])-state[15]*sin(state[4]),state[5]*sin(state[4])+state[15]*cos(state[4]),.58*sin(steer-state[4])},
      265,5.04,.18,1.02,.25,npcTraffic);
    hullReaction=vesselReactions({1,swimmer.x[1],swimmer.x[2],swimmer.x[3],swimmer.x[10],swimmer.x[6],
      swimmer.x[4]*cos(swimmer.x[10])-swimmer.x[15]*sin(swimmer.x[10]),
      swimmer.x[4]*sin(swimmer.x[10])+swimmer.x[15]*cos(swimmer.x[10]),swimmer.x[12]},
      {2,state[10],state[11],state[12],state[13],fish[3],whiteShark.velocity[1],whiteShark.velocity[2],sharkBankState[1]},craft,craftHull,whaleJoints);
  end when;
  swimmer.boatLoad=hullReaction[1,:];whiteShark.boatLoad=hullReaction[2,:];
  der(state[1])=1;
  // Follow an oval in clear water with a look-ahead point, a no-go cone and a simple polar.
  route=atan2((state[3]-1)/20,(state[2]+38)/24)+.48;
  course=atan2(1+20*sin(route)-state[3],-38+24*cos(route)-state[2]);
  windSpeed=sqrt(wind*wind+.000001);
  windFrom=atan2(-wind[2],-wind[1]+1e-8);
  relative=atan2(sin(course-windFrom),cos(course-windFrom));
  steer=if abs(relative)<.86 then windFrom+(if relative>=0 then .86 else -.86) else course;
  der(state[4])=.58*sin(steer-state[4])+max(-.8,min(.8,npcContact[6]/2200));
  offWind=atan2(sin(windFrom-state[4]),cos(windFrom-state[4]));
  sailSpeed=min(5.5,.40*windSpeed)*(0.35+.65*sin(min(1.57,abs(offWind))))*min(1,abs(offWind)/.8);
  der(state[5])=(sailSpeed-state[5])/.95+(npcContact[1]*cos(state[4])+npcContact[2]*sin(state[4]))/265;
  der(state[2])=state[5]*cos(state[4])-state[15]*sin(state[4]); der(state[3])=state[5]*sin(state[4])+state[15]*cos(state[4]);
  der(state[16])=(tanh(6*sin(offWind))*min(1.25,.08+.39*abs(offWind))-state[16])/.55;
  der(state[17])=(.022*min(14,windSpeed)*sin(offWind)-state[17])/1.15;

  foragePhase={mod(state[1]+behaviorOffset+12,83),mod(state[1]+behaviorOffset+5,57)};
  feedingAttempt={if whalePilot[1]<.5 and whaleGuide[6]>1.5 and foragePhase[1]<18 then whalePrey[5] else 0,
    if sharkPilot[1]<.5 and sharkGuide[6]>1.5 and foragePhase[2]<16 then sharkPrey[5] else 0};
  when sample(0,.2) then
    // Include the projected nose position in the soundings used for depth control.
    whaleBottomAhead=max(Shore.seabed(swimmer.x[1],swimmer.x[2]),
      Shore.seabed(swimmer.x[1]+(5+3*max(0,swimmer.x[4]))*cos(swimmer.x[10]),
                   swimmer.x[2]+(5+3*max(0,swimmer.x[4]))*sin(swimmer.x[10])));
    whaleGuide=WildlifeGuidance(true,state[1],{swimmer.x[1],swimmer.x[2],swimmer.x[3],swimmer.x[10]},swimmer.x[4],craft,pre(whaleGuide[7:9]),
      if foragePhase[1]<18 then whalePrey[1:4] else zeros(4));
    sharkGuide=WildlifeGuidance(false,state[1],state[10:13],fish[1],craft,pre(sharkGuide[7:9]),
      if foragePhase[2]<16 then sharkPrey[1:4] else zeros(4));
  end when;
  guidanceMemory=cat(1,whaleGuide[7:9],sharkGuide[7:9]);
  encounter=if whalePilot[1]>.5 then {1,swimmer.x[10]+whaleTurn,1.7,1,0,0} else whaleGuide[1:6];
  sharkVisit=if sharkPilot[1]>.5 then {1,state[13]+sharkTurn,1.7,1,0,0} else sharkGuide[1:6];
  whaleSources=SwimmerSections(true,{swimmer.x[1],swimmer.x[2],swimmer.x[3],swimmer.x[10],swimmer.x[6],swimmer.x[12]},
    {localSurface,whaleSlope[1],whaleSlope[2]},swimmer.x[8]-swimmer.x[6],swimmer.x[17],swimmer.x[18],swimmer.stations[:,3]);
  sharkSources=SwimmerSections(false,{state[10],state[11],state[12],state[13],fish[3],sharkBankState[1]},
    {sharkSurface,sharkSlope[1],sharkSlope[2]},fish[6],0,0,zeros(6));
  // Full manual effort spends a finite reserve. Easing the effort gradually replenishes it.
  // Leave room for a full stroke before committing to the high-power gait.
  whaleRoom=min(1,max(0,(localSurface-whaleBottomAhead-6)/4))*
    min(1,max(0,(whaleContact[2]-.6)/1.2));
  sharkRoom=min(1,max(0,(sharkSurface-state[12]-1.25-abs(2.32*sin(fish[3])))/1.5))*
    min(1,max(0,(sharkContact[2]-.6)/1.2));
  sharkSprint=if sharkPilot[1]>.5 and sharkPilot[4]<0 then sharkRoom*min(1,max(0,(sharkPilot[3]-.78)/.22)) else 0;
  whaleRequest=if whalePilot[1]>.5 and whalePilot[4]<0 and whaleDirect<.5
    then whaleRoom*min(1,max(0,strokeGain))*min(1,max(0,(whalePilot[3]-.95)/.05)) else 0;
  sharkRequest=if sharkPilot[1]>.5 and sharkPilot[4]<0
    then sharkRoom*min(1,max(0,strokeGain))*min(1,max(0,(sharkPilot[3]-.95)/.05)) else 0;
  der(whaleReserve)=-whaleRequest*min(.08,2*max(0,whaleReserve))+(1-whaleRequest)*max(0,1-whaleReserve)/24;
  der(sharkReserve)=-sharkRequest*min(.08,2*max(0,sharkReserve))+(1-sharkRequest)*max(0,1-sharkReserve)/24;
  swimReserve={whaleReserve,sharkReserve};
  swimmer.burst=whaleRequest*min(1,max(0,whaleReserve)/.32);
  swimmer.bankCommand=whaleBank;swimmer.directDrive=whaleDirect;swimmer.actuators=whaleActuators;
  whaleContact={swimmer.ground[10],swimmer.ground[11]};whaleFinLift={swimmer.portLift,swimmer.starboardLift};
  swimmer.behaviorOffset=behaviorOffset;swimmer.bottomAhead=whaleBottomAhead;swimmer.pilot=whalePilot;swimmer.encounter=encounter;swimmer.clock=state[1];swimmer.surface=localSurface;swimmer.current=currentVelocity;swimmer.strokeGain=strokeGain;
  swimmerState=swimmer.x;wetSections=swimmer.stations;tailForce=swimmer.tailThrust;tailPower=swimmer.musclePower;
  whale={swimmer.x[1],swimmer.x[2],swimmer.x[3],swimmer.x[10],swimmer.x[6]};
  // Arm the blow underwater and release it once the blowholes clear the surface.
  der(state[14])=if swimmer.blowholeHeight<localSurface-.20 then -min(12,max(0,8*(state[14]+.06))) elseif swimmer.blowholeHeight>localSurface or state[14]>.005 then 1 else 0;
  breathAge=state[14];der(state[15])=(-npcContact[1]*sin(state[4])+npcContact[2]*cos(state[4]))/265-3*state[15];

  when sample(0,.05) then
    priorHeight=swimmer.x[3]-localSurface;
    impact=if priorHeight<.24 and pre(priorHeight)>=.24 and swimmer.x[5]<-1.2 then {state[1],swimmer.x[1],swimmer.x[2],localSurface,-swimmer.x[5]} else pre(impact);
  end when;
  // The shark rises on patrol, then dives past a submerged vehicle with an offset.
  subWeight=.5-.5*tanh(4*cos(state[1]*.085));
  sharkE=6+12*cos(state[1]*.074);sharkN=-12+6*sin(state[1]*.074);
  sharkZ=if sharkVisit[6]>1.5 then sharkVisit[5] else sharkSurface-.42+subWeight*(if sharkVisit[6]>.5 then min(-1,sharkVisit[5]+.8-sharkSurface) else -2.8);
  sharkHeading=if sharkVisit[1]>.5 then sharkVisit[2] else atan2(.38*(sharkN-state[11])+.444*cos(state[1]*.074),
                     .38*(sharkE-state[10])-.888*sin(state[1]*.074)+1e-8);
  der(state[13])=fish[9];
  fishSpeed=if sharkPilot[1]>.5 then (if sharkPilot[4]>=0 then 6.6 else 1.3+4*sharkPilot[3]+1.8*sharkSprint) else sharkVisit[3];
  // Outside a breach the shark levels its head before the gills leave water.
  // A deliberate breach carries its run-up momentum through this surface zone.
  sharkNoseDepth=sharkSurface-state[12]-1.72*sin(fish[3]);
  sharkSwimPitch=min(sharkPilot[2],max(-.23,min(.88,.82*(sharkNoseDepth-.16))));
  fishRequested=if sharkPilot[1]>.5 then
    (if sharkPilot[4]>=0 and sharkPilot[4]<5 then max(-.55,min(.35,.25*(sharkSurface-5-state[12])))
     elseif sharkPilot[4]>=5 and sharkPilot[4]<8 then 1.12 else sharkSwimPitch)
    else max(-.52,min(.52,.55*(sharkZ-state[12])-.45*fish[2]));
  whiteShark.z=state[12];whiteShark.heading=state[13];whiteShark.surface=sharkSurface;
  whiteShark.east=state[10];whiteShark.north=state[11];sharkContact=whiteShark.ground[6:7];
  whiteShark.sprint=sharkSprint;whiteShark.burst=sharkRequest*min(1,max(0,sharkReserve)/.32);
  whiteShark.current=currentVelocity;whiteShark.drive=strokeGain;
  whiteShark.desiredSpeed=fishSpeed;whiteShark.desiredPitch=fishRequested;whiteShark.desiredHeading=sharkHeading;
  whiteShark.bankCommand=if sharkPilot[1]>.5 then sharkBank else 0;
  sharkBankState=whiteShark.bank;
  sharkTrunkFlex=whiteShark.trunkFlex;
  fish=whiteShark.x;sharkTailForce=whiteShark.tailThrust;sharkTailPower=whiteShark.shaftPower;sharkFin=whiteShark.finAngle;
  der(state[10])=whiteShark.velocity[1];der(state[11])=whiteShark.velocity[2];der(state[12])=fish[2];
  followWhale=if droneSubject>1.5 then 1 elseif droneSubject>.5 then 0 else .5-.5*tanh(3*cos(state[1]*.055));
  droneE=(1-followWhale)*state[2]+followWhale*whale[1];
  droneN=(1-followWhale)*state[3]+followWhale*whale[2];
  droneZ=waterLevel+6+2*followWhale;
  lookYaw=atan2(droneN-state[7],droneE-state[6]+1e-8);
  der(state[6])=max(-6,min(6,(droneE-4-state[6])*.85));
  der(state[7])=max(-6,min(6,(droneN+3-state[7])*.85));
  der(state[8])=(droneZ-state[8])*.75;
  der(state[9])=2*atan2(sin(lookYaw-state[9]),cos(lookYaw-state[9]));
end HarborTraffic;
