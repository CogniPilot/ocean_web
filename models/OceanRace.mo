partial model OceanRace "Shared dynamics for the Hobie, sea, wind and race committee"
  parameter Boolean hobie=true "Choose the hull configuration at translation";
  parameter Real prevailingBearing=atan2(4,10);
  parameter Real swellK=Wreck.SpectralSea.swellK;
  final parameter Real swellOmega=sqrt(Wreck.g*swellK*tanh(swellK*boatWater.waterDepth));
  input Real seaClockOffset(start=0) "Shared incident sea time minus vehicle simulation time [s]";
  input Real omitWake(start=0);
  input Real peerWake[4,38](each start=0);
  input Real windAnchor[5](each start=0);
  input Real windSpeed(start=11),windBearing(start=prevailingBearing),seaState,epoch;
  input Real sailingManual(start=1),rudder,trim,vang(start=.5),downhaul(start=.5),deckManual,mainCar,jibCar,jibSheet;
  input Real ballastManual,ballastX,ballastY,traffic[4,9];
  Real sailLandingWrench[6],committeeLandingWrench[6],windProbe[2];
  Sailboat boat(seaClockOffset=seaClockOffset,catamaran=hobie,droneLoad=sailLandingWrench,mass=if hobie then 205 else 64,
    launchHeight=if hobie then .2 else .069,ballastMass=if hobie then 60 else 0,
    halfSpacing=if hobie then 1.02 else 0,deckZ=if hobie then .23 else .077,
    centerMassX=if hobie then -.28 else -.14846,
    stationX=if hobie then {-2.555,-1.9,-.9,.15,1.12,1.95,2.555} else {-1.1,-.82,-.3,.18,.63,.98,1.22},
    beamHalf=if hobie then {.09,.156,.185,.184,.155,.093,.009} else {.22,.29,.335,.32,.235,.12,.01},
    spans=if hobie then {7.15,4.56} else {2.6,2.12},feet=if hobie then {2.78,1.98} else {1.28,.60},
    mainRoach=if hobie then .82 else 0,forestaySlope=if hobie then 1.82/5.1 else 1.04/2.69,
    footX=if hobie then {.44,2.26} else {.12,1.16-.10*1.04/2.69},
    footZ=if hobie then {.97,.75} else {.19,.19},yawInertia=if hobie then 315 else 19,
    rollInertia=if hobie then 520 else 28,pitchInertia=if hobie then 625 else 12,
    foilX=if hobie then {.15,-2.42,.15,-2.42} else {.06,-.93,0,0},
    foilY=if hobie then {1.02,1.02,-1.02,-1.02} else zeros(4),
    foilArea=if hobie then {.62,.11,.62,.11} else {.115,.044,0,0},
    aspect=if hobie then {.65,3.4,.65,3.4} else {3.5,2.6,1,1},
    manualHelm=sailingManual,rudderInput=rudder,trimInput=trim,vangInput=vang,downhaulInput=downhaul,
    deckManual=deckManual,mainCarInput=mainCar,jibCarInput=jibCar,jibTrimInput=jibSheet,reachTrial=0,
    ballastManual=ballastManual,ballastCmdX=ballastX,ballastCmdY=ballastY,traffic=traffic,
    windEast=wind.localEast,windNorth=wind.localNorth,currentEast=boatWater.meanFlow[1],currentNorth=boatWater.meanFlow[2],
    orbitalEast=boatWater.velocity[1]-boatWater.meanFlow[1],orbitalNorth=boatWater.velocity[2]-boatWater.meanFlow[2],orbitalUp=boatWater.velocity[3],
    useSectionWater=1,sectionWater=surfaceSections,previousWater=priorSections,waterStamp=sectionStamp,
    waveHeight=boatWater.surface,wavePitch=-atan(boatWater.surfaceSlope*{cos(boat.heading),sin(boat.heading)}),
    waveRoll=atan(boatWater.surfaceSlope*{-sin(boat.heading),cos(boat.heading)}),
    swellK=swellK,swellOmega=swellOmega,swellAmplitude=Wreck.SpectralSea.swellHeight(seaState),
    wakeEast=waves.waveLoad[1],wakeNorth=waves.waveLoad[2],wakeYaw=waves.waveLoad[3]);
  MarineWind wind(phaseOffset=seaClockOffset,advectionAnchor=windAnchor,meanEast=windSpeed*cos(windBearing),meanNorth=windSpeed*sin(windBearing),
    east=boat.east,north=boat.north,droneEast=windProbe[1],droneNorth=windProbe[2]);
  WakeSpectrum waves(sharedDrift=true,omitWake=omitWake,peers=peerWake,seaClockOffset=seaClockOffset,east=boat.east,north=boat.north,heading=boat.heading,heel=boat.heel,pitch=boat.pitch,
    stations=boat.stationX,separation=boat.halfSpacing,volume=boat.sectionVolume,beamHalf=boat.beamHalf,
    currentEast=boatWater.profile[1,2],currentNorth=boatWater.profile[1,3],windEast=0,windNorth=0,seaAmplitude=0);
  Wreck.Ocean boatWater(seaClockOffset=seaClockOffset,seaState=seaState,pos={boat.east,boat.north,boat.heave},windSpeed=windSpeed,windDirection=windBearing);
  Regatta race(seaClockOffset=seaClockOffset,swellK=swellK,swellOmega=swellOmega,landingReaction=committeeLandingWrench,wakeTile=waves.height,hullWaveTile=waves.wakeHeight,backgroundTile=boatWater.tile,driftEast=waves.driftE,driftNorth=waves.driftN,
    tide=boatWater.tide,swellHeight=boat.swellAmplitude,windBearing=prevailingBearing,utc=epoch+time,east=boat.east,north=boat.north,
    bowSources=bowSources,bowFrame=bowFrame,bowSpeed=bowSpeed);
  discrete output Real bowSources[14,6](each start=0,each fixed=true) "Bound near-hull flow from immersed cross sections";
  discrete output Real bowSpeed[2](each start=0,each fixed=true) "Water-relative boat velocity in the moving frame";
  discrete output Real bowFrame[4](each start=0,each fixed=true) "East, north, cosine and sine of heading, or zeros when disabled";
  discrete output Real surfaceSections[2,6](each start=0,each fixed=true)
    "Tide, background sea, local wind waves and hull wake at each buoyancy strip [m]";
  discrete Real priorSections[2,6](each start=0,each fixed=true),sectionStamp(start=0,fixed=true);
  Real stripAlong[2,6],stripAcross[2];
