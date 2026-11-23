model HobieFleetPilot "Modelica race navigation, steering, contact and penalty turns for one NPC"
  parameter Real gateEast=-10,gateNorth=-6.5,lineLength=64,prevailing=Modelica.Constants.pi/2;
  parameter Real lane=0,initialEast=0,initialNorth=0,initialHeading=-.58,initialSpeed=2;
  input Real utc,raceStart,windEast,windNorth,seaHeight,seaRoll,seaPitch;
  input Real traffic[10,9]=zeros(10,9),trafficTilt[10,2]=zeros(10,2);
  output Real pose[8] "ENU, heading, water-relative speed, EN velocity, yaw rate";
  output Real raceStatus[6] "Stage, elapsed, lap time, heat start, turns owed, degrees through the current turn";
  parameter Real initialPenalty=0;
  Real east,north,heading,speed,yawRate;
  Real ve,vn;
  Hobie16 boat(launchEast=initialEast,launchNorth=initialNorth,launchHeading=initialHeading,launchSpeed=initialSpeed,
    launchHeight=.2,windEast=windEast,windNorth=windNorth,currentEast=.2,currentNorth=.04,
    waveHeight=seaHeight,waveRoll=seaRoll,wavePitch=seaPitch,orbitalEast=0,orbitalNorth=0,orbitalUp=0,
    swellAmplitude=0,manualJibAssist=1,reachTrial=0,
    refinedSectionWater=zeros(2,boat.hydroPanelCount),previousRefinedSectionWater=zeros(2,boat.hydroPanelCount),
    useSectionWater=0,sectionWater=zeros(2,6),previousWater=zeros(2,6),waterStamp=0,
    mass=205,ballastMass=60,ballastManual=0,ballastCmdX=0,ballastCmdY=0,
    downhaulInput=.5,outhaulInput=.65,manualHelm=0,rudderInput=0,trimInput=0,vangInput=.5,
    deckManual=0,mainCarInput=0,jibCarInput=0,jibTrimInput=0,
    raceGoal={1,goal[1],goal[2]},tacticalCourse={1,course,pace},
    traffic=traffic[1:4,:],trafficTilt=trafficTilt[1:4,:],sceneTraffic=traffic[5:10,:],
    sceneTilt=trafficTilt[5:10,:],wakeEast=0,wakeNorth=0,wakeYaw=0,droneLoad=race.racerLoad);
  Real upwind,wind,along,across,seconds,pace,markLoad;
  discrete Real contactFlag(start=0,fixed=true);
  Real markRange,buoyTraffic[3,9],finishAlong,finishAcross;
  Real goal[2],windward[2],crosswind[2],startLine[2],turnPoint[2],turnHeading;
  final parameter Real startBearing=prevailing+Modelica.Constants.pi;
  final parameter Real courseUp[2]={cos(startBearing),sin(startBearing)};
  final parameter Real courseSide[2]={-courseUp[2],courseUp[1]};
  discrete Real course(start=initialHeading,fixed=true),owed(start=initialPenalty,fixed=true),arc(start=0,fixed=true);
  discrete Real turnSide(start=1,fixed=true),headingBefore(start=initialHeading,fixed=true);
  Real contact[10];
  discrete Real contactMemory[10](each start=0,each fixed=true);
  discrete Real oldMark(start=0,fixed=true),heatSeen(start=0,fixed=true);
  discrete Boolean turning(start=false,fixed=true),finishReady(start=false,fixed=true);
  Regatta race(utc=utc,raceStart=raceStart,east=east,north=north,finishAllowed=if owed<.5 then 1 else 0,
    gateEast=gateEast,gateNorth=gateNorth,lineLength=lineLength,windBearing=prevailing,tide=seaHeight,landingReaction=zeros(6),
    wakeTile=zeros(64,64),backgroundTile=zeros(32,32),driftEast=0,driftNorth=0,swellHeight=0,
    racerState={1,heading,boat.heel,boat.pitch,boat.heave,ve,vn,yawRate,boat.vertical,boat.rollRate,boat.pitchRate},
    hullStations={-2.520,-1.9,-.9,.15,1.12,1.95,2.520},hullWidths={.09,.156,.185,.184,.155,.093,.009},hullOffset=1.02);
