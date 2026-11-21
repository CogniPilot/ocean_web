// Flat-water true-wind sweep using the released standalone Hobie FMU.
// node scripts/profile-hobie-speed.mjs [wind in m/s] [sheet payout in m | auto]
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const wind = Number(process.argv[2] ?? 11);
const automatic = !process.argv[3] || process.argv[3] === 'auto';
const payout = automatic ? 0 : Number(process.argv[3]);
if (!(wind > 0) || !Number.isFinite(wind) || !(automatic || payout >= .012 && payout <= .59)) {
  throw Error('Expected positive wind speed and auto or payout from .012 to .59 m');
}
const read = async url => new Response(await readFile(url));
const course = -2.1; // Fixed heading used by reachTrial in Sailboat.mo.
const clamp = value => Math.max(-1, Math.min(1, value));
const degrees = radians => radians * 180 / Math.PI;
const wrap = radians => Math.atan2(Math.sin(radians), Math.cos(radians));
console.log('TWA_deg,kn_at_5s,mean_kn_last30s,peak_kn,mean_abs_heading_error_deg,mean_drive_N,mean_skin_drag_N,mean_axial_foil_N');
for (const angle of [45, 60, 75, 80, 90, 100, 110, 120, 130, 140, 150]) {
  const bearing = course + angle * Math.PI / 180 + Math.PI;
  const boat = await loadInstance('Hobie16', {
    launchEast: -1200, launchNorth: -1200, launchHeading: course, launchHeight: .2, launchSpeed: 0,
    windEast: wind * Math.cos(bearing), windNorth: wind * Math.sin(bearing), currentEast: 0, currentNorth: 0,
    downhaulInput: .5, manualHelm: Number(!automatic), reachTrial: 1
  }, read);
  let knotsAtFive, peak = 0, count = 0, speedSum = 0, errorSum = 0, drive = 0, skin = 0, foil = 0;
  for (let step = 1; step <= 9000; step++) {
    if (!automatic && step % 10 === 1) {
      const [heading, rate, paid] = boat.getMany(['heading', 'yawRate', 'payout']);
      boat.set('rudderInput', clamp((1.35 * wrap(course - heading) - .45 * rate) / .54));
      boat.set('trimInput', clamp((payout - paid) / .024));
    }
    boat.advance(.01);
    if (step % 20) continue;
    const [surge, sway, heading, sails, friction, foils] = boat.getMany([
      'surge', 'sway', 'heading', 'sailForward', 'skinDrag', 'foilAxial'
    ]);
    const knots = Math.hypot(surge, sway) * 3600 / 1852;
    peak = Math.max(peak, knots);
    if (step === 500) knotsAtFive = knots;
    if (step <= 6000) continue;
    count++;
    speedSum += knots;
    errorSum += degrees(Math.abs(wrap(course - heading)));
    drive += sails[0] + sails[1];
    skin += friction;
    foil += foils.reduce((sum, force) => sum + force, 0);
  }
  console.log([angle, knotsAtFive, speedSum/count, peak, errorSum/count, drive/count, skin/count, foil/count]
    .map(value => value.toFixed(2)).join(','));
}
