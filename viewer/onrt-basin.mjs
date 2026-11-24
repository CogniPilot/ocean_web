// The viewer and the headless tow study run these same compiled Modelica models.
import {loadInstance} from './fmi3/instance.mjs';

export const period = 12.8;
export const wakeStep = 0.04;
export const vesselStep = 0.01;
export const stateNames = ['east','north','heading','heave','pitch','roll','surge','sway','yawRate',
  'rpm','rudder','propAngle','resistance','thrust','torque','waveOmega','waveNumber','immersedVolume','generatorProfile','plungerTravel','trainDuration','driveDuration'];

export async function loadBasin(inputs={}, read=fetch) {
  const geometry = await read(new URL('./assets/onrt/wake.json', import.meta.url)).then(r=>r.json());
  const vessel=await loadInstance('OnrTumblehome',{...inputs,stations:geometry.stations,
    beamHalf:geometry.beamHalf,bareVolume:geometry.volume.slice(0,6)},read);
  function wakeInputs(s){
    return {east:s.east,north:s.north,heading:s.heading,pitch:s.pitch,heel:s.roll,
      volume:[...s.immersedVolume,0,0,0,0,0,0]};
  }
  // The wake FMU samples its displacement history during initialization.
  // Seed it with the vessel's actual release pose and submerged sections.
  const wake=await loadInstance('OnrtWake',{...geometry,period,edgeDamping:9,
    depth:inputs.depth??3,separation:0,...wakeInputs(snapshot())},read);
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
    for(const [name,value] of Object.entries(wakeInputs(s)))wake.set(name,value);
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

// Case 3.12 locates the probe beside the forward perpendicular at release.
export function bowGaugeElevation(s,tile,wave) {
  const x=1.625*Math.cos(s.pitch)+.1*Math.sin(s.roll)*Math.sin(s.pitch);
  const z=.1*Math.cos(s.roll);
  const east=s.east+x*Math.cos(s.heading)+z*Math.sin(s.heading);
  const north=s.north+x*Math.sin(s.heading)-z*Math.cos(s.heading);
  const along=east*Math.cos(wave.waveDirection)+north*Math.sin(wave.waveDirection);
  return elevation(tile,east,north)+wave.waveAmplitude*Math.cos(s.waveNumber*along-s.waveOmega*s.time+wave.initialPhase);
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
