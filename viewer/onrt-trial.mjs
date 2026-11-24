// Tokyo 2015 Case 3.12-000. Rotate the workshop course onto basin east.
// Workshop Y is starboard and Z is down. Basin north is port, heave is up.
export function readHeadSeaTrial(text){
  const [title,columns,zone,...lines]=text.trim().split(/\r?\n/);
  if(!title.includes('CASE3.12')||!columns.includes('Rud[deg]')||!zone.includes('EFD(IIHR)'))
    throw Error('Expected the IIHR Case 3.12 experimental record');
  const L=3.147,U=1.11,A=.01*L,k=2*Math.PI/L,slope=k*A;
  const rate=(Math.sqrt(9.80665*k)+k*U)*slope;
  const rows=[];
  for(const line of lines){
    const r=line.trim().split(/\s+/).map(Number);
    if(r.length!==15||!r.every(Number.isFinite))throw Error('Invalid experimental sample');
    if(r[0]<0)continue;
    const time=r[0]*L/U;
    if(rows.length&&time<=rows.at(-1).time)throw Error('Experimental clock must increase');
    rows.push({time,gauge:r[14]*L,east:r[1]*L,north:-r[2]*L,heave:-r[3]*A,roll:r[4]*slope,pitch:r[5]*slope,
      heading:-r[6]*slope,surge:r[7]*U,sway:-r[8]*U,w:-r[9]*U,p:r[10]*rate,q:r[11]*rate,
      yawRate:-r[12]*rate,helm:-r[13]});
  }
  if(rows.length<2||rows[0].time!==0)throw Error('Missing experimental release sample');
  const a=rows[0];
  return {rows,end:rows.at(-1).time,initial:{
    shaftDemand:538,initialRpm:538,tow:0,waveAmplitude:A,waveDirection:Math.PI,
    initialPhase:k*(1.625*Math.cos(a.heading)+.1*Math.sin(a.heading)),helm:a.helm,
    initialHeading:a.heading,initialSurge:a.surge,initialSway:a.sway,initialYawRate:a.yawRate,
    initialRoll:a.roll,initialPitch:a.pitch,initialHeave:a.heave,initialW:a.w,initialP:a.p,initialQ:a.q
  }};
}

export function sampleTrial(rows,time){
  let lo=0,hi=rows.length-1;
  while(hi-lo>1){
    const mid=(lo+hi)>>>1;
    if(rows[mid].time<=time)lo=mid;else hi=mid;
  }
  const a=rows[lo],b=rows[hi],f=Math.min(1,Math.max(0,(time-a.time)/(b.time-a.time)));
  return key=>a[key]+f*(b[key]-a[key]);
}

// W2025 Case 1.1-2 labels T and Q dummy. Only the two rps channels are used.
// Tokyo and Wageningen round the same nondimensional timestamps differently.
export function attachShaftRecord(trial,text){
  const [title,columns,zone,...lines]=text.trim().split(/\r?\n/);
  if(!title.includes('1.1-2_EFD')||!columns.includes('n<sub>2</sub> [rps]')||!zone.includes('EFD (mean)'))
    throw Error('Expected the W2025 Case 1.1 shaft-speed record');
  const samples=lines.map(line=>line.trim().split(/\s+/).map(Number)).filter(row=>row[0]>=0);
  if(samples.length!==trial.rows.length)throw Error('Incomplete shaft-speed record');
  const angles=[0,0], rpmKeys=['portRpm','starboardRpm'], angleKeys=['portAngle','starboardAngle'];
  for(const [i,row] of trial.rows.entries()){
    const sample=samples[i],previous=trial.rows[i-1];
    if(sample.length!==7||!sample.every(Number.isFinite)||Math.abs(row.time-sample[0]*3.147/1.11)>.00005)
      throw Error('Shaft and motion records out of sync');
    for(let j=0;j<2;j++){
      const rpm=sample[5+j]*60;
      if(previous)angles[j]+=(row.time-previous.time)*(previous[rpmKeys[j]]+rpm)*Math.PI/60;
      row[rpmKeys[j]]=rpm;row[angleKeys[j]]=angles[j];
    }
  }
}

// Resample successive solver steps onto the instrument clock before comparing elevations.
export function bowGaugeComparison(rows){
  const samples=[];
  let previous,sumSquared=0;
  return {samples,append(state){
    const a=previous??state;
    while(samples.length<rows.length){
      const row=rows[samples.length];
      if(row.time>state.time)break;
      const weight=state.time>a.time?(row.time-a.time)/(state.time-a.time):0;
      const value=a.bowGauge+weight*(state.bowGauge-a.bowGauge);
      sumSquared+=(value-row.gauge)**2;
      samples.push({time:row.time,value,rmse:Math.sqrt(sumSquared/(samples.length+1))});
    }
    previous=state;
  }};
}
