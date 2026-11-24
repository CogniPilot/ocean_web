// Execute the browser vehicle FMU and wave FMU at their production time steps.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadInstance} from '../../viewer/fmi3/instance.mjs';
import {elevation,loadBasin,vesselStep,waveCutCsv,wakeStep} from '../../viewer/onrt-basin.mjs';

const [out,headFile]=process.argv.slice(2);
if(!out)throw Error('Usage: node scripts/benchmarks/onrt-basin.mjs OUTPUT_DIR [Case3.12-000_EFD.dat]');
await mkdir(out,{recursive:true});
const read=async url=>new Response(await readFile(url));
const vehicle=inputs=>loadInstance('OnrTumblehome',inputs,read);
const report={};
const baseline=await vehicle({shaftDemand:538});
for(let i=0;i<9000;i++)baseline.advance(vesselStep);
report.calibratedSpeed_m_s=baseline.get('surge');
assert.ok(Math.abs(report.calibratedSpeed_m_s-1.11)<.002);
assert.ok(baseline.get('torque')[0]*baseline.get('torque')[1]<0);
// Delen & Bal (2024), ITU-AN, Tables 1, 3 and 6. Match measured shaft
// revolutions in the fully appended, free-running ship. The paper reports
// single-screw coefficients. Retain both predicted shafts and their mean.
report.ituSelfPropulsion=[];
for (const ref of [
  {Fr:.20,speed:1.111,rps:9.007,kt:.262,kq:.073,ktPercent:5.475,kqPercent:2.917},
  {Fr:.30,speed:1.667,rps:14.103,kt:.252,kq:.074,ktPercent:2.062,kqPercent:1.381},
]){
  const rpm=ref.rps*60;
  const m=await vehicle({initialSurge:ref.speed,initialRpm:rpm,shaftDemand:rpm});
  for(let i=0;i<10000;i++)m.advance(vesselStep);
  const [speed,thrust,torque,rho,D]=m.getMany(['surge','thrust','torque','rho','diameter']);
  const kt=thrust.map(t=>t/(rho*ref.rps**2*D**4));
  const kq=torque.map(q=>Math.abs(q)/(rho*ref.rps**2*D**5));
  report.ituSelfPropulsion.push({ref,speed_m_s:speed,kt,kq,
    ktErrorPercent:100*((kt[0]+kt[1])/(2*ref.kt)-1),
    kqErrorPercent:100*((kq[0]+kq[1])/(2*ref.kq)-1)});
}
report.turns=[];
for(const helm of [25,35]) {
  const m=await vehicle({helm,initialRpm:538,shaftDemand:538,initialSurge:1.11});
  const rows=['time_s,east_m,north_m,heading_rad,surge_m_s,sway_m_s,yaw_rad_s'];
  const diameters=[];
  let speedRatio=0;
  let advance,transfer,tactical;
  for(let i=1;i<=18000;i++){
    m.advance(vesselStep);
    if(i%10!==0)continue;
    const state=m.getMany(['east','north','heading','surge','sway','yawRate']);
    // Report midships, 0.0515 m ahead of the model origin, as SIMMAN specifies.
    const midship=1.625-3.147/2;
    if(advance===undefined && state[2]>=Math.PI/2){
      advance=state[0]+midship*(Math.cos(state[2])-1);
      transfer=state[1]+midship*Math.sin(state[2]);
    }
    if(tactical===undefined && state[2]>=Math.PI)tactical=state[1]+midship*Math.sin(state[2]);
    rows.push([m.time,...state].join(','));
    if(i>16000){
      const speed=Math.hypot(state[3],state[4]);
      diameters.push(2*speed/Math.abs(state[5]));speedRatio+=speed/1.11;
    }
  }
  const predicted=diameters.reduce((a,b)=>a+b)/diameters.length;
  assert.ok(Number.isFinite(predicted)&&predicted>0);
  const result={helm_deg:helm,steadyDiameter_m:predicted,steadyDiameter_L:predicted/3.147,
    steadySpeedRatio:speedRatio/diameters.length,advance_L:advance/3.147,transfer_L:transfer/3.147,tactical_L:tactical/3.147};
  if(helm===35)result.simmanFRMT={steadyDiameter_L:3.19,steadySpeedRatio:.63,advance_L:2.35,transfer_L:1.32,tactical_L:3.19};
  report.turns.push(result);
  await writeFile(join(out,'turn-'+helm+'.csv'),rows.join('\n')+'\n');
}
// Independent 20/20 starboard zigzag, SIMMAN Case 5.2.2. Reverse the
// command at each heading crossing, and measure the extrema after reversal.
const zig=await vehicle({initialSurge:1.11,initialRpm:538,shaftDemand:538,helm:-20});
let side=-1,extreme=0;
const overshoots=[];
for(let i=0;i<12000&&overshoots.length<2;i++){
  zig.advance(vesselStep);
  const [psi,rate]=zig.getMany(['heading','yawRate']).map(x=>x*180/Math.PI);
  if(side*psi>=20){
    side=-side;zig.set('helm',side*20);extreme=psi;
  }else if(extreme!==0){
    if(Math.abs(psi)>Math.abs(extreme))extreme=psi;
    if(side*rate>0){overshoots.push(Math.abs(extreme)-20);extreme=0;}
  }
}
assert.equal(overshoots.length,2);
report.zigzag={overshoots_deg:overshoots,simmanFRMT_deg:[5.9,5.4]};
const basin=await loadBasin({tow:1,towSpeed:1.11},read);
let state,tile;
for(let i=0;i<Math.round(30/wakeStep);i++)state=basin.advance();
tile=basin.wake.get('wakeHeight');
assert.ok(tile.every(Number.isFinite)&&Math.max(...tile)>1e-5);
assert.ok(Math.abs(state.surge-1.11)<.001);
await writeFile(join(out,'wave-cuts.csv'),waveCutCsv(state,tile));
report.tow={speed_m_s:state.surge,time_s:state.time,grid:64,period_m:12.8,
  maxElevation_m:Math.max(...tile),minElevation_m:Math.min(...tile),
  portMidship_m:elevation(tile,state.east,.49),starboardMidship_m:elevation(tile,state.east,-.49)};

