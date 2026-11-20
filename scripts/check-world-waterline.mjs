// Compare the twelve buoyancy inputs with independent samples from the FMI wave fields.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';

const base = pathToFileURL(resolve(process.argv[2] ?? 'build/world-runtime') + '/');
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const index = JSON.parse(await readFile(new URL(manifest.index, base)));
const world = await openFmuSession({index, base, fetch: fileFetch});
const variables = new Map(index.variables.map(v => [v.name, v]));

function bind(name) {
  const variable = variables.get(name);
  assert(variable, 'FMU missing ' + name);
  const binding = world.bind_outputs(JSON.stringify(scalarNames(name, variable.dimensions ?? [])));
  return () => world.read_bound(binding);
}

function elevation(tile, east, north) {
  const size = Math.sqrt(tile.length);
  const col = east * size / 64, row = north * size / 64;
  const x = Math.floor(col), y = Math.floor(row);
  const wrap = i => (i % size + size) % size;
  const at = (j, i) => tile[size * wrap(j) + wrap(i)];
  const a = col - x, b = row - y;
  return (1-b) * ((1-a) * at(y,x) + a * at(y,x+1)) + b * ((1-a) * at(y+1,x) + a * at(y+1,x+1));
}

try {
  const [hullWater, priorWater, fine, tile, stations] =
    ['boat.sectionWater','boat.previousWater','waves.sectionHeight','boatWater.tile','boat.stationX'].map(bind);
  const pose = world.bind_outputs(JSON.stringify(['sectionStamp','boat.east','boat.north','boat.heading',
    'boat.heel','boat.pitch','boat.halfSpacing','boatWater.tide','boat.waterFraction','boat.buoyancy']));
  world.set_inputs(JSON.stringify([['windSpeed',11],['seaState',.6],['subManual',1],['sailingManual',1],['flightManual',1]]));
  const [wave, receivers, sampled, driftE, driftN, committee] =
    ['waves.height','receiverPosition','sampledWake','waves.driftE','waves.driftN','race.launchPose'].map(bind);
  let wakeError=0, launchExcursion=0;
  let samples = 0, worst = 0, difference = 0, lastStamp = -1, previous;
  for (let i=0; i<81; i++) {
    const [stamp,east,north,yaw,heel,pitch,spacing,tide,fraction,lift] = world.read_bound(pose);
    const now = world.time();
    assert(Number.isFinite(lift) && lift >= 0);
    assert(Math.abs(fraction - Math.min(1,Math.max(0,(now-stamp)/.1))) < 1e-6);
    const sampleTick = Math.round(stamp * 10);
    const water = Array.from(hullWater());
    if (sampleTick !== lastStamp) {
      const prior = priorWater();
      if (previous) assert(prior.every((v,k) => Math.abs(v-previous[k])<1e-7), 'Lost a section history frame');
      const grid = tile(), shortWaves = fine(), xs = stations();
      // Score at the sampling instant. A host can observe a tick on its right limit.
      if (Math.abs(now-stamp)<1e-6 && stamp>0) {
        samples++;
        const xy=receivers(), heights=sampled(), spectrum=wave(), de=driftE()[0], dn=driftN()[0];
        for(let k=0;k<heights.length;k++){
          const expected=elevation(spectrum,xy[2*k]-de,xy[2*k+1]-dn);
          wakeError=Math.max(wakeError,Math.abs(heights[k]-expected));
        }
        launchExcursion=Math.max(launchExcursion,Math.abs(committee()[0]));
        for (let k=0; k<12; k++) {
          const side = k<6 ? 1 : -1, panel = k%6;
          const along = .5*(xs[panel]+xs[panel+1])*Math.cos(pitch)+side*spacing*Math.sin(heel)*Math.sin(pitch);
          const across = side*spacing*Math.cos(heel);
          const background = elevation(grid,east+along*Math.cos(yaw)-across*Math.sin(yaw),
            north+along*Math.sin(yaw)+across*Math.cos(yaw));
          worst = Math.max(worst, Math.abs(water[k]-shortWaves[k]-tide-background));
          difference = Math.max(difference, Math.abs(water[k]-water[(k+6)%12]));
        }
      }
      lastStamp = sampleTick;
    }
    // The first step settles any inputs written after initialization at time zero.
    previous = water;
    world.step(.01);
  }
  console.log({samples,wakeError,launchExcursion,maxSectionErrorMetres:worst,maxPontoonDifferenceMetres:difference});
  assert(wakeError<.005 && launchExcursion>.001, "Shared waves must reach other vessels and the anchored launch");
  assert(samples>=6 && worst<.01 && difference>.001, 'Hull strips disagree with the displayed sea');
} finally {
  world.free();
}
