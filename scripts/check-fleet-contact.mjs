// Replay the same nine-field peer snapshots used by the WebRTC fleet.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const fields=['east','north','heading','ve','vn','yawRate','heave'];
const speed=1.4;
const height=name=>name==='Hobie16'?.2:.069;
function startTraffic(name,east,north,heading) {
  const rows=new Float64Array(36);
  rows.set([1,east,north,heading,speed*Math.cos(heading),speed*Math.sin(heading),0,height(name),Number(name==='Hobie16')]);
  return rows;
}
async function launch(name,east,north,heading,traffic) {
  const model=await loadInstance(name,{manualHelm:1,launchHeading:heading,
    launchEast:east,launchNorth:north,launchSpeed:speed,launchHeight:height(name),
    windEast:0,windNorth:0,traffic},read);
  return {model,twin:Number(name==='Hobie16')};
}
function snapshot({model,twin}) {
  const rows=new Float64Array(36);
  rows.set([1,...model.getMany(fields),twin]);
  return rows;
}
function exchange(a,b) {
  const left=snapshot(a),right=snapshot(b);
  a.model.set('traffic',right);
  b.model.set('traffic',left);
}
for(const [left,right,separation,offset] of [
  ['Sailboat','Sailboat',2,.03],['Hobie16','Hobie16',4.6,.11],['Hobie16','Sailboat',3.3,.98]
]) {
  // Contact is evaluated on a sample clock. Initialize both ends with
  // simultaneous snapshots to check action and reaction at the same pose.
  const a=await launch(left,0,0,0,startTraffic(right,separation,offset,Math.PI));
  const b=await launch(right,separation,offset,Math.PI,startTraffic(left,0,0,0));
  const [fx,fy,m]=a.model.get('peerForce'),[gx,gy,n]=b.model.get('peerForce');
  assert(fx < -10 && gx > 10,'Both bows should resist closing');
  assert(Math.hypot(fx+gx,fy+gy)<1e-7,'Peer forces must cancel');
  assert(Math.abs(m+n+separation*gy-offset*gx)<1e-7,'Moments about the same origin must cancel');
  const above=snapshot(b);above[7]+=2;
  a.model.set('traffic',above);a.model.advance(.02);
  assert.deepEqual(a.model.get('peerForce'),[0,0,0]);
  for(let i=0;i<50;i++) {
    if(i%10===0)exchange(a,b);
    a.model.advance(.01);b.model.advance(.01);
  }
  assert(a.model.get('east')<b.model.get('east'));
  a.model.set('traffic',new Float64Array(36));a.model.advance(.02);
  assert.deepEqual(a.model.get('peerForce'),[0,0,0]);
  console.log(left,right,{forceEast:fx,yawMoment:m});
}

// The two origins are 75 cm apart vertically, but the rolled boat's low
// pontoon overlaps the upright NPC's bow.
const scene=new Float64Array(54);
scene.set([1,-115.9,-79.68,Math.PI,0,0,0,.2,1]);
const inputs={manualHelm:1,launchEast:-120,launchNorth:-80,launchHeight:.95,
  launchSpeed:0,launchHeading:0,windEast:0,windNorth:0,sceneTraffic:scene};
const heeled=await loadInstance('Hobie16',{...inputs,launchHeel:.82},read);
assert(heeled.get('sceneContact')[0]>100,'The player and NPC hulls overlap below their origins');
const upright=await loadInstance('Hobie16',inputs,read);
assert.equal(upright.get('sceneContact')[0],0,'Separated hulls receive no force');
