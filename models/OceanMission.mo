partial model OceanMission "Sea, wind and anchored race course for one local vehicle"
  parameter Real prevailingBearing=atan2(4,10);
  parameter Real swellK=.34,swellBearing=1.04159;
  input Real seaClockOffset(start=0),omitWake(start=0),peerWake[4,38](each start=0),windAnchor[5](each start=0);
  input Real windSpeed(start=11),windBearing(start=prevailingBearing),seaState,epoch;
  Real focus[3],committeeLoad[6];
  output Real swell[4] "Amplitude, phase at ENU origin, east and north wavevector";
  MarineWind wind(phaseOffset=seaClockOffset,advectionAnchor=windAnchor,
    meanEast=windSpeed*cos(windBearing),meanNorth=windSpeed*sin(windBearing),
    east=focus[1],north=focus[2],droneEast=focus[1],droneNorth=focus[2]);
  Wreck.Ocean boatWater(seaClockOffset=seaClockOffset,pos=focus,windSpeed=windSpeed,windDirection=windBearing);
  WakeSpectrum waves(sharedDrift=true,localHull=false,omitWake=omitWake,peers=peerWake,seaClockOffset=seaClockOffset,
    east=focus[1],north=focus[2],heading=0,heel=0,pitch=0,
    stations={-2.555,-1.9,-.9,.15,1.12,1.95,2.555},
    beamHalf=zeros(7),separation=0,volume=zeros(2,6),
    currentEast=boatWater.profile[1,2],currentNorth=boatWater.profile[1,3],
    windEast=wind.meanEast,windNorth=wind.meanNorth,seaAmplitude=seaState);
  Regatta race(seaClockOffset=seaClockOffset,landingReaction=committeeLoad,wakeTile=waves.height,hullWaveTile=waves.wakeHeight,
    backgroundTile=boatWater.tile,driftEast=waves.driftE,driftNorth=waves.driftN,
    tide=boatWater.tide,swellHeight=swell[1],windBearing=prevailingBearing,utc=epoch+time,
    east=focus[1],north=focus[2]);
  discrete output Real waterStamp(start=0,fixed=true);
  output Real waterFraction;
equation
  swell={.3*seaState,-sqrt(9.80665*swellK)*(time+seaClockOffset),swellK*cos(swellBearing),swellK*sin(swellBearing)};
  when sample(0,.1) then
    waterStamp=time;
  end when;
  waterFraction=min(1,max(0,(time-waterStamp)/.1));
end OceanMission;
