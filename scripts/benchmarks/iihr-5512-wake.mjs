import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const rows = ['period_m,dt_s,x_from_bow_over_length,y_m,measurement_m,prediction_m'];
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

const cases = [[64, 0.1], [20, 0.05], [12, 0.05], [8, 0.05], [12, 0.025]];
const measured = gauges.map(gauge => gauge[2]);
for (const [period, dt] of cases) {
  const wake = await loadInstance('WakeSpectrum', {
    ...geometry, separation: 0, heading: 0, depth, period, dt,
  }, read);
  let distance = 0;
  const sums = gauges.map(() => 0);
  const drags = [];
  for (let i = 1; i <= Math.round(runSeconds / dt); ++i) {
    const time = i * dt;
    distance += speed * Math.min(1, time / 2) * dt;
    wake.set('east', distance);
    wake.advance(dt);
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
  console.log(JSON.stringify({
    period_m: period,
    dt_s: dt,
    speed_m_s: speed,
    samples,
    rmse_m: rms(residuals),
    bias_m: mean(residuals),
    measured_m: [Math.min(...measured), Math.max(...measured)],
    predicted_m: [Math.min(...computed), Math.max(...computed)],
    wave_resistance_N: mean(drags),
  }));
  gauges.forEach(([x, y, z], index) => {
    rows.push([period, dt, 0.5 - x / length, y, z, computed[index]].join(','));
  });
}
await writeFile(join(directory, 'profile-comparison.csv'), rows.join('\n') + '\n');
