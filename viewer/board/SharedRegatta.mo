model SharedRegatta "Fleet course using the coupled world's sampled surface grids"
  extends RegattaBase(redeclare discrete input Real wakeTile[64,64],
    redeclare discrete input Real hullWaveTile[64,64],
    redeclare discrete input Real backgroundTile[32,32]);
  outer WakeSpectrum waves;
  outer Wreck.Ocean boatWater;
equation
  when sample(0,waves.dt) then
    wakeTile=waves.height;
    hullWaveTile=waves.wakeHeight;
  end when;
  // WaterColumn computes its spectral tile every 0.2 s.
  when sample(0,.2) then
    backgroundTile=boatWater.tile;
  end when;
end SharedRegatta;
