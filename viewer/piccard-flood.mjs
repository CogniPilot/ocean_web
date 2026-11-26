// Compatibility for FMUs predating the dedicated flooding input. The real
// plant still integrates hull/contact forces, with a downward heave command
// approximating the extra weight when the vehicle is close to level.
export function legacyFloodFraction(previous, depth, seconds) {
  const head = Math.max(0, depth);
  const immersed = Math.min(1, head / .2);
  const fillRate = .62 * .000030 * immersed * Math.sqrt(2 * 9.80665 * head) / .0032;
  return 1 - (1 - previous) * Math.exp(-fillRate * Math.max(0, seconds));
}
export function floodedMass(fraction) {
  return 1025 * .0032 * fraction;
}
export function legacyFloodHeave(mass) {
  return -mass * 9.80665 / 24;
}
