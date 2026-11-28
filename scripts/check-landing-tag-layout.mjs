import assert from 'node:assert/strict';
import {padLayout} from '../viewer/landing-tags.mjs';
import {committeePad,islandPad} from '../viewer/spawn-sites.mjs';

const cases=[
  ['committee',1.60,1.24], // T-top dimensions exported by Shore.
  ['committee',committeePad.width,committeePad.length],
  ['island',islandPad.width,islandPad.length],
  ['island',1.2,2.4], // Accommodate a pad whose longer axis is Y.
];
for(const [site,width,length] of cases){
  const tags=padLayout(site,width,length);
  assert.deepEqual(tags.map(({id})=>id),site==='committee'?[0,1,4,5,6]:[2,3,7,8,9]);
  const [a,b,center,nearA,nearB]=tags;
  assert.equal(a.size,b.size);
  assert(a.size>.41*Math.min(width,length),'Improve the long-range marker footprint');
  assert.equal(center.x,0);
  assert.equal(center.y,0);
  assert(center.size<=.15);
  assert(nearA.size>=center.size&&nearA.size<a.size&&nearA.size===nearB.size);
  for(const tag of tags){
    assert(Math.abs(tag.x)+tag.size/2<width/2 && Math.abs(tag.y)+tag.size/2<length/2,
      'Keep each printed square, including its quiet zone, inside the pad');
    for(const other of tags){
      if(tag===other)continue;
      const side=(tag.size+other.size)/2;
      assert(Math.abs(tag.x-other.x)>side || Math.abs(tag.y-other.y)>side,
        'Separate printed squares with a strip of pad surface');
    }
  }
}
console.log('AprilTag IDs, enlarged acquisition squares, and nonoverlapping quiet zones passed.');
