// Compare the rigid torso to the moving tail in steady cruise and sustained sprint.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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

globalThis.THREE=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const {interpolateSharkTail}=await import('../viewer/harbor-traffic.mjs');
const burst=await loadInstance('HarborTraffic',{
  initialState:[0,-28,6,0,2,-25,2,6,0,-200,-160,-5,0,-.06,0,0,0],
  initialFish:[3,0,0,0,0,0,0,0,0,0],sharkPilot:[1,0,1,-1]
},read);
const frames=[];
for(let tick=0;tick<1000;tick++){
  burst.advance(.01);
  const fish=burst.get('fish'),frame=new Float64Array(75);
  frame[0]=burst.time;frame[70]=fish[5];frame[71]=fish[6];
  frames.push(frame);
}
for(const stride of [10,20]){
  let linearError=0,interpolatedError=0,count=0;
  for(let index=100;index<frames.length-stride;index++){
    const start=frames[index],end=frames[index+stride];
    for(let t=1;t<stride;t++){
      const fraction=t/stride,actual=frames[index+t][70];
      const linear=start[70]+fraction*(end[70]-start[70]);
      linearError+=(linear-actual)**2;
      interpolatedError+=(interpolateSharkTail(start,end,fraction)-actual)**2;
      count++;
    }
  }
  const linearDegrees=Math.sqrt(linearError/count)*degrees;
  const interpolatedDegrees=Math.sqrt(interpolatedError/count)*degrees;
  assert(interpolatedDegrees<linearDegrees*.35,'Interpolation lost the solved high-speed tail reversals');
  console.log({packetMilliseconds:10*stride,linearDegrees,interpolatedDegrees});
}
const start=frames[100],end=Array.from(frames[140]);
assert.equal(interpolateSharkTail(start,end,0),start[70]);
assert.equal(interpolateSharkTail(start,end,1),end[70]);
assert.equal(interpolateSharkTail(start,end,.5),start[70]+.5*(end[70]-start[70]));
assert.equal(interpolateSharkTail(start,frames[110].slice(0,71),.5),start[70]+.5*(frames[110][70]-start[70]));
