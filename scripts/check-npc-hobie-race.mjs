import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {hobieRace,nextFleetStart} from '../viewer/npc-hobie-race.mjs';
import {startGate,windBearing} from '../viewer/sailing-start.mjs';

assert.equal(nextFleetStart(579.97,20),600);
assert.equal(nextFleetStart(600.01,299.99),900);
const read=async url=>new Response(await readFile(url));
for(let lane=0;lane<5;lane++){
  const committee=await loadInstance('Regatta',{...startGate,windBearing,utc:595},read);
  const boat=hobieRace(committee,lane,600,11);
  const stages=[];
  // Send the NPC's actual trajectory through the same Modelica gate scorer
  // used for a player and compare lap times at its 20 Hz scoring resolution.
  for(let i=0;i<5880;i++){
    const utc=595+.05*i,{east,north,status}=boat.sample(utc);
    committee.set('utc',utc);
    committee.set('east',east);committee.set('north',north);
    committee.advance(.05);
    const stage=committee.get('stage');
    if(stage!==stages.at(-1))stages.push(stage);
    if(stage===status.stage&&stage>=2)assert(Math.abs(status.lapTime-committee.get('lapTime'))<.051);
  }
  assert.deepEqual(stages,[0,1,2,3,4,5]);
  const result={...boat.sample(885).status};
  assert.equal(result.heatStart,600);
  assert(result.startDelay>0&&result.startDelay<1.1&&result.lapTime>220&&result.lapTime<270);
  assert.equal(boat.sample(899.9).status.stage,0);
  assert.equal(boat.sample(900).status.stage,1);
  assert.equal(boat.sample(901.1).status.stage,2);
  assert.equal(boat.sample(901.1).status.heatStart,900);
  console.log({lane,startDelay:result.startDelay,lapTime:result.lapTime,scored:committee.get('lapTime')});
}

// The displayed boat can round off its track without changing the scored lap.
const committee=await loadInstance('Regatta',{...startGate,windBearing},read);
const route=hobieRace(committee,0,600,11);
let previous,velocity,peakChange=0;
for(let i=0;i<14000;i++){
  const utc=590+i*.02;
  const official={...route.sample(utc).status};
  const {east,north,status}=route.sample(utc,utc);
  assert.deepEqual(status,official);
  if(previous){
    const next=[(east-previous[0])/.02,(north-previous[1])/.02];
    if(velocity)peakChange=Math.max(peakChange,Math.hypot(next[0]-velocity[0],next[1]-velocity[1]));
    velocity=next;
  }
  previous=[east,north];
}
assert(peakChange<.4,'Rounded NPC tacks must avoid abrupt velocity changes');
console.log({peakSpeedChangePer20ms:peakChange});
