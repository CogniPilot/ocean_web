// Exercise survey selection and resume semantics with the emitted Piccard plant.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const plant=await loadInstance('Wreck_Plant',{manual:1},read);
function observe(east,north,up){
  const sensor=Array(91).fill(0);
  sensor[58]=1025*9.80665*(.29-up);
  sensor[59]=east;sensor[60]=north;sensor[62]=1;sensor[87]=9.80665;
  plant.set('sensor',sensor);
}
function tick(count){
  for(let i=0;i<count;i++)plant.advance(.01);
}
function check(waypoint,site){
  const result=plant.get('surveyTelemetry');
  assert.deepEqual([result[0],result[1],result[2],result[15]],[waypoint,9,0,site]);
}
observe(-24,21.4,-10.1);
tick(81);check(1,0);
plant.set('manual',0);tick(20);check(1,1);
tick(20);check(2,1);

plant.set('manual',1);observe(-30,21.4,-10.1);
tick(100);check(2,1);
plant.set('manual',0);tick(20);check(2,1);
tick(20);check(3,1);

// A confirmed carrier transfer moves the actual plant into the second site's harbor basin.
plant.set('manual',1);
const mount=[56,-58.3,-8,0,0,0,Math.PI/2];
plant.set('hoist',[2,...mount]);tick(40);check(3,1);
plant.set('hoist',[-1,...mount]);observe(...mount.slice(0,3));tick(30);
plant.set('hoist',Array(8).fill(0));plant.set('manual',0);
tick(22);check(1,2);observe(56,-57,-8.5);
tick(40);check(2,2);
console.log('Survey pauses, resumes and chooses a new local route after a site transfer.');
