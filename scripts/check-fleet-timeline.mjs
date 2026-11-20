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
send(9000, 102000, 80);
assert.equal(shown(102000), 80);
const legacy = new PeerTimeline();
assert(legacy.receive(new Float32Array(232), 20));
assert.equal(legacy.at(20).fraction, 0);
console.log('Peer interpolation passed jitter, independent clocks, reordered packets, gap recovery and legacy packet checks.');
