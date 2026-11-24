model HobieFleetPilot "Modelica race navigation, steering, contact and penalty turns for one NPC"
  parameter Real gateEast=-10,gateNorth=-6.5,lineLength=64,prevailing=Modelica.Constants.pi/2;
  parameter Real lane=0,initialEast=0,initialNorth=0,initialHeading=-.58,initialSpeed=2;
  input Real utc,raceStart,windEast,windNorth,seaHeight,seaRoll,seaPitch;
  input Real incidentSea=0,seaTide=0,seaTile[32,32]=zeros(32,32);
  input Real swellSample[5]=zeros(5) "Amplitude, origin phase, east/north wave number and angular frequency";
  input Real swellSampleTime=0;
  input Real externalCourse=0,coursePoints[4,2]=zeros(4,2);
  input Real traffic[10,9]=zeros(10,9),trafficTilt[10,2]=zeros(10,2);
  output Real pose[8] "ENU, heading, water-relative speed, EN velocity, yaw rate";
  output Real raceStatus[6] "Stage, elapsed, lap time, heat start, turns owed, degrees through the current turn";
  parameter Real initialPenalty=0;
  Real east,north,heading,speed,yawRate;
  Real ve,vn;
  Hobie16 boat(launchEast=initialEast,launchNorth=initialNorth,launchHeading=initialHeading,launchSpeed=initialSpeed,
    heave(fixed=false),windEast=windEast,windNorth=windNorth,currentEast=.2,currentNorth=.04,
    waveHeight=background,waveRoll=incidentRoll,wavePitch=incidentPitch,orbitalEast=0,orbitalNorth=0,orbitalUp=0,
    swellAmplitude=swellSample[1]*incidentSea,swellK=swellNumber,swellOmega=swellFrequency,
    seaClockOffset= -swellSample[2]/swellFrequency-swellSampleTime,manualJibAssist=1,reachTrial=0,
    useRefinedSectionWater=true,refinedSectionWater=sectionSample,previousRefinedSectionWater=sectionPrevious,
    useSectionWater=1,sectionWater=coarseSection,previousWater=coarsePrevious,waterStamp=sectionTime,
    mass=205,ballastMass=60,ballastManual=0,ballastCmdX=0,ballastCmdY=0,
    downhaulInput=.5,outhaulInput=.65,manualHelm=0,rudderInput=0,trimInput=0,vangInput=.5,
    deckManual=0,mainCarInput=0,jibCarInput=0,jibTrimInput=0,
    raceGoal={1,goal[1],goal[2]},tacticalCourse={1,course,pace},
    traffic=traffic[1:4,:],trafficTilt=trafficTilt[1:4,:],sceneTraffic=traffic[5:10,:],
    sceneTilt=trafficTilt[5:10,:],wakeEast=0,wakeNorth=0,wakeYaw=0,droneLoad=race.racerLoad);
  Real upwind,wind,along,across,seconds,pace,markLoad;
  Real background,incidentRoll,incidentPitch,swellNumber,swellFrequency;
  Real lateralX,lateralY,forwardX,forwardY,coarseSection[2,6],coarsePrevious[2,6];
  discrete Real sectionSample[2,boat.hydroPanelCount](each start=0,each fixed=true);
  discrete Real sectionPrevious[2,boat.hydroPanelCount](each start=0,each fixed=true);
  discrete Real sectionTime(start=0,fixed=true);
  function samplePontoons
    input Real field[32,32],tide,east,north,yaw,roll,pitch,baseHeight,enabled;
    input Real stations[:];
    output Real samples[2,size(stations,1)];
  protected
    Real c,s,along,across,x,y;
  algorithm
    c:=cos(yaw);s:=sin(yaw);
    for side in 1:2 loop
      across:=(3-2*side)*1.02*cos(roll);
      for i in 1:size(stations,1) loop
        along:=stations[i]*cos(pitch)+(3-2*side)*1.02*sin(roll)*sin(pitch);
        x:=east+c*along-s*across;y:=north+s*along+c*across;
        samples[side,i]:=if enabled>.5 then tide+Wreck.Perception.seaHeight(field,x,y) else baseHeight;
      end for;
    end for;
  end samplePontoons;
  discrete Real contactFlag(start=0,fixed=true);
  Real markRange,buoyTraffic[3,9],finishAlong,finishAcross;
  Real goal[2],windward[2],crosswind[2],startLine[2],turnPoint[2],turnHeading;
  final parameter Real startBearing=prevailing+Modelica.Constants.pi;
  Real courseUp[2],courseSide[2];

  discrete Real course(start=initialHeading,fixed=true),owed(start=initialPenalty,fixed=true),arc(start=0,fixed=true);
  discrete Real turnSide(start=1,fixed=true),headingBefore(start=initialHeading,fixed=true);
  Real contact[10];
  discrete Real contactMemory[10](each start=0,each fixed=true);
  discrete Real oldMark(start=0,fixed=true);
  discrete Boolean turning(start=false,fixed=true),finishReady(start=false,fixed=true);
  Regatta race(externalCourse=externalCourse,coursePoints=coursePoints,utc=utc,raceStart=raceStart,east=east,north=north,finishAllowed=if owed<.5 then 1 else 0,
    gateEast=gateEast,gateNorth=gateNorth,lineLength=lineLength,windBearing=prevailing,tide=background,landingReaction=zeros(6),
    wakeTile=zeros(64,64),backgroundTile=zeros(32,32),driftEast=0,driftNorth=0,swellHeight=0,
    racerState={1,heading,boat.heel,boat.pitch,boat.heave,ve,vn,yawRate,boat.vertical,boat.rollRate,boat.pitchRate},
    hullStations={-2.520,-1.9,-.9,.15,1.12,1.95,2.520},hullWidths={.09,.156,.185,.184,.155,.093,.009},hullOffset=1.02);
