import assert from 'node:assert/strict';
import {keyboardAxisKey} from '../viewer/keyboard-sticks.mjs';
import {submarinePilot} from '../viewer/submarine.mjs';
import {subHarness} from './sub-harness.mjs';

const {plant,sample,step}=await subHarness();
plant.set('windSpeed',0);
plant.set('seaState',0);
plant.set('manual',1);
plant.set('manualMode',3);

function attitude(){
  const [w,x,y,z]=plant.get('orientation');
  return {
    yaw:Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)),
    roll:Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))
  };
}

function drive(key,seconds){
  const command=keyboardAxisKey('Key'+key,'wasd','sub');
  const axis=(pos,neg)=>Number(command===pos)-Number(command===neg);
  plant.set('pilot',submarinePilot(axis,3).pilot);
  const start=plant.get('position'),heading=attitude().yaw;
  let lastYaw=heading,turn=0,maxHeadingChange=0,maxDepthChange=0;
  for(let tick=0;tick<seconds*5;tick++){
    sample();
    step();
    const yaw=attitude().yaw;
    turn+=Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw));
    lastYaw=yaw;
    maxHeadingChange=Math.max(maxHeadingChange,Math.abs(turn));
    maxDepthChange=Math.max(maxDepthChange,Math.abs(plant.get('position')[2]-start[2]));
  }
  const [east,north,up]=plant.get('position').map((v,i)=>v-start[i]);
  return {
    ahead:east*Math.cos(heading)+north*Math.sin(heading),
    port:-east*Math.sin(heading)+north*Math.cos(heading),
    up,turn,roll:attitude().roll,maxHeadingChange,maxDepthChange
  };
}

drive('',18); // Allow the pistons to settle at the assisted translation trim.
for(const [key,sign] of [['A',1],['D',-1]]){
  const motion=drive(key,10);
  console.log(key,motion);
  assert(sign*motion.port>1,key+' must travel sideways');
  assert(-sign*motion.roll>.25,key+' must bank into the maneuver');
  assert(motion.maxDepthChange<.25,key+' must hold depth');
  assert(motion.maxHeadingChange<.15,key+' must hold heading');
  assert(Math.abs(drive('',5).roll)<.08,'release must level the sub');
}
assert(drive('W',4).ahead>1,'W forward');
assert(drive('S',6).ahead<-1,'S backward');
assert(drive('Q',4).turn>1,'Q port yaw');
assert(drive('E',6).turn<-1,'E starboard yaw');
assert(drive('R',3).up>.5,'R up');
assert(drive('F',5).up<-.5,'F down');
