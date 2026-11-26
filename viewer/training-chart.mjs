// Plot one validation sample per completed round. Series share their chart's units.
export function trainingChart(canvas,series){
  const context=canvas.getContext('2d');
  const samples=[];
  function draw(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const ratio=Math.min(2,devicePixelRatio);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    if(!samples.length)return;
    let lo=Infinity,hi=-Infinity;
    for(const row of samples)for(const key of series.keys()){
      if(Number.isFinite(row[key])){lo=Math.min(lo,row[key]);hi=Math.max(hi,row[key]);}
    }
    if(!Number.isFinite(lo))return;
    const pad=Math.max(.001,(hi-lo)*.08);lo-=pad;hi+=pad;
    const left=44,top=6,bottom=h-18,right=w-10;
    const x=t=>left+(t-samples[0].round)/Math.max(1,samples.at(-1).round-samples[0].round)*(right-left);
    const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
    context.font='10px monospace';context.fillStyle='#b8d6d4';context.strokeStyle='#30535c';
    context.beginPath();
    for(const v of [lo,(lo+hi)/2,hi]){
      context.moveTo(left,y(v));context.lineTo(right,y(v));context.fillText(v.toFixed(3),1,y(v)+3);
    }
    context.stroke();context.fillText('Round '+samples[0].round,left,h-3);
    if(samples.length>1){context.textAlign='right';context.fillText(String(samples.at(-1).round),right,h-3);context.textAlign='left';}
    for(const [key,color] of series){
      context.strokeStyle=color;context.fillStyle=color;context.lineWidth=1.7;context.beginPath();
      let last;
      for(const r of samples){if(!Number.isFinite(r[key]))continue;const pt=[x(r.round),y(r[key])];if(last)context.lineTo(...pt);else context.moveTo(...pt);last=pt;}
      context.stroke();if(last){context.beginPath();context.arc(...last,2.4,0,2*Math.PI);context.fill();}
    }
  }
  return {add(row){samples.push(row);draw();},clear(){samples.length=0;draw();},draw};
}
