// Prescribed level tow in calm water. speed is through-water m/s, heading is rad.
// Usage: node scripts/tow-study.mjs 2 1.02 0 > tow.csv
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const {positionals,values}=parseArgs({allowPositionals:true,options:{'wave-field':{type:'string'}}});
const [speed=2,separation=1.02,heading=0]=positionals.map(Number);
if(![speed,separation,heading].every(Number.isFinite)||speed<0||separation<0)throw Error('Expected speed, half-spacing and heading');
const read=async url=>new Response(await readFile(url));
const hull=await loadInstance('Hobie16',{launchSpeed:0,launchHeight:.2},read);
const stations=hull.get('stationX'),length=stations[stations.length-1]-stations[0];
const water=await loadInstance('WakeSpectrum',{volume:hull.get('sectionVolume'),stations,
  beamHalf:hull.get('beamHalf'),separation,heading},read);
const c=Math.cos(heading),s=Math.sin(heading);
console.log('time_s,distance_m,speed_m_s,half_spacing_m,heading_rad,froude_length,resistance_N,side_force_N,yaw_Nm,crest_m,trough_m');
let distance=0;
for(let i=1;i<=120;i++){
  const t=i*.1,u=speed*Math.min(1,t/2);
  distance+=u*.1;water.set('east',c*distance);water.set('north',s*distance);water.advance(.1);
  const [fx,fy,moment]=water.get('waveLoad'),waves=water.get('height');
  console.log([t,distance,u,separation,heading,u/Math.sqrt(9.80665*length),-fx*c-fy*s,-fx*s+fy*c,moment,Math.max(...waves),Math.min(...waves)].join(','));
}
if(values['wave-field']){
  const wake=water.get('wakeHeight'),side=Math.sqrt(wake.length),period=water.get('period');
  const wrap=coordinate=>coordinate-period*Math.round(coordinate/period);
  const rows=['time_s,x_forward_m,y_port_m,wake_elevation_m'];
  for(let row=0;row<side;row++)for(let column=0;column<side;column++){
    const east=wrap(column*period/side-c*distance),north=wrap(row*period/side-s*distance);
    rows.push([water.time,c*east+s*north,-s*east+c*north,wake[row*side+column]].join(','));
  }
  await writeFile(values['wave-field'],rows.join('\n')+'\n',{flag:'wx'});
}
