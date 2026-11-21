// Project the measured slant-range cells into a forward-looking fan (port left).
export function imagingSonar(canvas){
  const ctx=canvas.getContext('2d'),{width,height}=canvas;
  const pixels=ctx.createImageData(width,height),radius=height-15,cx=width/2,cy=height-7;
  const halfFan=65*Math.PI/180;
  const lookup=new Int16Array(width*height).fill(-1);
  const mixB=new Float32Array(lookup.length),mixR=new Float32Array(lookup.length);
  const bins=128,bearings=65,cells=new Uint8Array(bins*bearings);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,dx=x+.5-cx,dy=cy-y-.5;
    pixels.data[i*4+3]=255;
    const r=Math.hypot(dx,dy)/radius,a=Math.atan2(-dx,dy);
    if(r>1||Math.abs(a)>halfFan)continue;
    const b=Math.min(63.99999,(a/halfFan+1)*32),s=Math.max(0,Math.min(126.99999,r*bins-.5));
    lookup[i]=Math.floor(b)*bins+Math.floor(s);
    mixB[i]=b%1;mixR[i]=s%1;
  }
  let previous;
  return words=>{
    if(!words||words===previous)return;
    previous=words;
    for(let i=0;i<words.length;i++)for(let j=0;j<4;j++)cells[4*i+j]=(words[i]>>>(8*j))&255;
    for(let i=0;i<lookup.length;i++){
      const k=lookup[i];if(k<0)continue;
      const u=mixR[i],v=mixB[i];
      const value=(1-v)*((1-u)*cells[k]+u*cells[k+1])+v*((1-u)*cells[k+bins]+u*cells[k+bins+1]);
      pixels.data[4*i]=Math.min(255,1.32*value);
      pixels.data[4*i+1]=.82*value;
      pixels.data[4*i+2]=.13*value+.40*Math.max(0,value-150);
    }
    ctx.putImageData(pixels,0,0);
    ctx.strokeStyle='rgba(250,211,138,.31)';ctx.lineWidth=.7;
    ctx.fillStyle='#c8ae80';ctx.font='10px sans-serif';
    for(const metres of [6,12,18]){
      const r=radius*metres/18;
      ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2-halfFan,-Math.PI/2+halfFan);ctx.stroke();
      ctx.fillText(metres+' m',cx+3,cy-r+10);
    }
    for(const angle of [-65,-30,0,30,65]){
      const a=angle*Math.PI/180;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+radius*Math.sin(a),cy-radius*Math.cos(a));ctx.stroke();
    }
  };
}
