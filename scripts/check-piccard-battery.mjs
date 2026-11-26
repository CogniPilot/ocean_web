// Run against the standalone Plant browser FMU. Tests the fitted load under real drive commands.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',root));
const read=async url=>new Response(await readFile(url));
const inputs={manual:1,manualMode:3,windSpeed:0,windDirection:0,seaState:0,spawnPosition:[-24,18,-8]};
async function open(parameters={}){
  return loadInstance('Wreck_Plant',{...inputs,...parameters},read);
}
const plant=await open();
const initial=plant.get('batteryTelemetry');
assert.equal(initial[0],1);
assert.equal(initial[3],10);
assert.ok(initial[1]>25 && initial[1]<=25.2);
assert.ok(initial[2]>0);
assert.ok(initial[4]>=18);
let integrated=0,priorI=initial[2],maxDrive=0,maxDischarge=0;
for(let tick=0;tick<500;tick++){
  plant.set('pilot',[tick<250?2:-2,0,0,0]);
  plant.advance(.01);
  const [soc,volts,amps,ah,watts]=plant.get('batteryTelemetry');
  const motors=plant.get('battery.motorCurrent');
  assert.ok(motors.every(a=>Number.isFinite(a)&&a>=0));
  assert.ok(Math.abs(watts-volts*amps*.94)<1e-7);
  assert.ok(Math.abs(ah/10-soc)<1e-10);
  maxDrive=Math.max(maxDrive,...motors);maxDischarge=Math.max(maxDischarge,amps);
  integrated+=(priorI+amps)*.5*.01/3600; priorI=amps;
}
assert.ok(maxDrive>1 && maxDischarge>3);
assert.ok(Math.abs(10-plant.get('batteryTelemetry')[3]-integrated)<2e-5);
const low=await open({'battery.capacityAh':.01,'battery.initialSoc':.01,pilot:[2,0,0,0]});
for(let i=0;i<240;i++)low.advance(.01);
const [soc,,amps,ah,watts]=low.get('batteryTelemetry');
assert.deepEqual([soc,amps,ah,watts],[0,0,0,0]);
assert.ok(Math.max(...low.get('appliedThrust').map(Math.abs))<.001);
console.log({initial,remainingAh:plant.get('batteryTelemetry')[3],integratedAh:integrated,maxMotorA:maxDrive,maxPackA:maxDischarge,depletedAppliedN:low.get('appliedThrust')});
