model OceanFlight "RDD2 with marine weather, immersion and landing contact"
  extends OceanMission;
  input Real flightManual(start=1),flightPilot[4],motorCut;
  input Real flightMode(start=0),racePilot(start=0);
  input Real autoLand=0,landingCue[6]=zeros(6),landingRange[2]=zeros(2);
  input Real station[2](start={-5,0});
  input Real stationUp=5 "Autonomous waypoint altitude in ENU metres";
  input Real peerDeck[14] "Active, catamaran flag, then ENU deck state";
  input Real rotorWakeTraffic[4,12]=zeros(4,12),droneTraffic[4,14]=zeros(4,14);
  input Real vesselDecks[4,14]=zeros(4,14) "Nearby surface vessel deck pose and twist";
  Rdd2Survey drone(autoLand=autoLand,landingCue=landingCue,landingRange=landingRange,vesselDecks=vesselDecks,rotorWakeTraffic=rotorWakeTraffic,droneTraffic=droneTraffic,flightMode=flightMode,gpsDropout=0,sailDeckEnabled=peerDeck[1],isCatamaran=peerDeck[2],sailDeckState=peerDeck[3:14],
    deckEnabled=1,deckState=race.deckState,windENU=wind.droneWind,currentENU=boatWater.velocity,
    waterLevel=boatWater.surface+waterOffset,pilot=flightManual,forward=flightPilot[1],
    left=flightPilot[2],climb=flightPilot[3],turn=flightPilot[4],raceNavigation=racePilot,
    stationEast=if racePilot>.5 then race.pilotTarget[1] else station[1],stationNorth=if racePilot>.5 then race.pilotTarget[2] else station[2],stationUp=stationUp,motorCut=motorCut);
  Real waterOffset;
  discrete Real surfaceWake(start=0,fixed=true),priorWake(start=0,fixed=true);
equation
  focus=drone.position;
  committeeLoad=drone.deckWrench[7:12];
  waterOffset=(1-waterFraction)*priorWake+waterFraction*surfaceWake+swell[1]*sin(swell[2]+focus[1:2]*swell[3:4]);
  when sample(0,.1) then
    surfaceWake=Regatta.elevationAt(waves.height,focus[1]-waves.driftE,focus[2]-waves.driftN,waves.period);
    priorWake=if initial() then surfaceWake else pre(surfaceWake);
  end when;
end OceanFlight;
