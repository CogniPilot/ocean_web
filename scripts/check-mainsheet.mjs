// Haul, ease, and haul again under wind in the compiled Hobie plant.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const boat=await loadInstance('Hobie16',{windEast:4,windNorth:7,manualHelm:1,downhaulInput:.85,
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
  const [gap,load,span,paid,stiffness,pins,stack]=boat.getMany([
    'mainBlockClearance','mainTension','lineSpan','linePaid','mainSheetStiffness','mainBlockPins','blockStack'
  ]);
  const pinSpan=Math.hypot(pins[3]-pins[0],pins[4]-pins[1],pins[5]-pins[2]);
  assert(Math.abs(span[0]-pinSpan)<1e-8,'The rendered tackle spans the two load-bearing pins');
  if(command<0){
    assert(gap<.30 && load>100,'Hauling loads the tackle at its working clearance');
    assert(span[0]>stack-.015,'The tackle closes without passing through the stacked blocks');
    assert(span[0]-paid[0]<.016,'excessive extension across hauled blocks');
  }else assert(gap>.4 && load===0,'an eased slack sheet should exert no force');
  console.log({command,clearanceM:gap,tackleForceN:load,extensionM:Math.max(0,span[0]-paid[0]),stiffness});
}
assert(peakBend>.075 && peakBend<.30,'A working sheet and luff load bend the mast without collapse');
console.log({peakMastheadDeflectionM:peakBend});

const calm=await loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchHeading:0,
  launchSpeed:0,launchHeight:.18,manualHelm:1,deckManual:1,trimInput:1,downhaulInput:.5},
  async url=>new Response(await readFile(url)));
for(let i=0;i<350;i++)calm.advance(.02);
const [aftClearance,elevation,tension,stations]=calm.getMany([
  'boomDeckClearance','boomElevation','mainTension','mastStations'
]);
assert(aftClearance>.40&&aftClearance<.50,'The free leech carries the aft boom above the crossbar');
assert(Math.abs(elevation)<.045&&tension<1,'The eased boom sits nearly level on a slack mainsheet');
assert(stations[0]-stations[21]>.75&&stations[0]-stations[21]<1.10,'The standing mast rakes aft');
console.log({calmEasedAftClearanceM:aftClearance,boomDegrees:elevation*180/Math.PI});
