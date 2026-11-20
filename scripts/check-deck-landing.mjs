import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async u=>new Response(await readFile(u));
const deck=[-3,0,0,0,0,0,0,0,0,0,0,0];
const drone=await loadInstance('Rdd2Survey',{pilot:1,deckState:deck,deckEnabled:1,climb:-.8},read);
const advance=t=>{for(let i=0;i<Math.round(t/.005);i++)drone.advance(.005);};
advance(9);
assert(drone.get('deckWrench')[2]>0,'missed deck');
drone.set('motorCut',1);drone.set('climb',0);
advance(2);
const load=drone.get('deckWrench'),z=drone.get('position')[2];
assert(Math.abs(load[2]-2*9.80665)<.3 && Math.abs(z-.88)<.01,JSON.stringify({z,load}));
assert(Math.abs(load[8]+load[2])<1e-8);
for(let i=0;i<400;i++){
 const t=i*.005;
 drone.set('deckState',[-3,0,.04*Math.sin(t),0,.025*Math.sin(t),0,0,0,.04*Math.cos(t),.025*Math.cos(t),0,0]);
 drone.advance(.005);
}
assert(Math.abs(drone.get('position')[2]-(.88+.04*Math.sin(2)))<.015);
drone.set('motorCut',0);drone.set('climb',1);advance(4);
assert(drone.get('position')[2]>2 && drone.get('deckWrench')[2]===0,'failed to take off');
const miss=await loadInstance('Rdd2Survey',{deckEnabled:1,deckState:[-3,2,0,0,0,0,0,0,0,0,0,0],motorCut:1},read);
for(let i=0;i<240;i++){miss.advance(.005);assert.equal(miss.get('deckWrench')[2],0);}
console.log({settledHeight:z,deckForce:load[2],takeoffHeight:drone.get('position')[2]});

for(const [catamaran,center,deckTop] of [[1,-.425,.414],[0,-.27,.1585]]){
  // Place the landing surface under the drone's initial station. A small
  // heave and roll after touchdown exercise point velocities and foot friction.
  const east=-5-center,deck=[east,0,0,0,0,0,0,0,0,0,0,0];
  const flight=await loadInstance('Rdd2Survey',{pilot:1,sailDeckEnabled:1,
    sailDeckState:deck,isCatamaran:catamaran,climb:-.8},read);
  const step=n=>{for(let k=0;k<n;k++)flight.advance(.005);};
  step(2000);flight.set('motorCut',1);flight.set('climb',0);step(400);
  const wrench=flight.get('sailWrench'),height=flight.get('position')[2];
  assert(Math.abs(height-deckTop-.1)<.008 && Math.abs(wrench[2]-19.6133)<.12);
  assert(Math.abs(wrench[2]+wrench[8])<1e-8);
  for(let k=0;k<400;k++){
    const t=k*.005;
    flight.set('sailDeckState',[east,0,.04*Math.sin(t),0,.025*Math.sin(t),0,0,0,.04*Math.cos(t),.025*Math.cos(t),0,0]);
    flight.advance(.005);
  }
  assert(Math.abs(flight.get('position')[2]-height-.04*Math.sin(2))<.015);
  flight.set('motorCut',0);flight.set('climb',1);step(800);
  assert(flight.get('position')[2]>2 && flight.get('sailWrench')[2]===0);
  console.log({catamaran,height,support:wrench[2]});
}
