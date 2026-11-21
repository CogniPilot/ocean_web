// Compare the shipped physics in fresh processes, sequentially on the same CPU.
import {execFileSync} from 'node:child_process';
import {appendFileSync, writeFileSync} from 'node:fs';
import {arch, cpus, platform} from 'node:os';
import {fileURLToPath} from 'node:url';

const [reference, candidate, output] = process.argv.slice(2);
if (!output) throw Error('Expected reference directory, candidate directory, and output JSON path');
const profile = fileURLToPath(new URL('./profile-world.mjs', import.meta.url));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const limit = 1.25;
const report = {cpu: cpus()[0].model, arch: arch(), platform: platform(), node: process.version,
  wasmTier: 'optimized, eager compilation', ticks: 400, pairs: 3, maximumCostRatio: limit, modes: {}};
const summary = ['## Hobie physics performance', '',
  '| Wakes | Reference speed | Candidate speed | Median paired step-cost ratio | Candidate p95 step |',
  '| --- | ---: | ---: | ---: | ---: |'];
let passed = true;
for (const mode of ['off', 'on']) {
  const runs = [];
  for (let round = 0; round < report.pairs; round++) {
    const pair = {};
    const order = round % 2 ? ['candidate', 'reference'] : ['reference', 'candidate'];
    for (const build of order) {
      const dir = build === 'reference' ? reference : candidate;
      // Benchmark warmed optimized code. V8 tier-up can otherwise move a
      // long physics kernel between baseline and optimized code mid-sample.
      const args = ['--no-liftoff', '--no-wasm-lazy-compilation', profile, dir, String(report.ticks)];
      if (mode === 'off') args.push('--low');
      console.log('Wakes %s, pair %d, %s', mode, round + 1, build);
      pair[build] = JSON.parse(execFileSync(process.execPath, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}));
    }
    // Include the bound pose read that the worker needs after stepping.
    const stepCost = run => run.milliseconds.all.mean + run.milliseconds.readPose.mean;
    pair.ratio = stepCost(pair.candidate) / stepCost(pair.reference);
    runs.push(pair);
  }
  const ratio = median(runs.map(run => run.ratio));
  report.modes[mode] = {runs, medianRatio: ratio};
  const typical = (build, metric) => median(runs.map(run => metric(run[build])));
  const speed = run => run.simulationSecondsPerWallSecond;
  const p95 = typical('candidate', run => run.milliseconds.all.p95);
  summary.push(`| ${mode} | ${typical('reference', speed).toFixed(2)}× | ${typical('candidate', speed).toFixed(2)}× | ${ratio.toFixed(2)}× | ${p95.toFixed(1)} ms |`);
  if (!(ratio <= limit)) passed = false;
}
summary.push('', `A median paired cost increase above ${(limit - 1) * 100}% fails either scenario. Speeds are simulated seconds per wall second on ${report.cpu} (${report.node}).`, '');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
if (!passed) process.exitCode = 1;
