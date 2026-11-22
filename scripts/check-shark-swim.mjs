// Compare the rigid torso to the moving tail in steady cruise and sustained sprint.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read = async url => new Response(await readFile(url));
const degrees = 180 / Math.PI;

async function swim(effort, turn) {
  const shark = await loadInstance('HarborTraffic', {
    initialState: [0,-28,6,0,2,-25,2,6,0,-30,-30,-3,0,-.06,0,0,0],
    initialFish: [effort ? 5 : 1.3,0,0,0,0,0,0,0,0,0],
    sharkPilot: [1,0,effort,-1],
    initialSwimReserve: [1,0]
  }, read);
  let low = Infinity, high = -Infinity, previousRate = 0;
  let maxAnterior = 0, maxPeduncle = 0, thrust = 0;
  const cycles = [];
  for (let tick = 0; tick < 1400; tick++) {
    shark.advance(.01);
    if (tick < 500) continue;
    const [state, fish, anterior, tailThrust] = shark.getMany(['state','fish','sharkTrunkFlex','sharkTailForce']);
    low = Math.min(low, state[12]);
    high = Math.max(high, state[12]);
    maxAnterior = Math.max(maxAnterior, Math.abs(anterior) * degrees);
    maxPeduncle = Math.max(maxPeduncle, Math.abs(fish[5]) * degrees);
    thrust += tailThrust;
    if (fish[6] < 0 && previousRate >= 0) {
      cycles.push((high - low) * degrees);
      low = Infinity;
      high = -Infinity;
    }
    previousRate = fish[6];
  }
  const speed = shark.get('fish')[0];
  const initialHeading = shark.get('state')[12];
  shark.set('sharkTurn', turn);
  for (let tick = 0; tick < 350; tick++) shark.advance(.01);
  const headingChange = (shark.get('state')[12] - initialHeading) * degrees;
  assert(cycles.length >= 4 && turn * headingChange > 20, 'Lost directed steering');
  assert(thrust > 0, 'Tail must produce positive mean thrust');
  return {speed, yawExcursion: Math.max(...cycles.slice(-3)), maxAnterior, maxPeduncle, headingChange};
}

const slow = await swim(0, -1);
const fast = await swim(1, 1);
assert(fast.speed > 2 * slow.speed);
assert(fast.yawExcursion < 4 && fast.yawExcursion < slow.yawExcursion);
assert(slow.maxAnterior > 1 && fast.maxAnterior < .1 && fast.maxPeduncle > 15);
console.log({slow, fast});
