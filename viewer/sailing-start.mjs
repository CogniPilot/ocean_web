// Scenario initial conditions in ENU. The gate centre matches Regatta.mo.
export const windBearing = Math.PI / 2;
export const windSpeed = 11;
export function sailingStart(catamaran) {
  const heading = (catamaran ? -15 : -32) * Math.PI / 180;
  return {
    launchEast: -10 - 5.5 * Math.cos(heading),
    launchNorth: -6.5 - 5.5 * Math.sin(heading),
    launchHeading: heading,
    launchSpeed: catamaran ? 2.4 : 1.2
  };
}
