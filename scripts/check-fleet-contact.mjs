// Replay the same nine-field peer snapshots used by the WebRTC fleet.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const fields=['east','north','heading','ve','vn','yawRate','heave'];
async function launch(name,east,north,heading) {
  const model=await loadInstance(name,{manualHelm:1,launchHeading:heading,
    launchEast:east,launchNorth:north,launchSpeed:1.4,launchHeight:name==='Hobie16'?.2:.069},read);
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
  ['Sailboat','Sailboat',2.05,.18],['Hobie16','Hobie16',4.4,.16],['Hobie16','Sailboat',3.18,.84]
]) {
  const a=await launch(left,0,0,0),b=await launch(right,separation,offset,Math.PI);
  exchange(a,b);
  const [fx,fy,m]=a.model.get('peerForce'),[gx,gy,n]=b.model.get('peerForce');
  assert(fx < -10 && gx > 10,'Both bows should resist closing');
  assert(Math.hypot(fx+gx,fy+gy)<1e-7,'Peer forces must cancel');
  assert(Math.abs(m+n+separation*gy-offset*gx)<1e-7,'Moments about the same origin must cancel');
  const above=snapshot(b);above[7]+=2;
  a.model.set('traffic',above);assert.deepEqual(a.model.get('peerForce'),[0,0,0]);
  for(let i=0;i<50;i++) {
    if(i%10===0)exchange(a,b);
    a.model.advance(.01);b.model.advance(.01);
  }
  assert(a.model.get('east')<b.model.get('east'));
  a.model.set('traffic',new Float64Array(36));assert.deepEqual(a.model.get('peerForce'),[0,0,0]);
  console.log(left,right,{forceEast:fx,yawMoment:m});
}
