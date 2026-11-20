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
const y=plant.get('position')[1];drive([0,.85,0,0],3);
const strafe=plant.get('position')[1]-y;
const before=plant.get('nav')[2];drive([0,0,.95,0],4);
const turn=plant.get('nav')[2]-before;
console.log({minimumZ,contact,surfaceGap,peakRPM,peakCavitation,echoes,strafe,turn});
assert(minimumZ>=-13.8&&contact>1&&surfaceGap>-.26&&peakCavitation>0&&echoes>=8&&strafe>.15&&turn>.25);
