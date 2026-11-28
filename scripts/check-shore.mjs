// Contact cases use the west shore boulder cluster and the bare island interior.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async u=>new Response(await readFile(u));
const launch=(east,north,height,speed=0,heading=0)=>loadInstance('Hobie16',{
  launchEast:east,launchNorth:north,launchHeading:heading,launchHeight:height,
  launchSpeed:speed,manualHelm:1,windEast:0,windNorth:0
},read);
const clear=await launch(14,40.7,.2);
assert.deepEqual(clear.get('shoreWrench'),[0,0,0,0,0,0]);
assert.deepEqual(clear.get('rigShoreWrench'),[0,0,0,0,0,0]);
const [capsules,mast,stays,forestay,pontoonFaces]=clear.getMany([
  'rigCollision','mastStations','stayPath','forestayPath','pontoonContactFaces'
]);
assert.equal(capsules.length,19*7);
assert.equal(pontoonFaces.length,188*3);
for(let i=0;i<7;i++)assert.deepEqual(capsules.slice(7*i,7*i+6),mast.slice(3*i,3*i+6));
for(let i=0;i<3;i++){
  const cable=i===2?forestay:stays.slice(9*i,9*i+9);
  for(let j=0;j<2;j++)assert.deepEqual(capsules.slice(49+14*i+7*j,55+14*i+7*j),cable.slice(3*j,3*j+6));
}
clear.set('rudderInput',.8);
for(let i=0;i<30;i++)clear.advance(.01);
const steered=clear.get('rigCollision');
assert(Math.abs(steered[92]-capsules[92])>.01,'The rudder collision follows the helm angle');
for(const north of [40.7,42.8]){
  const hull=await launch(14.6,north,.2,2.5);
  let impact,furthest=0;
  for(let i=0;i<200;i++){
    hull.advance(.01);
    const w=hull.get('shoreWrench');
    assert(w.every(Number.isFinite));
    if(north===40.7&&i===17){
      const [rock,rig]=hull.getMany(['rockShoreWrench','rigShoreWrench']);
      assert(Math.hypot(...rock.slice(0,3))>100,'the pontoon mesh should already be in contact');
      assert(w.every((value,j)=>Math.abs(value-rock[j]-rig[j])<.01),
        'the boulder strike must not receive a duplicate point force in clear water');
    }
    if(!impact && w[0]<-10)impact=w;
    furthest=Math.max(furthest,hull.get('east'));
  }
  assert(impact && furthest<16,JSON.stringify({north,impact,furthest}));
  console.log({north,firstRockForce:impact[0],yawMoment:impact[5],furthest});
}
// A measured crest on shoreline boulder 11 fits between the pontoons. Move
// the same pose vertically to distinguish front beam and cloth contact from
// a broad bounding box. The pre-existing keel samples miss both strikes.
for(const [name,east,north,z,heading] of [
  ['forward crossbeam',39.229259,28.164306,1.211095,Math.PI/3],
  ['trampoline',39.259814,28.520938,1.187095,31*Math.PI/24],
]){
  const boat=await launch(east,north,z,0,heading);
  const [w,total,rig]=boat.getMany(['rockShoreWrench','shoreWrench','rigShoreWrench']);
  assert(w[2]>250,name+' should carry the load at the rock crest');
  assert(total.every((v,i)=>Math.abs(v-rig[i]-w[i])<.01),name+' pose should leave the original keel samples clear');
  const above=await launch(east,north,z+.10,0,heading);
  assert.deepEqual(above.get('rockShoreWrench'),[0,0,0,0,0,0],name+' has clearance above rock');
  console.log({part:name,rockVerticalForce:w[2],torque:w.slice(3)});
}
const sand=await launch(36,40,3.9);
let peak=0,rigPeak=0;
for(let i=0;i<250;i++){
  sand.advance(.01);peak=Math.max(peak,sand.get('shoreWrench')[2]);
  rigPeak=Math.max(rigPeak,sand.get('rigShoreWrench')[2]);
}
assert(peak>100 && sand.get('heave')>3);
assert(rigPeak>100,'The rudder geometry carries part of the load when the boat grounds');
console.log({peakSandSupport:peak,rigPeak,groundedHeight:sand.get('heave')});
