// Exercise the diver FMU through the same held valves used by keyboard and touch.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {keyboardAxisKey,keyboardSticks} from '../viewer/keyboard-sticks.mjs';

const directory=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../viewer/fmi3/',import.meta.url);
const {loadInstance}=await import(new URL('instance.mjs',directory));
const read=async url=>new Response(await readFile(url));
function spawn(depth,extra={}){
  return loadInstance('ScubaDiver',{policyMode:1,bedHeight:-100,
    initialState:[0,0,-depth,0,0,0,0,0,0,0,0,0,0,0,0,0],...extra},read);
}
function near(actual,expected,tolerance){assert(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);}
for(const layout of ['wasd','mode2']){
  const keyboard=keyboardSticks();
  assert.equal(keyboardAxisKey('KeyR',layout,'diver'),'ArrowUp');
  for(const [code,valve] of [['ArrowUp','VestInflate'],['ArrowDown','VestVent']]){
    assert.equal(keyboardAxisKey(code,layout,'diver'),valve);
    keyboard.press(valve,0);assert.equal(keyboard.get(valve),1);
    keyboard.release(valve,50);assert.equal(keyboard.get(valve),0);
  }
}

const diver=await spawn(10);
near(diver.get('vestLitres'),3,.001);
diver.set('vestValve',1);diver.advance(1);
const gas=diver.get('vestGas'),litres=diver.get('vestLitres');
assert(litres>3.9 && diver.get('vestLift')>9 && diver.get('state')[5]>0);
diver.set('vestValve',0);diver.advance(.25);near(diver.get('vestGas'),gas,1e-8);
diver.set('waterLevel',10);diver.advance(.0001);
near(diver.get('vestLitres'),gas/diver.get('gauge')[1],1e-5);
assert(diver.get('vestLitres')<litres*.7);
const resumed=await spawn(10,{initialVestGas:gas,initialWaterLevel:10,waterLevel:10});
near(resumed.get('vestGas'),gas,.00001);
diver.set('vestValve',-1);diver.advance(1);assert(diver.get('vestLift')<0);
diver.advance(4);assert(diver.get('vestLitres')>=0&&diver.get('vestLitres')<.001);

const ashore=await spawn(-2,{bedHeight:1.75}); // Isolate inflator flow from breathing.
const startingGas=ashore.get('vestGas'),startingBar=ashore.get('dive')[0];
ashore.set('vestValve',1);ashore.advance(.4);
near((startingBar-ashore.get('dive')[0])*12,ashore.get('vestGas')-startingGas,.001);
const emptyDive=ashore.get('dive');emptyDive[0]=0;
const empty=await spawn(10,{initialDive:emptyDive,initialVestGas:0,vestValve:1});
empty.advance(.4);near(empty.get('vestGas'),0,.00001);
const full=await spawn(30,{initialVestGas:55});full.set('waterLevel',-25);full.advance(.5);
assert(full.get('vestLitres')<=15 && full.get('vestGas')<26);
console.log('BCD keyboard mappings, neutral spawn, fill and vent, gas transfer, Boyle compression, relief and host restore passed.');

// Sample settled freeboard at two inflation levels. The regulator may break
// the surface while the torso origin and most of the inflated jacket stay wet.
async function freeboard(litres) {
  const depth=.36,ambient=1.01325+1025*9.80665/100000*depth;
  const f=await spawn(depth,{initialState:[0,0,-depth,0,0,0,0,1.40,0,0,0,0,0,0,0,0],initialVestGas:ambient*litres});
  assert(f.get('mouthHeight')>0,'upright regulator starts above water');
  f.advance(9);
  let torso=0,mouth=0,vest=0;
  for(let i=0;i<20;i++){
    f.advance(.1);
    torso+=f.get('state')[2]/20;mouth+=f.get('mouthHeight')/20;vest+=f.get('vestWet')/20;
  }
  assert.equal(f.get('upright'),0,'afloat orientation must come from the free body');
  return {torso,mouth,vest};
}
const partialSurface=await freeboard(8),fullSurface=await freeboard(15);
assert(fullSurface.torso<-.10 && fullSurface.torso>-.55 && fullSurface.vest>.65,'most of the inflated jacket should remain wet');
assert(partialSurface.torso<fullSurface.torso-.035,'Additional gas raises the diver at the surface');
console.log('Free-floating jacket immersion and relative freeboard passed.',{partialSurface,fullSurface});
