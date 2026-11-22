// Group adjacent structure beams or nearby bait echoes in the measured volume.
export function nearestSonarContact(points){
  const structures=new Map(),fish=[],pending=new Set();
  let nearest=Infinity;
  for(const p of points){
    if(p.kind===4)nearest=Math.min(nearest,p.r);
    if(p.kind===2)structures.set(p.beam,p);
    if(p.kind===3)fish.push(p);
    if(p.kind===2||p.kind===3)pending.add(p);
  }
  for(const seed of pending){
    pending.delete(seed);
    const group=[seed],low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    let range=Infinity;
    for(let i=0;i<group.length;i++){
      const p=group[i];
      range=Math.min(range,p.r);
      for(let j=0;j<3;j++){low[j]=Math.min(low[j],p.xyz[j]);high[j]=Math.max(high[j],p.xyz[j]);}
      let neighbors=fish;
      if(p.kind===2){
        const col=p.beam%21;
        neighbors=[col>0&&structures.get(p.beam-1),col<20&&structures.get(p.beam+1),
          structures.get(p.beam-21),structures.get(p.beam+21)];
      }
      for(const q of neighbors){
        if(!pending.has(q))continue;
        const close=p.kind===2?Math.abs(p.r-q.r)<=Math.max(.65,.15*Math.min(p.r,q.r)):
          Math.hypot(p.xyz[0]-q.xyz[0],p.xyz[1]-q.xyz[1],p.xyz[2]-q.xyz[2])<=1.5;
        if(close){pending.delete(q);group.push(q);}
      }
    }
    const large=high.some((v,j)=>v-low[j]>=.8);
    if(group.length>=3&&(large||seed.kind===2&&group.length>=9))nearest=Math.min(range,nearest);
  }
  return Number.isFinite(nearest)?nearest:null;
}

export const imagingBeepInterval=range=>900+85*range;

// Both plots use the same forward/port/up coordinates for every individual return.
export function cruiserSonar(canvas,readout,showDisplay,observe){
  const c=canvas.getContext('2d'),origin=[[120,173],[258,43]],scale=3.65;
  let worker,busy=false,last=-Infinity,points=[],selected=0,chosenBeam;
  const labels=['','Seabed','Structure','Fish','Large animal'],colors=['','#62c1ac','#9bbcd1','#ffd078','#f79d75'];
  function draw(){
    c.fillStyle='#081d26';c.fillRect(0,0,480,200);
    c.font='13px monospace';c.fillStyle='#cde8ec';c.fillText('Plan · bow up',8,17);c.fillText('Elevation · bow right',249,17);
    c.font='11px monospace';
    for(let panel=0;panel<2;panel++){
      const [x,y]=origin[panel],start=panel===0?-Math.PI/2-55*Math.PI/180:0,end=panel===0?-Math.PI/2+55*Math.PI/180:Math.PI/3;
      c.strokeStyle='#355664';c.fillStyle='#9ec4ce';
      for(const metres of [12,24,36]){
        c.beginPath();c.arc(x,y,metres*scale,start,end);c.stroke();
        const angle=panel===0?end:start;
        c.fillText(metres+' m',x+metres*scale*Math.cos(angle)+2,y+metres*scale*Math.sin(angle)+(panel===0?8:-3));
      }
      for(const angle of [start,end]){c.beginPath();c.moveTo(x,y);c.lineTo(x+36*scale*Math.cos(angle),y+36*scale*Math.sin(angle));c.stroke();}
      c.fillRect(x-2,y-2,4,4);
    }
    c.fillStyle='#86acb7';c.fillText('PORT',6,104);c.fillText('STBD',193,104);c.fillText('−60°',316,166);
    for(const p of points){
      c.fillStyle=colors[p.kind];
      for(const [x,y] of p.screen){const r=p.kind>=3?2.7:1.65;c.fillRect(x-r,y-r,2*r,2*r);}
    }
    const p=points[selected];
    if(p){
      c.strokeStyle='#fff';for(const [x,y] of p.screen){c.beginPath();c.arc(x,y,5.2,0,2*Math.PI);c.stroke();}
      const bearing=p.b*180/Math.PI,elevation=p.e*180/Math.PI;
      readout.value=labels[p.kind]+' · '+p.r.toFixed(1)+' m · '+Math.abs(bearing).toFixed(0)+'° '+(Math.abs(bearing)<.1?'ahead':bearing>0?'port':'starboard')+' · '+elevation.toFixed(0)+'° elevation';
    }else readout.value='No returns';
    for(const [i,x] of [[1,12],[2,130],[3,245],[4,326]]){c.fillStyle=colors[i];c.fillRect(x,188,8,8);c.fillText(labels[i],x+13,196);}
  }
  canvas.addEventListener('pointerdown',event=>{
    const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*480/r.width,y=(event.clientY-r.top)*200/r.height;
    let dist=13**2;
    points.forEach((p,i)=>{for(const a of p.screen){const d=(x-a[0])**2+(y-a[1])**2;if(d<dist){dist=d;selected=i;chosenBeam=p.beam;}}});
    draw();
  });
  function start(){
    worker=new Worker(new URL('./cruiser-sonar-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      busy=false;
      if(data.error){readout.value='Sonar unavailable · '+data.error;return;}
      const rows=data.echoes;
      points=[];let nearest=Infinity,fishFound=false;
      for(let i=0;i<rows.length;i+=5){
        const r=rows[i],b=rows[i+1],e=rows[i+2],kind=rows[i+3],beam=rows[i+4];
        const ahead=r*Math.cos(e)*Math.cos(b),port=r*Math.cos(e)*Math.sin(b),up=r*Math.sin(e);
        const screen=[[origin[0][0]-scale*port,origin[0][1]-scale*ahead],[origin[1][0]+scale*ahead,origin[1][1]-scale*up]];
        if((kind>=3&&!fishFound)||(kind>=3||!fishFound)&&r<nearest){selected=points.length;nearest=r;if(kind>=3)fishFound=true;}
        points.push({r,b,e,kind,beam,screen,xyz:[ahead,port,up]});
      }
      const picked=points.findIndex(p=>p.beam===chosenBeam);
      if(picked>=0)selected=picked;else chosenBeam=undefined;
      canvas.dataset.returns=String(points.length);
      const contact=nearestSonarContact(points);
      canvas.dataset.contact=contact===null?'':contact.toFixed(2);
      observe(contact);
      if(showDisplay())draw();
    };
    worker.onerror=()=>{busy=false;readout.value='Sonar unavailable';};
  }
  return function ping(now,pose,surfaceAt,fishState,animalState){
    if(busy||now-last<400)return;
    last=now;if(!worker)start();
    const fish=new Float64Array(144),school=fishState();
    if(school)for(let i=0;i<36;i++){
      const k=4*i;fish[k]=Number(school.restock[i]<=school.time);
      fish.set(school.positions.slice(k,k+3),k+1);
    }
    const animals=new Float64Array(40),tracks=animalState();
    for(let i=0;i<10;i++)animals.set(tracks.subarray(9*i,9*i+4),4*i);
    busy=true;worker.postMessage({pose:Array.from(pose),fish,animals,level:surfaceAt(pose[0],pose[1])},[fish.buffer,animals.buffer]);
  };
}
