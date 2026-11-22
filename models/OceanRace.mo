partial model OceanRace "Shared dynamics for the Hobie, sea, wind and race committee"
  parameter Boolean hobie=true "Choose the hull configuration at translation";
  parameter Real prevailingBearing=atan2(4,10);
  parameter Real swellK=Wreck.SpectralSea.swellK,swellBearing=Wreck.SpectralSea.swellBearing;
  final parameter Real swellOmega=sqrt(Wreck.g*swellK*tanh(swellK*boatWater.waterDepth));
  input Real seaClockOffset(start=0) "Shared incident sea time minus vehicle simulation time [s]";
  input Real omitWake(start=0);
  input Real peerWake[4,38](each start=0);
  input Real windAnchor[5](each start=0);
  input Real windSpeed(start=11),windBearing(start=prevailingBearing),seaState,epoch;
  input Real sailingManual(start=1),rudder,trim,vang(start=.5),downhaul(start=.5),outhaul(start=.65),deckManual,mainCar,jibCar,jibSheet;
  input Real manualJibAssist(start=1);
  input Real ballastManual,ballastX,ballastY,traffic[4,9];
  Real sailLandingWrench[6],committeeLandingWrench[6],windProbe[2];
  input Real swimmerWater[15](each start=0) "Local swimmer-wave elevations at twelve hull panels, centre elevation, forward and port slopes";
  input Real animalTraffic[10,9](each start=0);
  input Real animals[2,6](each start=0);
  discrete Real animalWrench[6](each start=0,each fixed=true);
  Sailboat boat(seaClockOffset=seaClockOffset,catamaran=hobie,droneLoad=sailLandingWrench+race.racerLoad+animalWrench,mass=if hobie then 205 else 64,
    launchHeight=if hobie then .2 else .069,ballastMass=if hobie then 60 else 0,
    halfSpacing=if hobie then 1.02 else 0,deckZ=if hobie then .23 else .077,
    centerMassX=if hobie then -.28 else -.14846,
    stationX=if hobie then {-2.520,-1.9,-.9,.15,1.12,1.95,2.520} else {-1.1,-.82,-.3,.18,.63,.98,1.22},
    beamHalf=if hobie then {.09,.156,.185,.184,.155,.093,.009} else {.22,.29,.335,.32,.235,.12,.01},
    spans=if hobie then {7.15,4.56} else {2.6,2.12},feet=if hobie then {2.78,1.98} else {1.28,.60},
    forestaySlope=if hobie then 1.82/5.1 else 1.04/2.69,
    yawInertia=if hobie then 315 else 19,
    rollInertia=if hobie then 520 else 28,pitchInertia=if hobie then 625 else 12,
    foilX=if hobie then {.15,-2.42,.15,-2.42} else {.06,-.93,0,0},
    foilY=if hobie then {1.02,1.02,-1.02,-1.02} else zeros(4),
    foilArea=if hobie then {.62,.11,.62,.11} else {.115,.044,0,0},
    aspect=if hobie then {.65,3.4,.65,3.4} else {3.5,2.6,1,1},
    raceGoal={1,race.pilotTarget[1],race.pilotTarget[2]},manualHelm=sailingManual,rudderInput=rudder,trimInput=trim,vangInput=vang,downhaulInput=downhaul,outhaulInput=outhaul,
    deckManual=deckManual,mainCarInput=mainCar,jibCarInput=jibCar,jibTrimInput=jibSheet,manualJibAssist=manualJibAssist,reachTrial=0,
    ballastManual=ballastManual,ballastCmdX=ballastX,ballastCmdY=ballastY,traffic=traffic,
    windEast=wind.localEast,windNorth=wind.localNorth,currentEast=boatWater.meanFlow[1],currentNorth=boatWater.meanFlow[2],
    orbitalEast=boatWater.velocity[1]-boatWater.meanFlow[1],orbitalNorth=boatWater.velocity[2]-boatWater.meanFlow[2],orbitalUp=boatWater.velocity[3],
    useSectionWater=1,sectionWater=surfaceSections,previousWater=priorSections,waterStamp=sectionStamp,
    useRefinedSectionWater=hobie,refinedSectionWater=hydroSurfaceSamples,previousRefinedSectionWater=priorHydroSamples,
    waveHeight=boatWater.surface+swimmerWater[13],wavePitch=-atan(swimmerWater[14]+boatWater.surfaceSlope*{cos(boat.heading),sin(boat.heading)}),
    waveRoll=atan(swimmerWater[15]+boatWater.surfaceSlope*{-sin(boat.heading),cos(boat.heading)}),
    swellK=swellK,swellBearing=swellBearing,swellOmega=swellOmega,swellAmplitude=Wreck.SpectralSea.swellHeight(seaState),
    wakeEast=waves.waveLoad[1],wakeNorth=waves.waveLoad[2],wakeYaw=waves.waveLoad[3]);
  MarineWind wind(phaseOffset=seaClockOffset,advectionAnchor=windAnchor,meanEast=windSpeed*cos(windBearing),meanNorth=windSpeed*sin(windBearing),
    east=boat.east,north=boat.north,droneEast=windProbe[1],droneNorth=windProbe[2]);
  WakeSpectrum waves(sharedDrift=true,omitWake=omitWake,peers=peerWake,seaClockOffset=seaClockOffset,east=boat.east,north=boat.north,heading=boat.heading,heel=boat.heel,pitch=boat.pitch,
    stations=boat.stationX,separation=boat.halfSpacing,volume=boat.sectionVolume,beamHalf=boat.beamHalf,
    currentEast=boatWater.profile[1,2],currentNorth=boatWater.profile[1,3],windEast=0,windNorth=0,seaAmplitude=0);
  Wreck.Ocean boatWater(seaClockOffset=seaClockOffset,seaState=seaState,pos={boat.east,boat.north,boat.heave},windSpeed=windSpeed,windDirection=windBearing);
  Regatta race(racerState={1,boat.heading,boat.heel,boat.pitch,boat.heave,boat.ve,boat.vn,boat.yawRate,boat.vertical,boat.rollRate,boat.pitchRate},
    hullStations=boat.stationX,hullWidths=boat.beamHalf,hullOffset=boat.halfSpacing,seaClockOffset=seaClockOffset,swellK=swellK,swellBearing=swellBearing,swellOmega=swellOmega,landingReaction=committeeLandingWrench,wakeTile=waves.height,hullWaveTile=waves.wakeHeight,backgroundTile=boatWater.tile,driftEast=waves.driftE,driftNorth=waves.driftN,
    tide=boatWater.tide,swellHeight=boat.swellAmplitude,windBearing=prevailingBearing,utc=epoch+time,east=boat.east,north=boat.north,
    bowSources=bowSources,bowFrame=bowFrame,bowSpeed=bowSpeed);
  discrete output Real bowSources[14,6](each start=0,each fixed=true) "Bound near-hull flow from immersed cross sections";
  discrete output Real bowSpeed[2](each start=0,each fixed=true) "Water-relative boat velocity in the moving frame";
  discrete output Real bowFrame[4](each start=0,each fixed=true) "East, north, cosine and sine of heading, or zeros when disabled";
  discrete output Real surfaceSections[2,6](each start=0,each fixed=true)
    "Tide, background sea, local wind waves and hull wake at each buoyancy strip [m]";
  discrete output Real hydroSurfaceProbes[2,boat.hydroPanelCount,3](each start=0,each fixed=true)
    "East, north and complete elevation of the native hull probes at the sample instant [m]";
  discrete Real hydroSurfaceSamples[2,boat.hydroPanelCount](each start=0,each fixed=true);
  discrete Real priorHydroSamples[2,boat.hydroPanelCount](each start=0,each fixed=true);
  discrete Real priorSections[2,6](each start=0,each fixed=true),sectionStamp(start=0,fixed=true);
  Real stripAlong[2,6],stripAcross[2];
  Real hydroAlong[2,boat.hydroPanelCount];
  function sampleHydroSurface
    input Real along[:,:],across[2],east,north,heading,driftE,driftN,wakePeriod,tide;
    input Real windGrid[32,32],wakeGrid[64,64],swimmer[15],oldSurface[2,6],stations[7],nativeX[size(along,2)];
    input Real swellWave[2],swellPhase,swellAmplitude;
    input Boolean refine;
    output Real sampled[2,size(along,2)],probes[2,size(along,2),3];
  protected
    Real c,s,x,y;
  algorithm
    c:=cos(heading);s:=sin(heading);
    for hull in 1:2 loop
      for panel in 1:size(along,2) loop
        x:=east+c*along[hull,panel]-s*across[hull];
        y:=north+s*along[hull,panel]+c*across[hull];
        sampled[hull,panel]:=if refine then tide
          +Regatta.elevationAt(wakeGrid,x-driftE,y-driftN,wakePeriod)
          +Wreck.Perception.seaHeight(windGrid,x,y)
          +Sailboat.samplePanelWater({swimmer[(hull-1)*6+i] for i in 1:6},stations,nativeX[panel])
          else oldSurface[hull,min(6,panel)];
        probes[hull,panel,:]:={x,y,sampled[hull,panel]+swellAmplitude*sin(x*swellWave[1]+y*swellWave[2]+swellPhase)};
      end for;
    end for;
  end sampleHydroSurface;
