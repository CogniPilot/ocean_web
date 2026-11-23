// Scenario initial conditions in east/north metres. Modelica uses the same gate
// for the visible marks, contact forces and crossing score.
export const windBearing = Math.PI / 2;
export const windSpeed = 10 * 1852 / 3600;
export const startGate = {gateEast: -10, gateNorth: -6.5, lineLength: 64};

export function sailingStart(catamaran, bearing = windBearing) {
  const offWind = (catamaran ? 52 : 48) * Math.PI / 180;
  const heading = bearing - Math.PI + offWind;
  // Allow room for leeway as the sails load during the approach.
  const aimOffset = catamaran ? 14 : 8;
  const approach = 14 / Math.cos(offWind);
  return {
    launchEast: startGate.gateEast - aimOffset * Math.sin(bearing) - approach * Math.cos(heading),
    launchNorth: startGate.gateNorth + aimOffset * Math.cos(bearing) - approach * Math.sin(heading),
    launchHeading: heading,
    launchSpeed: catamaran ? 2.4 : 1.2
  };
}
