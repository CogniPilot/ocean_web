// Place live bait ahead of each animal's mouth and compare NPC and manual control.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const ground=await loadInstance('FeedingGround',{clock:0},read);
const [x,y,z]=ground.get('school');
for(const kind of ['whale','shark']){
  const whale=kind==='whale',i=whale?0:1;
  const pose=[x-(whale?4.1:2.2),y,z+(whale?.55:.14),0,0,0];
  ground.set('pose',pose);ground.set('whale',Number(whale));
  const prey=ground.get('prey');assert.equal(prey[0],1);assert.equal(prey[4],1);
  const start=whale?{initialSwimmer:[...pose.slice(0,3),1,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}:
    {initialState:[0,-28,6,0,2,-25,2,6,0,...pose.slice(0,4),-.06,0,0,0]};
  const model=await loadInstance('HarborTraffic',{...start,[kind+'Prey']:prey},read);
  for(let j=0;j<30;j++)model.advance(.01);
  assert.equal(model.get('feedingAttempt')[i],1);
  model.set(kind+'Pilot',[1,0,.5,-1]);model.advance(.01);assert.equal(model.get('feedingAttempt')[i],0);
}
ground.set('restock',Array(72).fill(100));
assert.deepEqual(ground.get('prey'),[0,0,0,0,0]);
const speeds=[],strokes=[];
for(const phase of [0,32]){
  const model=await loadInstance('HarborTraffic',{behaviorOffset:phase},read);
  for(let j=0;j<2000;j++)model.advance(.01);
  const state=model.get('swimmerState');speeds.push(state[3]);strokes.push(state[13]);
}
assert(speeds[1]<.7*speeds[0]&&strokes[1]<.75*strokes[0]);
console.log('Cruising and resting humpback speeds',speeds,'stroke phases',strokes);
