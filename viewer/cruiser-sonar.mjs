import {sonarHalfBearing,sonarRanges,sonarView} from './cruiser-sonar-view.mjs';

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

export function cruiserSonar(canvas,readout,rangeSelect,chart,showDisplay,observe){
  const view=sonarView(canvas);
  let worker,busy=false,last=-Infinity,points,displayed,selected,chosenBeam,scanPose,requestPose;
  let range=sonarRanges[0];
  const labels=['','Seabed','Structure','Fish','Large animal'];
  function draw(){
    if(points&&displayed!==points){view.update(points);displayed=points;}
    view.draw(selected);
    if(scanPose)chart(scanPose,range,points);
    if(selected){
      const {r,b,xyz,kind}=selected,bearing=b*180/Math.PI;
      const direction=Math.abs(bearing)<.1?'ahead':Math.abs(bearing).toFixed(0)+'° '+(bearing>0?'port':'starboard');
      readout.value=labels[kind]+' · '+r.toFixed(1)+' m range · '+direction+' · '+(-xyz[2]).toFixed(1)+' m deep';
    }else if(points)readout.value='No returns';
  }
  draw();
  canvas.dataset.range=String(range);
  rangeSelect.addEventListener('change',()=>{
    const value=Number(rangeSelect.value);
    if(!sonarRanges.includes(value)||value===range)return;
    range=value;canvas.dataset.range=String(range);last=-Infinity;
    points=displayed=selected=chosenBeam=undefined;
    canvas.dataset.returns='0';canvas.dataset.contact='';
    view.setRange(range);view.update([]);readout.value='Acquiring sonar…';draw();
  });
  const panel=canvas.closest('details'),tabs=panel.querySelectorAll('[data-pane]');
  panel.addEventListener('toggle',()=>{if(showDisplay())draw();});
  for(const tab of tabs)tab.addEventListener('click',()=>{
    panel.dataset.view=tab.dataset.pane;
    for(const option of tabs)option.setAttribute('aria-pressed',String(option===tab));
  });
  canvas.addEventListener('pointerdown',event=>{
    const point=view.pick(event);
    if(point){selected=point;chosenBeam=point.beam;draw();}
  });
  function start(){
    worker=new Worker(new URL('./cruiser-sonar-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      busy=false;
      if(data.error){readout.value='Sonar unavailable · '+data.error;return;}
      if(data.range!==range)return;
      scanPose=requestPose;
      const rows=data.echoes;
      points=[];selected=undefined;let nearest=Infinity,fishFound=false;
      for(let i=0;i<rows.length;i+=5){
        const r=rows[i],b=rows[i+1],e=rows[i+2],kind=rows[i+3],beam=rows[i+4];
        const ahead=r*Math.cos(e)*Math.cos(b),port=r*Math.cos(e)*Math.sin(b),up=r*Math.sin(e);
        const point={r,b,kind,beam,xyz:[ahead,port,up]};
        if((kind>=3&&!fishFound)||(kind>=3||!fishFound)&&r<nearest){selected=point;nearest=r;if(kind>=3)fishFound=true;}
        points.push(point);
      }
      const picked=points.find(p=>p.beam===chosenBeam);
      if(picked)selected=picked;else chosenBeam=undefined;
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
    const school=fishState(),fish=new Float64Array(school?.positions.length??0);
    if(school)for(let i=0;i<school.restock.length;i++){
      const k=4*i;fish[k]=Number(school.restock[i]<=school.time);
      fish.set(school.positions.slice(k,k+3),k+1);
    }
    const animals=new Float64Array(40),tracks=animalState();
    for(let i=0;i<10;i++)animals.set(tracks.subarray(9*i,9*i+4),4*i);
    requestPose=Array.from(pose);
    busy=true;worker.postMessage({pose:requestPose,fish,animals,range,halfBearing:sonarHalfBearing,level:surfaceAt(pose[0],pose[1])},[fish.buffer,animals.buffer]);
  };
}
