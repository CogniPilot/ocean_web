import {startDive} from '../viewer/live.mjs';
import {elevation} from '../viewer/board/boat.mjs';
const dive=await startDive();
dive.pilot.enabled=true;
let maxImpact=0,minimumZ=0,surfaceGap=-Infinity,peakRPM=0,bubbles=0,echoes=0;
function run(axes,count){
  dive.pilot.axes=axes;
  for(let i=0;i<count;i++){
    const f=dive.advance();maxImpact=Math.max(maxImpact,Math.hypot(...f.contact));minimumZ=Math.min(minimumZ,f.pos[2]);
    surfaceGap=Math.max(surfaceGap,f.pos[2]-elevation(f,...f.pos));peakRPM=Math.max(peakRPM,...f.rpm.map(Math.abs));
    bubbles=Math.max(bubbles,...f.cavitation);echoes=Math.max(echoes,f.elevationRanges.filter(r=>r>0).length);
  }
}
run([0,0,0,-1.65],50);
run([0,0,0,1.65],230);
const before=dive.frame.est[2],y=dive.frame.pos[1];
run([0,.85,0,0],15);
const strafe=dive.frame.pos[1]-y;
run([0,0,.95,0],20);
const turn=dive.frame.est[2]-before;
console.log({minimumZ,maxImpact,surfaceGap,peakRPM,bubbles,echoes,strafe,turn});
if(minimumZ < -13.8 || maxImpact<1 || surfaceGap<-.26 || !bubbles || echoes<8 || strafe<.15 || turn<.25)throw Error('Pilot, seabed or free-surface check failed');

const room=await startDive();
room.pilot.enabled=true;room.pilot.axes=[1.65,0,0,0];
for(let i=0;i<170 && room.frame.pos[0]<9;i++)room.advance();
room.pilot.axes=[0,1.35,0,0];
let wreckLoad=0;
for(let i=0;i<45;i++)wreckLoad=Math.max(wreckLoad,Math.hypot(...room.advance().contact));
console.log({inside:room.frame.pos,wreckLoad});
if(room.frame.pos[0]<0.8 || wreckLoad<2)throw Error('No interior contact during cross-passage maneuver');
