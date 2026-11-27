// Pass prepared world directories to check the coupled sailboats as well.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const kn=1852/3600;
function checkStart([windEast,windNorth,ve,vn,heading,cup,vane],label){
  const east=windEast-ve,north=windNorth-vn,speed=Math.hypot(east,north);
  assert(Math.abs(cup-speed)<1e-7,label+' cup speed differs from the local relative flow');
  if(speed>1e-6){
    const error=vane-(Math.atan2(-north,-east)-heading);
    assert(Math.abs(Math.atan2(Math.sin(error),Math.cos(error)))<1e-7,label+' vane points away from the wind source');
  }else assert.equal(vane,0,label+' calm vane');
  return cup/kn;
}
for(const plant of ['Hobie16','Sailboat','HobieFleetPilot']){
  const fleet=plant==='HobieFleetPilot',prefix=fleet?'boat.':'';
  for(const [speed,from,trueKnots] of [[17,180,25],[15,104,25],[17,0,25],[12,-90,25],[0,0,0]]){
    const heading=.31,angle=heading+from*Math.PI/180;
    const inputs=fleet?{initialEast:-500,initialNorth:-500,initialHeading:heading,initialSpeed:speed*kn}:
      {launchEast:-500,launchNorth:-500,launchHeading:heading,launchSpeed:speed*kn,manualHelm:1};
    const model=await loadInstance(plant,{...inputs,windEast:-trueKnots*kn*Math.cos(angle),windNorth:-trueKnots*kn*Math.sin(angle)},read);
    try{
      const values=model.getMany(['sailWind','ve','vn','heading','cupSpeed','vane'].map(key=>prefix+key));
      const measured=checkStart([...values[0],...values.slice(1)],plant);
      if(!fleet){
        const expected=Math.hypot(trueKnots*Math.cos(angle)+speed*Math.cos(heading),trueKnots*Math.sin(angle)+speed*Math.sin(heading));
        assert(Math.abs(measured-expected)<1e-7,plant+' launch geometry');
      }
      model.advance(.01);
      model.set('windEast',-30);model.set('windNorth',-6);
      model.advance(.01);
      const [cup,x,y]=model.getMany(['cupSpeed','awx','awy'].map(key=>prefix+key));
      assert(Math.abs(cup-Math.hypot(x,y))>.5,plant+' cups retain their response time after initialization');
    }finally{model.close();}
  }
  console.log(plant+' cold-start cups and vane passed on both tacks, astern, ahead and in zero true wind.');
}
if(process.argv.length>2){
  const {openFmuSession}=await import('../.deps/microduck_web/site/fmu-session.js');
  const {fileFetch}=await import('../.deps/microduck_web/scripts/fmu-test-support.mjs');
  for(const directory of process.argv.slice(2)){
    const base=pathToFileURL(resolve(directory)+'/');
    const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
    const index=JSON.parse(await readFile(new URL(manifest.index,base)));
    for(const [heading,speed] of [[0,0],[.3,6],[-1.2,9]]){
      const parameters={'boat.launchHeading':heading,'boat.launchSpeed':speed};
      const world=await openFmuSession({index,base,parameters,fetch:fileFetch});
      try{
        const names=['sailWind[1]','sailWind[2]','ve','vn','heading','cupSpeed','vane'].map(key=>'boat.'+key);
        checkStart(world.read_values(JSON.stringify(names)),index.modelName);
        world.step(.01);
        assert(Array.from(world.read_values(JSON.stringify(names))).every(Number.isFinite));
      }finally{world.free();}
    }
    console.log(index.modelName+' cold-start cups and vane passed against the coupled local gust and boat velocity.');
  }
}
