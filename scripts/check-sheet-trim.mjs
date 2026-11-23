// Exercise the production FMU through the same direction commands as the helm.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const boat=await loadInstance('Hobie16',{manualHelm:1,windEast:6,windNorth:3},read);
function hold(command){
  boat.set('trimInput',command);
  for(let i=0;i<450;i++){
    boat.advance(.01);
    const sag=boat.get('exposedSheetSag'),tension=boat.get('lineTension');
    assert(sag.every(x=>Number.isFinite(x)&&x>=0));
    assert(tension.every(x=>x>=0));
  }
  const [target,jib,sag,pins]=boat.getMany(['lineTarget','jibSheet','exposedSheetSag','jibSheetPins']);
  const jibClearance=Math.min(pins[2],pins[5],pins[8],pins[11],pins[14])-.414;
  assert(Math.max(sag[1],sag[2])<=Math.max(0,jibClearance)+1e-9,'Slack jib sheets settle onto the trampoline');
  return {main:target[0],jib,sag};
}
const eased=hold(1),hauled=hold(-1);
assert(hauled.main<eased.main&&hauled.jib<eased.jib);
assert(eased.jib<.35, "Releasing the main in this wind does not fully ease the automatic jib");
assert(Math.max(eased.sag[0],hauled.sag[0])<.12);
console.log({eased,hauled});
