// Scenario initial conditions in east/north metres. Modelica uses the same gate
// for the visible marks, contact forces and crossing score.
export const windBearing = Math.PI / 2;
export const windSpeed = 10 * 1852 / 3600;
export const startGate = {gateEast: -10, gateNorth: -6.5, lineLength: 64};

export function sailingStart(catamaran, courseBearing = windBearing, weatherBearing = courseBearing) {
  const downwind = 14;
  const sloopAngle = 48 * Math.PI / 180;
  // Start the Hobie abeam of the committee boat, with room to reach along the prestart side.
  // The sloop approaches a point 8 m off the middle of the line.
  const alongLine = catamaran ? startGate.lineLength / 2 : 8 + downwind * Math.tan(sloopAngle);
  return {
    launchEast: startGate.gateEast + downwind * Math.cos(courseBearing) - alongLine * Math.sin(courseBearing),
    launchNorth: startGate.gateNorth + downwind * Math.sin(courseBearing) + alongLine * Math.cos(courseBearing),
    launchHeading: catamaran ? weatherBearing - Math.PI / 2 : courseBearing - Math.PI + sloopAngle,
    launchSpeed: catamaran ? 2.4 : 1.2
  };
}
