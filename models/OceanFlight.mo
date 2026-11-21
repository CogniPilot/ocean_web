model OceanFlight "RDD2 with marine weather, immersion and landing contact"
  extends OceanMission;
  input Real flightManual(start=1),flightPilot[4],motorCut;
  input Real station[2](start={-5,0});
  input Real peerDeck[14] "Active, catamaran flag, then ENU deck state";
  Rdd2Survey drone(sailDeckEnabled=peerDeck[1],isCatamaran=peerDeck[2],sailDeckState=peerDeck[3:14],
    deckEnabled=1,deckState=race.deckState,windENU=wind.droneWind,currentENU=boatWater.velocity,
    waterLevel=boatWater.surface+waterOffset,pilot=flightManual,forward=flightPilot[1],
    left=flightPilot[2],climb=flightPilot[3],turn=flightPilot[4],
    stationEast=station[1],stationNorth=station[2],motorCut=motorCut);
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
