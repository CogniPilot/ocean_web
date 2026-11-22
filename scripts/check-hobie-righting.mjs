// Exercise the simulated crew and sheet release on either side of a Hobie 16.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=pathToFileURL(resolve(process.argv[2]??'viewer/fmi3')+'/');
const {loadInstance}=await import(new URL('instance.mjs',base));
const read=async url=>new Response(await readFile(url));
const deg=Math.PI/180;
const fields=['heel','ballastY','ballastZ','massRoll','payout','lineTension'];

async function launch(heel,heave,windNorth,ballastManual=0){
  return loadInstance('Hobie16',{launchEast:-140,launchNorth:-80,launchSpeed:0,launchHeading:0,
    launchHeel:heel*deg,launchHeight:heave,manualHelm:1,ballastManual,downhaulInput:.5,
    outhaulInput:.65,windEast:0,windNorth},read);
}

for(const side of [-1,1]){
  for(const beamWind of [0,6]){
    const boat=await launch(90*side,.98,-beamWind*side);
    const mass=boat.get('ballastMass');
    assert.equal(mass,60,'Exercise the default crew mass');
    let righted,slack=false,leaned=false,armed=false;
    for(let i=0;i<400;i++){
      boat.advance(.02);
      const [heel,y,z,moment,payout,tension]=boat.getMany(fields);
      const rightingSide=boat.get('rightingSide');
      const weightMoment=-9.80665*mass*(Math.cos(heel)*y-Math.sin(heel)*z);
      assert(Math.abs(moment-weightMoment)<1e-7,'The moving crew applies its gravity moment');
      if(rightingSide!==0){
        armed=true;
        assert.equal(rightingSide,-side,'The righting stance is on the lower hull');
        if(z<-.75&&rightingSide*y>.8&&rightingSide*moment>350)leaned=true;
        if(payout>.5&&Math.max(...tension)<1)slack=true;
      }
      if(armed&&Math.abs(heel)<25*deg)righted??=boat.time;
    }
    assert(armed&&leaned&&slack,'The crew stood on the lower hull, leaned and released both sheets');
    assert(righted>2&&righted<5,'The hull came up progressively under the crew weight');
    assert.equal(boat.get('rightingSide'),0,'The crew left the righting stance');
    assert(Math.abs(boat.get('ballastZ')-.52)<.025,'The crew returned to sailing height');
    assert(Math.abs(boat.get('heel'))<10*deg,'The cat settled back upright');
    console.log({side,beamWind,righted});
  }
}

for(const {heel,heave,manual} of [
  {heel:40,heave:.25,manual:0},
  {heel:90,heave:.98,manual:1},
  {heel:180,heave:.90,manual:0},
]){
  const boat=await launch(heel,heave,0,manual);
  for(let i=0;i<25;i++){
    boat.advance(.02);
    assert.equal(boat.get('rightingSide'),0,'No automatic attempt when below threshold, in manual or fully inverted');
    assert(Math.abs(boat.get('ballastZ')-.52)<1e-8,'Normal vertical position is preserved');
  }
}
