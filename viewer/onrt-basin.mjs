// The viewer and the headless tow study run these same compiled Modelica models.
import {loadInstance} from './fmi3/instance.mjs';

export const period = 12.8;
export const wakeStep = 0.04;
export const vesselStep = 0.01;
export const stateNames = ['east','north','heading','heave','pitch','roll','surge','sway','yawRate',
  'rpm','rudder','propAngle','resistance','thrust','torque','waveOmega','waveNumber','immersedVolume','generatorProfile','plungerTravel','trainDuration','driveDuration'];

export async function loadBasin(inputs={}, read=fetch) {
  const geometry = await read(new URL('./assets/onrt/wake.json', import.meta.url)).then(r=>r.json());
  const [vessel,wake] = await Promise.all([
    loadInstance('OnrTumblehome',{...inputs,stations:geometry.stations,beamHalf:geometry.beamHalf,
      bareVolume:geometry.volume.slice(0,6)},read),
    loadInstance('OnrtWake',{...geometry,period,edgeDamping:9,depth:inputs.depth??3,separation:0},read)
  ]);
  function snapshot() {
    const values=vessel.getMany(stateNames);
    const s=Object.fromEntries(stateNames.map((name,i)=>[name,values[i]]));
    s.time=vessel.time;
    return s;
  }
  function advance(helmAt) {
    for(let i=0;i<4;i++){
      if(helmAt)vessel.set('helm',helmAt(vessel.time+.5*vesselStep));
      vessel.advance(vesselStep);
    }
    const s=snapshot();
    for(const name of ['east','north','heading','pitch']) wake.set(name,s[name]);
    wake.set('heel',s.roll);
    wake.set('volume',[...s.immersedVolume,0,0,0,0,0,0]);
    wake.advance(wakeStep);
    return s;
  }
  return {vessel,wake,geometry,advance,snapshot};
}

// Sample the periodic native field at a physical probe with bilinear interpolation.
export function elevation(tile,east,north) {
  const n=Math.sqrt(tile.length), u=east*n/period, v=north*n/period;
  const i=Math.floor(u), j=Math.floor(v), a=u-i, b=v-j;
  const wrap=k=>(k%n+n)%n;
  const at=(x,y)=>tile[wrap(y)*n+wrap(x)];
  return (1-b)*((1-a)*at(i,j)+a*at(i+1,j))+b*((1-a)*at(i,j+1)+a*at(i+1,j+1));
}

export function waveCutCsv(s,tile) {
  const rows=['time_s,surge_m_s,rpm,x_aft_of_FP_m,offset_to_port_m,wake_elevation_m,inside_undamped_window'];
  for(const offset of [.49,1.14]) {
    for(let i=0;i<=160;i++) {
      const xAft=i*.05, forward=1.625-xAft;
      const e=s.east+forward*Math.cos(s.heading)-offset*Math.sin(s.heading);
      const n=s.north+forward*Math.sin(s.heading)+offset*Math.cos(s.heading);
      const inside=Math.max(Math.abs(e-s.east),Math.abs(n-s.north)) < .30*period;
      rows.push([s.time,s.surge,s.rpm,xAft,offset,inside?elevation(tile,e,n):'',Number(inside)].join(','));
    }
  }
  return rows.join('\n')+'\n';
}
