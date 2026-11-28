import assert from 'node:assert/strict';
import {FleetSeaClock} from '../viewer/fleet-sea-clock.mjs';

const clock=new FleetSeaClock('guest',3);
clock.sample(75,750,'host');
clock.observe('host',[1,40],1000);
assert.equal(clock.sample(75.25,1000,'host'),40,'A joining peer adopts the room phase');
clock.observe('host',[1,40.25],1250);
assert.equal(clock.sample(75.5,1250,'host'),40.25);

// The host stays connected and keeps sending the same stalled solver sample.
// A third peer's fresh timing messages must not keep the stalled phase alive.
for(let now=1500;now<=3250;now+=250){
  clock.observe('host',[1,40.25],now);
  clock.observe('third',[2,40.25+(now-1250)/1000],now);
  assert.equal(clock.sample(75.5+(now-1250)/1000,now,'host'),40.25);
}
clock.observe('host',[1,40.25],3500);
assert.equal(clock.sample(77.75,3500,'host'),40.25,'Take over without a phase jump');
assert.equal(clock.leader,'guest');
assert.equal(clock.sample(78.25,4000,'host'),40.75,'The healthy local clock keeps advancing');

clock.observe('host',[1,40.5],4050);
assert.equal(clock.sample(78.3,4050,'host'),40.75,'A recovered host cannot rewind the sea');
assert.equal(clock.leader,'host');
clock.observe('host',[1,41.5],5050);
assert.equal(clock.sample(79.3,5050,'host'),41.5,'Rejoin host time by adjusting the clock rate');

clock.observePause('host',true,5150);
for(let now=5250;now<=10000;now+=250){
  clock.observe('host',[1,41.5],now);
  assert.equal(clock.sample(79.3+(now-5050)/1000,now,'host'),41.5);
  assert.equal(clock.leader,'host','A host with fresh pause heartbeats stays authoritative');
}
clock.observePause('host',false,10200);
assert.equal(clock.sample(84.45,10200,'host'),41.5);
clock.observe('host',[1,41.75],10500);
assert.equal(clock.sample(84.75,10500,'host'),41.75);

clock.observePause('host',true,10700);
clock.observe('host',[1,41.75],10700);
assert.equal(clock.sample(86.8,12750,'host'),41.75,'An expired pause cannot hold the room clock');
assert.equal(clock.leader,'guest');
assert.equal(clock.sample(87.3,13250,'host'),42.25);
clock.remove('host');
clock.resume(42.25);
assert.equal(clock.sample(0,13300,'guest'),42.25,'A respawn retains the current sea phase');

console.log('Sea clock followed the host, held explicit pauses and advanced through stalls and clock handoff.');
