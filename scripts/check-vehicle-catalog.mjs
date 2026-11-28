import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {npcRoom,vesselNpcNames} from '../viewer/npc-room.mjs';
import {oceanVehicles,vehicleCatalog,vehicleForRole} from '../viewer/vehicle-catalog.mjs';

assert.deepEqual(oceanVehicles.map(vehicle=>vehicle.id).sort(),
  ['diver','drone','gull','hobie','manta','motorboat','shark','sloop','sub','whale','whaler']);
assert.equal(vehicleCatalog.onrt.world,'basin');
assert.equal(vehicleForRole('boat',true),vehicleCatalog.hobie);
assert.equal(vehicleForRole('boat',false),vehicleCatalog.sloop);
assert.equal(vehicleForRole('whaler'),vehicleCatalog.whaler);
assert.equal(vehicleForRole('__proto__'),undefined);
assert.equal(vehicleCatalog.drone.capabilities.groundStation,true);

for(const vehicle of oceanVehicles){
  const {id,label,asset,capabilities}=vehicle;
  assert(vehicle.runtime && label);
  assert(Object.isFrozen(vehicle) && Object.isFrozen(capabilities));
  if(asset)await access(new URL('../viewer/assets/'+asset+'.glb',import.meta.url));
  if(capabilities.landingDeck)assert(capabilities.peerHullClass>0);
  if(capabilities.sternLift)assert(capabilities.landingDeck);
  if(capabilities.npc==='vessel')assert.equal(vesselNpcNames[id],label);
  else assert(!Object.hasOwn(vesselNpcNames,id));
  if(vehicle.category==='powerboat'){
    for(const feature of ['engine','fuel','anchor','bilge'])assert(capabilities[feature],id+' needs '+feature);
    assert.equal(capabilities.wake,'planing');
  }
}

const room=npcRoom();
room.connect({async send(){}},'owner');
assert(room.canSpawn('motorboat'));
assert(room.canSpawn('diver'));
assert(room.canSpawn('gull'));
assert(!room.canSpawn('whaler'));
assert(!room.canSpawn('onrt'));
assert.equal(vehicleCatalog.whaler.capabilities.peerHullClass,0);
assert(!vehicleCatalog.whaler.capabilities.landingDeck);
assert(!vehicleCatalog.whaler.capabilities.sternLift);

console.log('Playable roles, artwork and shared vehicle capabilities passed.');
