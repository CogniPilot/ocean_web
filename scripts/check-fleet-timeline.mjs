import assert from 'node:assert/strict';
import {PeerTimeline} from '../viewer/fleet-timeline.mjs';

const peer = new PeerTimeline();
function send(time, arrival, position) {
  const data = new Float32Array(232);
  data[0] = position;
  data[215] = time / 1000;
  return peer.receive(data, arrival);
}
function shown(now) {
  const {left, right, fraction} = peer.at(now);
  return left[0] + fraction * (right[0] - left[0]);
}
send(1000, 93000, 0);
send(1100, 93180, 1);
send(1200, 93201, 2);
assert(Math.abs(shown(93200) - .5) < 1e-5);
assert(Math.abs(shown(93250) - 1) < 1e-5);
assert.equal(send(1100, 93255, -10), false);
assert.equal(shown(93900), 2);
assert(peer.age(93900) >= 650);
send(1300, 96500, 3);
assert.equal(peer.age(96500), 0);
assert.equal(shown(96500), 3);
send(9000, 102000, 80);
assert.equal(shown(102000), 80);
const legacy = new PeerTimeline();
assert(legacy.receive(new Float32Array(232), 20));
assert.equal(legacy.at(20).fraction, 0);
console.log('Peer interpolation passed jitter, independent clocks, reordered packets, gap recovery and legacy packet checks.');

const background=new PeerTimeline();
for(const time of [1,3.2,3.3]){
  const data=new Float32Array(232);
  data[215]=time;
  data[218]=time===3.3?16.2:time*5;
  background.receive(data,5000+time*1000);
}
function northSpeed(now){
  const {left,right}=background.at(now);
  const {from,to,dt}=background.motionSpan(left,right);
  return (to[218]-from[218])/dt;
}
assert(Math.abs(northSpeed(7500)-5)<.0001);
assert(Math.abs(northSpeed(9000)-2)<.0001);
const legacyNext=new Float32Array(232);
legacyNext[218]=5;
legacy.receive(legacyNext,1020);
const legacyPose=legacy.at(750);
assert.equal(legacy.motionSpan(legacyPose.left,legacyPose.right).dt,1);
console.log('Carrier rates retained through background gaps and legacy snapshots.');
