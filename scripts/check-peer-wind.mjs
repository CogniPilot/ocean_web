// Check the local wind used by the rig through the browser FMU bindings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
for(const hull of ['Hobie16','Sailboat']){
  const model=await loadInstance(hull,{windEast:10,windNorth:0,launchEast:0,launchNorth:0},read);
  const traffic=new Float64Array(36);
  function wind(x,y,vx=0,vy=0,twin=1){
    traffic.set([1,x,y,0,vx,vy,0,0,twin]);
    model.set('traffic',traffic);
    return Array.from(model.get('sailWind'));
  }
  assert.deepEqual(Array.from(model.get('sailWind')),[10,0]);
  assert.deepEqual(wind(8,0),[10,0]);
  assert.deepEqual(wind(-60,0),[10,0]);
  const [lee]=wind(-8,0);
  assert(lee<9 && lee>6);
  assert(wind(-16,0)[0]>lee);
  assert(wind(-8,5)[0]>lee);
  assert(wind(-8,0,0,0,0)[0]>lee);
  assert.deepEqual(wind(-8,0,10,0),[10,0]);
  const shifted=wind(-8,4,0,5);
  assert(shifted[0]<9 && shifted[1]>0);
  traffic.fill(0);model.set('traffic',traffic);
  assert.deepEqual(Array.from(model.get('sailWind')),[10,0]);
  const clear=await loadInstance(hull,{windEast:10,windNorth:0,launchEast:0,launchNorth:0},read);
  let forceDifference=0;
  for(let i=0;i<100;i++){
    wind(model.get('east')-8,model.get('north'));
    model.advance(.01);clear.advance(.01);
    assert.deepEqual(Array.from(model.get('peerForce')),[0,0,0]);
    forceDifference=Math.max(forceDifference,Math.abs(model.get('sailForward')[0]-clear.get('sailForward')[0]));
  }
  assert(forceDifference>1,'Expected a change in mainsail force outside hull contact');
  console.log(hull,{lee,shifted,forceDifference});
}
