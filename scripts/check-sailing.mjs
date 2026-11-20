import {readFile} from 'node:fs/promises';
import {loadBoat} from '../viewer/board/boat.mjs';
import {startDive} from '../viewer/live.mjs';

const sea = await startDive();
const boat = await loadBoat(async url => new Response(await readFile(url)));
const legs = [boat.state[8]];
let tacks = 0;
let peakCamber = 0;
for (let i = 0; i < 625; i++) {
  const previous = boat.state;
  sea.advance();
  boat.advance(sea.boatEnvironment(boat.state));
  const state = boat.state;
  if (state[8] !== legs.at(-1)) legs.push(state[8]);
  if (state[9] !== previous[9] && state[8] === previous[8]) tacks++;
  peakCamber = Math.max(peakCamber, ...state.slice(11,21).map(Math.abs));
}
console.log({legs, tacks, peakCamber});
if (!legs.join(',').includes('1,2,3,1') || tacks === 0 || peakCamber <= 0)
  throw Error('Sailing qualification failed');