equation
  when sample(0,.025) then
    animalWrench=WildlifeContact(animals,{boat.east,boat.north,boat.heave,boat.heel,boat.pitch,boat.heading},
      {boat.ve,boat.vn,boat.yawRate},boat.totalMass,if hobie then 5.04 else 2.32,
      if hobie then .18 else .33,boat.halfSpacing,if hobie then .25 else .28,animalTraffic);
  end when;
  for hull in 1:2 loop
    stripAcross[hull]=(3-2*hull)*boat.halfSpacing*cos(boat.heel);
    for panel in 1:6 loop
      stripAlong[hull,panel]=.5*(boat.stationX[panel]+boat.stationX[panel+1])*cos(boat.pitch)
        +(3-2*hull)*boat.halfSpacing*sin(boat.heel)*sin(boat.pitch);
    end for;
    for panel in 1:boat.hydroPanelCount loop
      hydroAlong[hull,panel]=boat.hydroStationGeometry[panel,1]*cos(boat.pitch)
        +(3-2*hull)*boat.halfSpacing*sin(boat.heel)*sin(boat.pitch);
    end for;
  end for;
  when sample(0,.1) then
    bowFrame=if hobie and omitWake<.5 then {boat.east,boat.north,cos(boat.heading),sin(boat.heading)} else zeros(4);
    bowSpeed=if hobie and omitWake<.5 then
      {bowFrame[3]*(boat.ve-waves.currentEast)+bowFrame[4]*(boat.vn-waves.currentNorth),
       bowFrame[3]*(boat.vn-waves.currentNorth)-bowFrame[4]*(boat.ve-waves.currentEast)} else zeros(2);
    bowSources=if hobie and omitWake<.5 then BowWavePatch.hullSources(
      bowSpeed,BowWavePatch.localStrips(waves.sourceStrips,bowFrame),boat.stationX,boat.beamHalf,separatedStern=true) else zeros(14,6);
    for hull in 1:2 loop
      for panel in 1:6 loop
        surfaceSections[hull,panel]=swimmerWater[(hull-1)*6+panel]+waves.sectionHeight[hull,panel]+boatWater.tide+
          Wreck.Perception.seaHeight(boatWater.tile,
            boat.east+cos(boat.heading)*stripAlong[hull,panel]-sin(boat.heading)*stripAcross[hull],
            boat.north+sin(boat.heading)*stripAlong[hull,panel]+cos(boat.heading)*stripAcross[hull]);
      end for;
    end for;
    (hydroSurfaceSamples,hydroSurfaceProbes)=sampleHydroSurface(
      hydroAlong,stripAcross,boat.east,boat.north,boat.heading,waves.driftE,waves.driftN,waves.period,boatWater.tide,
      boatWater.tile,waves.height,swimmerWater,surfaceSections,boat.stationX,boat.hydroStationGeometry[:,1],
      swellK*{cos(swellBearing),sin(swellBearing)},-swellOmega*(time+seaClockOffset),boat.swellAmplitude,hobie);
    priorSections=if initial() then surfaceSections else pre(surfaceSections);
    priorHydroSamples=if initial() then hydroSurfaceSamples else pre(hydroSurfaceSamples);
    sectionStamp=time;
  end when;
end OceanRace;
