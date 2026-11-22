// The host observes multiple mouths at the same harbor time using one FMU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>({json:async()=>JSON.parse(await readFile(url))});
const ground=await loadInstance('FeedingGround',{clock:1},read);
const [east,north,depth]=ground.get('school');
for(const whale of [1,0,1]){
  const reach=whale?3.9:2;
  ground.set('whale',whale);
  ground.set('pose',[east-reach,north,depth+(whale?.55:.14),0,0,0]);
  ground.set('feedAge',.57);
  const [gape,capture,inside]=ground.getMany(['gape','capture','inMouth']);
  assert(Math.abs(gape-(whale?.57/.65:(.72-.57)/.21))<1e-9);
  assert.equal(capture,1);
  assert.equal(inside[0],1);
  ground.set('feedAge',3);
  assert.deepEqual(ground.getMany(['gape','capture']),[0,0]);

  for(const [range,bearing,elevation,visible] of [[6,.3,-.17,true],[6,-.93,0,false],[6,0,.5,false],[16,0,0,false]]){
    ground.set('pose',[east-reach-range*Math.cos(bearing)*Math.cos(elevation),
      north-range*Math.sin(bearing)*Math.cos(elevation),depth-range*Math.sin(elevation),0,0,0]);
    const echo=ground.get('returns');
    for(const [i,expected] of [range,bearing,elevation].entries())assert(Math.abs(echo[i]-expected)<1e-9);
    assert.equal(echo[3]>0,visible);
  }
}
console.log('Whale lunge, shark bite and forward sonar observations passed.');
