// Bearings on the dial are clockwise from true north. Model vectors are east/north.
export function drawCompass(canvas,wind,bearing,current,heading,location){
  const ctx=canvas.getContext('2d'),windColor='#ffc46e',currentColor='#71dce4';
  const currentSpeed=Math.hypot(current[0],current[1]);
  const flow=Math.atan2(current[1],current[0]);
  const degrees=ang=>String(((Math.round(90-ang*180/Math.PI)%360)+360)%360).padStart(3,'0')+'°';
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,185,98);
  ctx.save();ctx.translate(42,48);
  ctx.strokeStyle='#52717b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,27,0,2*Math.PI);ctx.stroke();
  ctx.fillStyle='#bdd2d5';ctx.font='9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [name,x,y] of [['N',0,-34],['E',34,0],['S',0,34],['W',-34,0]])ctx.fillText(name,x,y);
  function arrow(angle,radius,color){
    ctx.save();ctx.rotate(-angle);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(radius-4,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(radius,0);ctx.lineTo(radius-7,-3);ctx.lineTo(radius-7,3);ctx.closePath();ctx.fill();ctx.restore();
  }
  if(wind>.01)arrow(bearing,26,windColor);
  if(currentSpeed>.005)arrow(flow,19,currentColor);
  if(heading!==null)arrow(heading,11,'white');
  ctx.restore();
  ctx.font='10px monospace';ctx.fillStyle=windColor;ctx.fillText('WIND TO',87,17);
  ctx.fillText(wind.toFixed(1)+' m/s  '+(wind>.01?degrees(bearing):'—'),87,31);
  ctx.fillStyle=currentColor;ctx.fillText(location.toUpperCase()+' FLOW TO',87,48);
  ctx.fillText(currentSpeed.toFixed(2)+' m/s '+(currentSpeed>.005?degrees(flow):'—'),87,62);
  ctx.fillStyle='#ecf4f5';ctx.fillText(heading===null?'TRUE NORTH UP':'HDG '+degrees(heading),87,84);
  canvas.setAttribute('aria-label','Wind toward '+degrees(bearing)+' at '+wind.toFixed(1)+' metres per second. '+location+' flow toward '+degrees(flow)+' at '+currentSpeed.toFixed(2)+' metres per second.');
}
