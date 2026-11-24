model Iihr5512Bow "Build the 5512 tow sources for the viewer's BowWavePatch component"
  input Real stations[7](start={-1.5,-1,-.5,0,.5,1,1.5}),beamHalf[7],volume[2,6],towSpeed;
  output Real sources[14,6];
equation
  sources=BowWavePatch.hullSources({towSpeed,0},
    WakeSpectrum.hullSource(0,0,0,0,0,stations,0,volume),stations,beamHalf);
end Iihr5512Bow;
