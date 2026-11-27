// Plot each lane relative to its own first sampled position in the current rollout.
export function trainingPaths(canvas,focus){
  const context=canvas.getContext('2d');
  let tracks=[],round,phase,batchTime;
  function clear(){
    tracks=[];round=phase=batchTime=undefined;
    focus.replaceChildren(new Option('All instances','-1'));
  }
  function draw(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    const ratio=Math.min(2,devicePixelRatio);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    const index=Number(focus.value),visible=index<0?tracks:[tracks[index]];
    let minX=0,maxX=0,minY=0,maxY=0;
    for(const track of visible)for(const [x,y] of track?.points??[]){
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const scale=Math.min((width-40)/Math.max(1,maxX-minX),(height-40)/Math.max(1,maxY-minY));
    const originX=(width-(maxX+minX)*scale)/2,originY=(height+(maxY+minY)*scale)/2;
    context.strokeStyle='#355965';context.beginPath();
    context.moveTo(originX,0);context.lineTo(originX,height);context.moveTo(0,originY);context.lineTo(width,originY);context.stroke();
    for(const [i,track] of visible.entries()){
      if(!track?.points.length)continue;
      const color='hsl('+((index<0?i:index)*47+165)%360+' 70% 70%)';
      context.strokeStyle=context.fillStyle=color;context.beginPath();
      let x,y;
      for(const [east,north] of track.points){
        x=originX+east*scale;y=originY-north*scale;context.lineTo(x,y);
      }
      context.stroke();context.beginPath();context.arc(x,y,2.4,0,2*Math.PI);context.fill();
    }
    const metres=10**Math.floor(Math.log10(Math.max(.0001,width*.22/scale)));
    context.fillStyle=context.strokeStyle='#c3dedf';context.font='11px monospace';
    context.fillText('N ↑   E →',6,12);context.fillText(metres+' m',6,height-9);
    context.beginPath();context.moveTo(6,height-4);context.lineTo(6+metres*scale,height-4);context.stroke();
  }
  function add(data,positionOffset=0){
    const rows=data.frames;
    if(!rows?.length)return;
    if(rows.length!==tracks.length){
      focus.replaceChildren(new Option('All instances','-1'),...rows.map((_,i)=>new Option('Instance '+(i+1),String(i))));
    }
    if(rows.length!==tracks.length||round!==data.round||phase!==data.phase||batchTime>=data.batchSeconds){
      tracks=rows.map(()=>({origin:null,points:[]}));
    }
    round=data.round;phase=data.phase;batchTime=data.batchSeconds;
    rows.forEach((row,i)=>{
      const east=row[positionOffset],north=row[positionOffset+1];
      if(!Number.isFinite(east)||!Number.isFinite(north))return;
      const track=tracks[i];track.origin??=[east,north];
      track.points.push([east-track.origin[0],north-track.origin[1]]);
    });
    draw();
  }
  return {clear,add,draw};
}
