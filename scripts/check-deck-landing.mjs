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

function vesselRows(east,north,z=0,roll=0,ve=0,vu=0,rollRate=0){
  // Slot one must remain inactive while slot two carries the cruiser.
  return [0,0,...Array(12).fill(0),1,3,east,north,z,0,roll,0,ve,0,vu,rollRate,0,0,...Array(28).fill(0)];
}

const weight=2*9.80665;
function steps(instance,seconds){
  for(let i=0;i<Math.round(seconds/.005);i++)instance.advance(.005);
}
function settle(instance,force,limit=10){
  for(let i=0;i<limit*200;i++){
    instance.advance(.005);
    if(force()>3){
      instance.set('motorCut',1);instance.set('climb',0);
      steps(instance,2);
      return;
    }
  }
  assert.fail('no touchdown load');
}
function takeoff(instance,force){
  const height=instance.get('position')[2];
  instance.set('motorCut',0);instance.set('climb',1);steps(instance,3);
  assert(instance.get('position')[2]>height+1 && force()===0,'failed to take off');
}
for(const [location,east,deckHeight] of [['roof',-5,2.207],['engine hatch',-2.85,.571]]){
  const flight=await loadInstance('Rdd2Survey',{pilot:1,climb:-.65,vesselDecks:vesselRows(east,0)},read);
  const wrench=()=>flight.get('vesselDeckWrenches').slice(12,24);
  const support=()=>wrench()[2];
  settle(flight,support);
  const [x,,height]=flight.get('position');
  assert(Math.abs(height-deckHeight-.1)<.006 && Math.abs(support()-weight)<.12);
  assert(wrench().slice(0,3).every((force,i)=>Math.abs(force+wrench()[i+6])<1e-8));
  for(let i=0;i<600;i++){
    const t=i*.005;
    flight.set('vesselDecks',vesselRows(east+.19*(1-Math.cos(t)),0,.04*Math.sin(t),.025*Math.sin(t),
      .19*Math.sin(t),.04*Math.cos(t),.025*Math.cos(t)));
    flight.advance(.005);
  }
  const [rideEast,,rideHeight]=flight.get('position');
  assert(Math.abs(rideEast-x-.19*(1-Math.cos(3)))<.07,'drone did not follow the moving deck');
  assert(Math.abs(rideHeight-height-.04*Math.sin(3))<.015,'drone did not follow deck heave');
  takeoff(flight,support);
  console.log({cruiserSurface:location,height,rideEast,rideHeight});
}

const cruiserMiss=await loadInstance('Rdd2Survey',{motorCut:1,vesselDecks:vesselRows(-5,2)},read);
for(let i=0;i<300;i++){
  cruiserMiss.advance(.005);
  assert(cruiserMiss.get('vesselDeckWrenches').every(force=>force===0));
}

// The retired cruiser swim platform must leave the water behind the transom clear.
const sternWater=await loadInstance('Rdd2Survey',{
  waterLevel:-15,motorCut:1,vesselDecks:vesselRows(-1.08,0)
},read);
for(let i=0;i<350;i++){
  sternWater.advance(.005);
  assert(sternWater.get('vesselDeckWrenches').every(force=>force===0));
}
assert(sternWater.get('position')[2]<0,'retired platform still supports the drone');

for(const [ground,origin,minHeight,maxHeight] of [
  ['sand',[36,40],3.9,4.3],
  // Sand beneath this boulder is only ~0.5 m high.
  ['boulder',[33.7702347,49.4990903],1.8,2.0]
]){
  const flight=await loadInstance('Rdd2Survey',{origin,pilot:1,climb:-.65},read);
  const support=()=>flight.get('terrainWrench')[2];
  settle(flight,support);
  const height=flight.get('position')[2];
  assert(height>minHeight&&height<maxHeight&&Math.abs(support()-weight)<.2,JSON.stringify({ground,height,support:support()}));
  takeoff(flight,support);
  console.log({ground,height,takeoffHeight:flight.get('position')[2]});
}

// This exposed lip is more than 2.8 m above the sloping sand below it.
// Contact must start near the rock's top even though the sand is underwater.
const lip=await loadInstance('Rdd2Survey',{origin:[33.43083,51.62744],pilot:1,climb:-.4},read);
let lipTouchdown;
for(let i=0;i<2000;i++){
  lip.advance(.005);
  if(lip.get('terrainWrench')[2]>3){lipTouchdown=lip.get('position')[2];break;}
}
assert(lipTouchdown>1.7 && lipTouchdown<2,'the exposed boulder lip must catch the descending drone');
console.log({lipTouchdown});
