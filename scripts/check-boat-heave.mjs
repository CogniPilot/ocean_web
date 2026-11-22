import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {advanceHullWake} from '../viewer/board/boat.mjs';

const read=async url=>new Response(await readFile(url));
for(const [vessel,launchHeight,limit] of [['Sailboat',.069,.02],['Hobie16',.20,.05]]){
  // Hold the controls fixed so an autopilot tack or flying hull cannot be
  // mistaken for a vertical oscillation at the boat origin.
  const boat=await loadInstance(vessel,{launchHeight,launchSpeed:1,manualHelm:1,
    windEast:10,windNorth:4,currentEast:.2,currentNorth:.04,vangInput:.5},read);
  const wake=await loadInstance('HullWake',{east:-8,north:-7,currentEast:.2,currentNorth:.04,stations:boat.get('stationX'),separation:boat.get('halfSpacing')},read);
  let low=Infinity,high=-Infinity,peakWake=0;
  for(let tick=0;tick<3200;tick++){
    if(tick%5===0)advanceHullWake(boat,wake);
    boat.advance(.01);
    if(tick<500)continue;
    assert(boat.get('buoyancy')>1,vessel+' became airborne in flat water');
    low=Math.min(low,boat.get('heave'));
    high=Math.max(high,boat.get('heave'));
    peakWake=Math.max(peakWake,Math.abs(wake.get('level')));
  }
  assert(high-low<limit,vessel+' sustained heave oscillation');
  assert(peakWake>.001,vessel+' failed to generate a wake');
  console.log(vessel,{heaveRange:high-low,peakWake});
}
