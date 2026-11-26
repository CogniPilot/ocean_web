// Exercise the two browser spawn transforms and DVL returns through the actual navigation FMU.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {wreckSites,wreckApproach} from '../viewer/red-sea-sites.mjs';

const read=async url=>new Response(await readFile(url));
for(const site of [...wreckSites,null]){
  const spawn=site?wreckApproach(site):{position:[5.4,.78,-5],heading:0};
  const {position,heading}=spawn;
  const truth=[...position,Math.cos(heading/2),0,0,Math.sin(heading/2),
    0,0,0,0,1025*9.80665*(.29-position[2]),0,0,9.80665,0,0,0];
  const model=await loadInstance('Wreck_Navigation',{stamp:0,truth,idleCamera:0,useSonar:1},read);
  const state=model.get('estimate'),ranges=model.get('sensor').slice(4,8);
  assert(Math.hypot(...position.map((v,i)=>v-state[i]))<.03,'Estimated initial position');
  assert(Math.abs(state[3]-heading)<1e-5,'Estimated initial yaw');
  if(site){
    assert(model.get('ping').some(word=>word>0),'Imaging sonar at '+site.name);
    assert(ranges.every(r=>r>0),'DVL at '+site.name);
  }else{
    const slant=(position[2]-.15+13.7)/Math.cos(Math.PI/8);
    assert(ranges.every(r=>Math.abs(r-slant)<.025),'Only the bed is below the old wreck site');
  }
  console.log(site?.name??'Old site',state.slice(0,3),ranges);
}
