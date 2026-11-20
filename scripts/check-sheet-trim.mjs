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
  return {main:boat.get('lineTarget')[0],jib:boat.get('jibSheet'),sag:boat.get('exposedSheetSag')};
}
const eased=hold(1),hauled=hold(-1);
assert(hauled.main<eased.main&&hauled.jib<eased.jib);
assert(Math.max(...eased.sag,...hauled.sag)<.12);
console.log({eased,hauled});
