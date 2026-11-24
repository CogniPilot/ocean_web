import assert from 'node:assert/strict';
import {subHarness} from './sub-harness.mjs';
const {plant,sample,step}=await subHarness();
plant.set('manual',1);
let contact=0,minimumZ=0,surfaceGap=-Infinity,peakRPM=0,peakCavitation=0,echoes=0;
function drive(pilot,seconds){
  plant.set('pilot',pilot);
  for(let i=0;i<5*seconds;i++){
    const f=sample();step();
    contact=Math.max(contact,Math.hypot(...plant.get('contactForce')));
    minimumZ=Math.min(minimumZ,f.pos[2]);
    surfaceGap=Math.max(surfaceGap,f.pos[2]-plant.get('ocean.surface'));
    peakRPM=Math.max(peakRPM,...plant.get('propellerRPM').map(Math.abs));
    peakCavitation=Math.max(peakCavitation,...plant.get('cavitation'));
    echoes=Math.max(echoes,f.elev.filter(r=>r>0).length);
  }
}
drive([0,0,0,-1.65],10);drive([0,0,0,1.65],46);
const twin=await subHarness(),idle=await subHarness();
for(const [rig,side] of [[twin,.85],[idle,0]]){
  rig.plant.set('manual',1);rig.plant.set('pilot',[0,side,0,0]);
  for(let tick=0;tick<15;tick++){rig.sample();rig.step();}
}
assert.deepEqual(twin.plant.get('position'),idle.plant.get('position'));
assert.deepEqual(twin.plant.get('appliedThrust'),idle.plant.get('appliedThrust'));
const before=plant.get('nav')[2];drive([0,0,.95,0],4);
const turn=plant.get('nav')[2]-before;
console.log({minimumZ,contact,surfaceGap,peakRPM,peakCavitation,echoes,turn});
assert(minimumZ>=-13.8&&contact>1&&surfaceGap>-.26&&peakCavitation>0&&echoes>=8&&turn>.25);
