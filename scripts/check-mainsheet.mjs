// Haul, ease, and haul again under wind in the compiled Hobie plant.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const boat=await loadInstance('Hobie16',{windEast:4,windNorth:7,manualHelm:1,
  launchHeading:0,launchSpeed:2.4,launchHeight:.2,deckManual:1},async url=>new Response(await readFile(url)));
let peakBend=0;
for(const command of [-1,1,-1]){
  boat.set('trimInput',command);
  for(let i=0;i<400;i++){
    boat.advance(.01);
    const [tip,load]=boat.getMany(['mastTip','mainTension']);
    assert(Number.isFinite(tip) && Number.isFinite(load) && load>=0);
    assert(load<5000, 'mainsheet overloaded during a manual haul');
    peakBend=Math.max(peakBend,Math.abs(tip));
  }
  const [gap,load,span,paid,stiffness]=boat.getMany(['mainBlockClearance','mainTension','lineSpan','linePaid','mainSheetStiffness']);
  if(command<0){
    assert(gap<.002 && load>0);
    const elevation=boat.get('boomElevation');
    const closed=Math.asin((boat.get('travelerRiser')-.5+boat.get('tackDrop')+boat.get('blockStack'))/boat.get('attachRadius')[0]);
    assert(Math.abs(elevation-closed)<.02,'boom did not stop at the traveler pin');
    assert(boat.get('mastTip')<-.04,'loaded leech should bend the masthead aft');
    assert(span[0]-paid[0]<.016,'excessive extension across hauled blocks');
  }else assert(gap>.4 && load===0,'an eased slack sheet should exert no force');
  console.log({command,clearanceM:gap,tackleForceN:load,extensionM:Math.max(0,span[0]-paid[0]),stiffness});
}
assert(peakBend>.04 && peakBend<.5);
console.log({peakMastheadDeflectionM:peakBend});
