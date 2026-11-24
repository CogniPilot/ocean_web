import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadInstance } from '../../viewer/fmi3/instance.mjs';

const directory = process.argv[2];
if (!directory) throw Error('Expected the prepared benchmark directory');

const geometry = JSON.parse(await readFile(join(directory, 'geometry.json')));
const gauges = JSON.parse(await readFile(join(directory, 'profile-probes.json')));
const read = async url => new Response(await readFile(url));
const length = 3.048;
const speed = 0.28 * Math.sqrt(9.80665 * length);
const depth = 3;
const runSeconds = 45;
const averageSeconds = 10;
const nearDirectory = process.argv[3];
const rows = ['period_m,dt_s,x_from_bow_over_length,y_m,measurement_m,prediction_m' +
  (nearDirectory ? ',near_field_m,combined_m' : '')];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const rms = values => Math.sqrt(mean(values.map(value => value * value)));

function sample(tile, period, east, north) {
  const size = Math.sqrt(tile.length);
  const u = east * size / period;
  const v = north * size / period;
  const col = Math.floor(u);
  const row = Math.floor(v);
  const a = u - col;
  const b = v - row;
  const wrap = index => (index % size + size) % size;
  const at = (i, j) => tile[wrap(j) * size + wrap(i)];
  return (1 - b) * ((1 - a) * at(col, row) + a * at(col + 1, row))
    + b * ((1 - a) * at(col, row + 1) + a * at(col + 1, row + 1));
}

const periods = [64, 20, 12, 8];
const measured = gauges.map(gauge => gauge[2]);
// The tow is steady and its measured running attitude is baked into the
// displaced sections. The local field is stationary in the hull frame.
let near;
if (nearDirectory) {
  const {loadInstance: loadSource} = await import(pathToFileURL(resolve(nearDirectory, 'instance.mjs')));
  const source = await loadSource('Iihr5512Bow', {...geometry, towSpeed: speed}, read);
  const bow = await loadInstance('BowWavePatch', {
    breakingBows: 1, singleBow: 1, relativeSpeed: [speed, 0], sources: source.get('sources'),
  }, read);
  const tile = bow.get('height');
  near = gauges.map(([x, y]) => sample(tile, bow.get('length'), x, y));
  if (!near.every(Number.isFinite) || !near.some(z => z > 0)) throw Error('Invalid 5512 near field');
}
for (const period of periods) {
  const wake = await loadInstance('WakeSpectrum', {
    ...geometry, separation: 0, heading: 0, depth, period,
  }, read);
  // Use the FMU’s own clock. A dt override can change the equations while
  // the compiled sample schedule continues ticking at the original interval.
  const dt = wake.get('dt');
  const stripOrigin = (geometry.stations[0] + geometry.stations[1]) / 2;
  let distance = 0;
  const sums = gauges.map(() => 0);
  const drags = [];
  for (let i = 1; i <= Math.round(runSeconds / dt); ++i) {
    const time = i * dt;
    distance += speed * Math.min(1, time / 2) * dt;
    wake.set('east', distance);
    wake.advance(dt);
    if (Math.abs(wake.get('sourceStrips')[0] - stripOrigin - distance) > 1e-8)
      throw Error('Wake field missed a tow step at ' + time + ' s');
    if (time > runSeconds - averageSeconds) {
      const field = wake.get('wakeHeight');
      gauges.forEach(([x, y], index) => {
        sums[index] += sample(field, period, x + distance, y);
      });
      drags.push(-wake.get('waveLoad')[0]);
    }
  }
  const samples = drags.length;
  const computed = sums.map(value => value / samples);
  const residuals = computed.map((value, index) => value - measured[index]);
  const combined = near && computed.map((z, i) => z + near[i]);
  console.log(JSON.stringify({
    period_m: period,
    dt_s: dt,
    speed_m_s: speed,
    samples,
    rmse_m: rms(residuals),
    bias_m: mean(residuals),
    measured_m: [Math.min(...measured), Math.max(...measured)],
    predicted_m: [Math.min(...computed), Math.max(...computed)],
    ...(combined && {combined_at_measured_crest_m: combined[measured.indexOf(Math.max(...measured))],
      combined_peak_x_over_L: 0.5 - gauges[combined.indexOf(Math.max(...combined))][0] / length,
      combined_peak_m: Math.max(...combined),
      combined_rmse_m: rms(combined.map((z, i) => z - measured[i]))}),
    wave_resistance_N: mean(drags),
  }));
  gauges.forEach(([x, y, z], index) => {
    rows.push([period, dt, 0.5 - x / length, y, z, computed[index],
      ...(near ? [near[index], combined[index]] : [])].join(','));
  });
}
await writeFile(join(directory, 'profile-comparison.csv'), rows.join('\n') + '\n');