equation
  for hull in 1:2 loop
    stripAcross[hull]=(3-2*hull)*boat.halfSpacing*cos(boat.heel);
    for panel in 1:6 loop
      stripAlong[hull,panel]=.5*(boat.stationX[panel]+boat.stationX[panel+1])*cos(boat.pitch)
        +(3-2*hull)*boat.halfSpacing*sin(boat.heel)*sin(boat.pitch);
    end for;
  end for;
  when sample(0,.1) then
    bowFrame=if hobie and omitWake<.5 then {boat.east,boat.north,cos(boat.heading),sin(boat.heading)} else zeros(4);
    bowSpeed=if hobie and omitWake<.5 then
      {bowFrame[3]*(boat.ve-waves.currentEast)+bowFrame[4]*(boat.vn-waves.currentNorth),
       bowFrame[3]*(boat.vn-waves.currentNorth)-bowFrame[4]*(boat.ve-waves.currentEast)} else zeros(2);
    bowSources=if hobie and omitWake<.5 then BowWavePatch.hullSources(
      bowSpeed,BowWavePatch.localStrips(waves.sourceStrips,bowFrame),boat.stationX,boat.beamHalf) else zeros(14,6);
    for hull in 1:2 loop
      for panel in 1:6 loop
        surfaceSections[hull,panel]=waves.sectionHeight[hull,panel]+boatWater.tide+
          Wreck.Perception.seaHeight(boatWater.tile,
            boat.east+cos(boat.heading)*stripAlong[hull,panel]-sin(boat.heading)*stripAcross[hull],
            boat.north+sin(boat.heading)*stripAlong[hull,panel]+cos(boat.heading)*stripAcross[hull]);
      end for;
    end for;
    priorSections=if initial() then surfaceSections else pre(surfaceSections);
    sectionStamp=time;
  end when;
end OceanRace;