if(headFile){
  const lines=(await readFile(headFile,'utf8')).trim().split(/\r?\n/);
  assert.ok(lines[0].includes('CASE3.12')&&lines[2].includes('EFD(IIHR)'));
  const rows=lines.slice(3).map(x=>x.trim().split(/\s+/).map(Number)).filter(r=>r[0]>=0);
  const L=3.147,U=1.11,A=.01*L,k=2*Math.PI/L,slope=k*A;
  const omegaEncounter=Math.sqrt(9.80665*k)+k*U;
  const rateUnit=omegaEncounter*slope;
  const first=rows[0];
  assert.equal(first[0],0);
  // Workshop frame X north, Y east, Z down; solver x forward, y port, z up.
  // Rotate the head-sea trial so the commanded course lies along solver east.
  const heading=-first[6]*slope;
  const m=await vehicle({
    shaftDemand:538,initialRpm:538,waveAmplitude:A,waveDirection:Math.PI,
    initialPhase:k*(1.625*Math.cos(heading)+.1*Math.sin(heading)),
    initialHeading:heading,initialSurge:first[7]*U,initialSway:-first[8]*U,
    initialYawRate:-first[12]*rateUnit,initialRoll:first[4]*slope,initialPitch:first[5]*slope,
    initialHeave:-first[3]*A,initialW:-first[9]*U,initialQ:first[11]*rateUnit,initialP:first[10]*rateUnit
  });
  const trace=['time_s,north_EFD_m,north_pred_m,east_EFD_m,east_pred_m,surge_EFD_m_s,surge_pred_m_s,heave_EFD_m,heave_pred_m'];
  let pos2=0,speed2=0,heave2=0,last=first;
  for(const r of rows){
    const t=r[0]*L/U, start=last[0]*L/U;
    while(m.time<t-1e-9){
      const dt=Math.min(vesselStep,t-m.time);
      const blend=Math.min(1,(m.time+.5*dt-start)/(t-start));
      m.set('helm',-(last[13]+blend*(r[13]-last[13])));
      m.advance(dt);
    }
    const [x,y,u,z]=m.getMany(['east','north','surge','heave']);
    pos2+=(x-r[1]*L)**2+(-y-r[2]*L)**2;speed2+=(u-r[7]*U)**2;heave2+=(z+r[3]*A)**2;
    trace.push([t,r[1]*L,x,r[2]*L,-y,r[7]*U,u,-r[3]*A,z].join(','));
    last=r;
  }
  report.headWave={samples:rows.length,seconds:m.time,
    trackRMSE_m:Math.sqrt(pos2/rows.length),surgeRMSE_m_s:Math.sqrt(speed2/rows.length),
    heaveRMSE_m:Math.sqrt(heave2/rows.length)};
  await writeFile(join(out,'head-wave.csv'),trace.join('\n')+'\n');
}
await writeFile(join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
