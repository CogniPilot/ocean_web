// Late arrival after the room has sailed through a change of wind direction.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
const base=pathToFileURL(resolve(process.argv[2]??'build/world-runtime')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const names=['wind.gustEast','wind.gustNorth','wind.strikeBearing','wind.strikeFlash','wind.thunderArrival'];
for(let j=1;j<=48;j++)for(let i=1;i<=48;i++)for(const k of [1,2])names.push(`wind.field[${j},${i},${k}]`);
function windAt(fields,east,north,axis,period){
  const x=48*east/period,y=48*north/period,i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;
  const wrap=k=>(k%48+48)%48;
  const at=(row,col)=>fields[5+2*(48*wrap(row)+wrap(col))+axis];
  return (1-b)*((1-a)*at(j,i)+a*at(j,i+1))+b*((1-a)*at(j+1,i)+a*at(j+1,i+1));
}
const hosts=[];
try{
  for(let i=0;i<3;i++)hosts.push(await openFmuSession({index,base,fetch:fileFetch}));
  const [first,late,control]=hosts;
  const writes=(host,values)=>host.set_inputs(JSON.stringify(Object.entries(values)));
  const read=(host,fields)=>host.read_values(JSON.stringify(fields));
  const tick=(host,n)=>{for(let i=0;i<n;i++)host.step(.01);};
  writes(first,{windSpeed:18,windBearing:Math.PI/2});
  tick(first,50);
  const [period]=read(first,['wind.period']);
  const [east,north]=read(first,['wind.gustEast','wind.gustNorth']);
  for(const host of hosts)writes(host,{windSpeed:7,windBearing:-.4});
  writes(late,{seaClockOffset:.5,'windAnchor[2]':east,'windAnchor[3]':north});
  writes(control,{seaClockOffset:.5});
  const bindings=hosts.map(host=>host.bind_outputs(JSON.stringify(names)));
  let compared=0,maxError=0,unanchoredWindError=0;
  for(let frame=0;frame<4;frame++){
    for(const host of hosts)tick(host,25);
    const [a,b,c]=hosts.map((host,i)=>host.read_bound(bindings[i]));
    for(const [host,field] of [[first,a],[late,b]]){
      const [x,y,boatE,boatN,u,v,droneE,droneN]=read(host,['boat.east','boat.north','boat.windEast','boat.windNorth',
        'drone.position[1]','drone.position[2]','drone.windENU[1]','drone.windENU[2]']);
      for(const [east,north,wx,wy] of [[x,y,boatE,boatN],[u,v,droneE,droneN]]){
        assert(Math.abs(windAt(field,east,north,0,period)-wx)<1e-7);
        assert(Math.abs(windAt(field,east,north,1,period)-wy)<1e-7);
      }
    }
    for(let i=0;i<a.length;i++){
      maxError=Math.max(maxError,Math.abs(a[i]-b[i]));
      if(i>=5)unanchoredWindError=Math.max(unanchoredWindError,Math.abs(a[i]-c[i]));
      compared++;
    }
  }
  console.log({compared,maxError,unanchoredWindError});
  assert(maxError<1e-7 && unanchoredWindError>.05);
}finally{for(const host of hosts)host.free();}
