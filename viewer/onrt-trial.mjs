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
    rows.push({time,east:r[1]*L,north:-r[2]*L,heave:-r[3]*A,roll:r[4]*slope,pitch:r[5]*slope,
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