equation
  east=boat.east;north=boat.north;heading=boat.heading;speed=boat.surge;yawRate=boat.yawRate;
  ve=boat.ve;vn=boat.vn;
  contact=cat(1,boat.peerContact,boat.sceneContact);
  wind=sqrt(windEast^2+windNorth^2);
  upwind=if wind>.05 then atan2(-windNorth,-windEast) else startBearing;
  windward={cos(upwind),sin(upwind)};
  crosswind={-windward[2],windward[1]};
  // Allow each NPC its own lane, while favouring the upwind end of a biased line.
  startLine={gateEast,gateNorth}+courseSide*min(.38*lineLength,max(-.38*lineLength,lane+.07*lineLength*(courseSide*windward)));
  finishAlong=({east,north}-{gateEast,gateNorth})*courseUp;
  finishAcross=({east,north}-{gateEast,gateNorth})*courseSide;
  along=({east,north}-startLine)*courseUp;
  across=({east,north}-startLine)*courseSide;
  seconds=max(0,raceStart-utc);
  turnPoint={east,north}-12*windward+4*crosswind;
  goal=if owed>.5 and not turning then turnPoint
    elseif race.stage==0 and seconds>27 then startLine-40*courseUp-13*courseSide
    elseif race.stage==0 or race.stage==1 then
      (if along>1 then startLine-18*courseUp else startLine+14*courseUp)
    elseif race.stage==4 then {gateEast,gateNorth}+courseUp*(if finishReady then -26 else 22)
    else race.pilotTarget;
  pace=if race.stage==0 and seconds>27 then min(1,max(.0,sqrt((goal-{east,north})*(goal-{east,north}))/5))
    elseif race.stage==0 and along<0 then min(1,max(.05,(-along)/(max(.4,seconds+.5)*max(.45,abs(speed)))))
    else 1;
  pose={east,north,boat.heave,heading,speed,ve,vn,yawRate};
  markLoad=sum(abs(race.markWrench[:,1]))+sum(abs(race.markWrench[:,2]));
  markRange=min(sqrt((east-race.pinEast)^2+(north-race.pinNorth)^2),
    min({sqrt((east-race.markEast[i])^2+(north-race.markNorth[i])^2) for i in 1:2}));
  buoyTraffic=[1,race.pinEast,race.pinNorth,0,0,0,0,seaHeight,4;
    1,race.markEast[1],race.markNorth[1],0,0,0,0,seaHeight,4;
    1,race.markEast[2],race.markNorth[2],0,0,0,0,seaHeight,4];
  turnHeading=heading+pre(turnSide)*.64;
  raceStatus={race.stage,race.elapsed,race.lapTime,heatSeen,owed,arc*180/Modelica.Constants.pi};
  when sample(0,.2) then
    contactFlag=if pre(race.stage)<5 then SailingTactics.newBreach({east,north},heading,upwind,traffic,contact,pre(contactMemory),markLoad,pre(oldMark)) else 0;
    finishReady=if race.stage<>4 or finishAlong< -5 then false
      elseif finishAlong>5 and abs(finishAcross)<lineLength*.31 then true else pre(finishReady);
    heatSeen=if race.stage<2 then max(raceStart,race.nextStart-300) else pre(heatSeen);
    contactMemory={if contact[i]>10 or (pre(contactMemory[i])>10 and
        abs(east-traffic[i,2])+abs(north-traffic[i,3])<7 and traffic[i,1]>.5) then 100 else 0 for i in 1:10};
    oldMark=if markLoad>1 or (pre(oldMark)>1 and markRange<7) then 100 else 0;
    owed=if initial() then initialPenalty else max(0,pre(owed)+contactFlag-(if pre(arc)>=2*Modelica.Constants.pi-.02 then 1 else 0));
    turning=pre(owed)>.5 and SailingTactics.roomToTurn({east,north},traffic,
      [race.pinEast,race.pinNorth;race.markEast[1],race.markNorth[1];race.markEast[2],race.markNorth[2]]);
    turnSide=if turning and not pre(turning) then
      (if SailingTactics.wrap(upwind-heading)>=0 then 1 else -1) else pre(turnSide);
    arc=if turning and pre(turning) and pre(arc)<2*Modelica.Constants.pi-.02 and pre(contactFlag)<.5 then
      max(0,pre(arc)+turnSide*SailingTactics.wrap(heading-pre(headingBefore))) else 0;
    headingBefore=heading;
    course=if turning then turnHeading else
      SailingTactics.chooseCourse({east,north},heading,speed,goal,upwind,wind,1.035,pre(course),cat(1,traffic,buoyTraffic));
  end when;
end HobieFleetPilot;
