import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
async function sail(tack,vang,trim=0){
  const heading=-2.1, from=heading+tack*.95;
  const b=await loadInstance('Sailboat',{windEast:-9*Math.cos(from),windNorth:-9*Math.sin(from),manualHelm:1,vangInput:vang,trimInput:trim},read);
  let elevation=0,tension=0;
  for(let i=0;i<1000;i++){
    b.advance(.01);
    if(i>=500){elevation+=b.get('boomElevation')/500;tension+=b.get('vangTension')/500;}
  }
  return {turn:(b.get('heading')-heading)*180/Math.PI,elevation,tension};
}
const port=await sail(1,.5),starboard=await sail(-1,.5);
// At most six degrees of lee helm or twelve degrees of weather helm.
assert(port.turn > -6 && port.turn < 12 && starboard.turn < 6 && starboard.turn > -12);
const eased=await sail(1,0,1),tight=await sail(1,1,1);
// A loaded vang must depress the boom measurably (> one degree) at the same payout.
assert(eased.elevation>tight.elevation+Math.PI/180 && tight.tension>eased.tension+5);
console.log({port,starboard,eased,tight});
/* Check the wave also persists after the hull stops. */
const wake=await loadInstance('HullWake',{east:0,north:0,heading:0,surge:0,stations:[-1.1,-.82,-.3,.18,.63,.98,1.22],sectionVolume:[.003,.012,.018,.017,.01,.003,0,0,0,0,0,0]},read);
wake.advance(.05);
assert(wake.get('eta').every(z=>z===0));
let crest=0,maxPitch=0;
for(let i=0;i<70;i++){
  wake.set('east',1.3*i*.05);wake.set('surge',1.3);wake.advance(.05);
  crest=Math.max(crest,...wake.get('eta'));maxPitch=Math.max(maxPitch,Math.abs(wake.get('pitch')));
}
wake.set('surge',0);wake.advance(.05);
const residual=Math.max(...wake.get('eta'));
assert(crest>.001 && maxPitch>.0001 && residual>.001);
console.log({crest,maxPitch,residual});
