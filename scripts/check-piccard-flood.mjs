import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',root));
const read=async url=>new Response(await readFile(url));
const open=async up=>loadInstance('Wreck_Plant',{
  manual:1,manualMode:2,spawnPosition:[-29,-30,up],windSpeed:0,seaState:0,
  'ocean.profile':[0,0,0,8,0,0,16,0,0],'ocean.tidalSpeed':0
},read);
const advance=(plant,count)=>{for(let i=0;i<count;i++)plant.advance(.01);};
const sub=await open(-8);
assert.deepEqual(sub.get('floodState'),[0,0,0,1]);
sub.set('pilot',[0,0,0,1]);
advance(sub,25);
assert.ok(Math.max(...sub.get('motor').map(Math.abs))>1);
sub.set('flood',1);
advance(sub,5);
sub.set('flood',0);
const z0=sub.get('position')[2];
let previous=0;
for(let i=0;i<11;i++){
  advance(sub,100);
  const [latch,fraction,kilograms,power]=sub.get('floodState');
  assert.equal(latch,1);
  assert.equal(power,0);
  assert.ok(fraction>=previous && fraction<1);
  assert.ok(Math.abs(kilograms-1025*.0032*fraction)<1e-8);
  previous=fraction;
}
const z=sub.get('position')[2],power=sub.get('batteryTelemetry');
assert.ok(z<z0-1 && previous>.3,'Breach causes descent despite a held ascend command');
assert.ok(power[2]===0 && power[4]===0 && power[0]>.99,'Bus isolated while pack remains charged');
assert.ok(sub.get('appliedThrust').every(x=>Math.abs(x)<1e-6),'Rotor thrust decays after cutoff');
const dry=await open(2);
dry.set('flood',1);
advance(dry,1);
assert.equal(dry.get('floodState')[2],0,'Exposed breach draws no water above the surface');
const fresh=await open(-8);
assert.deepEqual(fresh.get('floodState'),[0,0,0,1],'Respawning into a fresh FMU restores dry, powered state');
console.log({depthChange:z-z0,waterKg:sub.get('floodState')[2],fraction:previous,packCurrent:power[2]});