initial equation
  boat.heave=background+.17+swellSample[1]*incidentSea*
    sin(swellSample[2]+swellSample[3]*initialEast+swellSample[4]*initialNorth);
equation
  swellNumber=max(.0001,sqrt(swellSample[3]^2+swellSample[4]^2));
  swellFrequency=max(.0001,swellSample[5]);
  forwardX=cos(heading);forwardY=sin(heading);lateralX=-forwardY;lateralY=forwardX;
  background=if incidentSea>.5 then seaTide+Wreck.Perception.seaHeight(seaTile,east,north) else seaHeight;
  incidentRoll=if incidentSea>.5 then atan(.5*(Wreck.Perception.seaHeight(seaTile,east+lateralX,north+lateralY)
    -Wreck.Perception.seaHeight(seaTile,east-lateralX,north-lateralY))) else seaRoll;
  incidentPitch=if incidentSea>.5 then -atan(.5*(Wreck.Perception.seaHeight(seaTile,east+forwardX,north+forwardY)
    -Wreck.Perception.seaHeight(seaTile,east-forwardX,north-forwardY))) else seaPitch;
  for h in 1:2 loop
    for j in 1:6 loop
      coarseSection[h,j]=.5*(sectionSample[h,2*j-1]+sectionSample[h,2*j]);
      coarsePrevious[h,j]=.5*(sectionPrevious[h,2*j-1]+sectionPrevious[h,2*j]);
    end for;
  end for;
  when sample(0,.10) then
    sectionSample=samplePontoons(seaTile,seaTide,east,north,heading,boat.heel,boat.pitch,seaHeight,incidentSea,boat.hydroStationGeometry[:,1]);
    sectionPrevious=if initial() then sectionSample else pre(sectionSample);
    sectionTime=time;
  end when;
  east=boat.east;north=boat.north;heading=boat.heading;speed=boat.surge;yawRate=boat.yawRate;
  ve=boat.ve;vn=boat.vn;
  contact=cat(1,boat.peerContact,boat.sceneContact);
  wind=sqrt(windEast^2+windNorth^2);
  upwind=if wind>.05 then atan2(-windNorth,-windEast) else startBearing;
  windward={cos(upwind),sin(upwind)};
  crosswind={-windward[2],windward[1]};
  // Allow each NPC its own lane, while favouring the upwind end of a biased line.
  courseUp=race.lineUp;courseSide=-race.lineRight;
  startLine=race.gateCenter+courseSide*min(.38*race.span,max(-.38*race.span,lane+.07*race.span*(courseSide*windward)));
  finishAlong=({east,north}-race.gateCenter)*courseUp;
  finishAcross=({east,north}-race.gateCenter)*courseSide;
  along=({east,north}-startLine)*courseUp;
  across=({east,north}-startLine)*courseSide;
  seconds=max(0,raceStart-utc);
  turnPoint={east,north}-12*windward+4*crosswind;
  goal=if owed>.5 and not turning then turnPoint
    elseif race.earlyStart>.5 then startLine-18*courseUp
    elseif race.stage==0 and seconds>27 then startLine-40*courseUp-13*courseSide
    elseif race.stage==0 or race.stage==1 then
      (if along>1 then startLine-18*courseUp else startLine+14*courseUp)
    elseif race.stage==4 then race.gateCenter+courseUp*(if finishReady then -26 else 22)
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
  raceStatus={race.stage,race.elapsed,race.lapTime,race.heatStart,owed,arc*180/Modelica.Constants.pi};
  when sample(0,.2) then
    contactFlag=if pre(race.stage)<5 then SailingTactics.newBreach({east,north},heading,upwind,traffic,contact,pre(contactMemory),markLoad,pre(oldMark)) else 0;
    finishReady=if race.stage<>4 or finishAlong< -5 then false
      elseif finishAlong>5 and abs(finishAcross)<race.span*.31 then true else pre(finishReady);
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
