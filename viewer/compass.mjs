// Bearings on the dial are clockwise from true north. Model vectors are east/north.
export function drawCompass(canvas,wind,bearing,current,heading,location,noGo){
  if(location==='surface')return drawSailingDial(canvas,wind,bearing,current,heading,noGo);
  const ctx=canvas.getContext('2d'),windColor='#ffc46e',currentColor='#71dce4';
  const currentSpeed=Math.hypot(current[0],current[1]);
  const flow=Math.atan2(current[1],current[0]);
  const degrees=ang=>String(((Math.round(90-ang*180/Math.PI)%360)+360)%360).padStart(3,'0')+'°';
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,canvas.width/2,canvas.height/2);
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

// Angles from the model are east-zero and counterclockwise. The sailing dial
// is bow-up and clockwise, with zero at twelve o'clock.
function drawSailingDial(canvas,wind,bearing,current,heading,noGo){
  const ctx=canvas.getContext('2d');
  const centerX=67,centerY=66,r=54;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const from=wrap(heading-bearing-Math.PI);
  const hasWind=wind>.01,inside=hasWind&&Math.abs(from)<=noGo;
  const compass=a=>String(((Math.round(90-a*180/Math.PI)%360)+360)%360).padStart(3,'0')+'°';
  const side=from<0?'port':'starboard';
  const angle=Math.round(Math.abs(from)*180/Math.PI);
  const currentSpeed=Math.hypot(...current);
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,274,132);
  ctx.save();ctx.translate(centerX,centerY);
  ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.fillStyle='#112a34';ctx.fill();
  if(hasWind){
    ctx.save();ctx.rotate(from-Math.PI/2);
    ctx.fillStyle='rgba(242,104,81,.28)';ctx.beginPath();ctx.moveTo(0,0);
    ctx.arc(0,0,r,-noGo,noGo);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f28c74';ctx.lineWidth=1.5;
    for(const limit of [-noGo,noGo]){
      ctx.beginPath();ctx.moveTo(11*Math.cos(limit),11*Math.sin(limit));ctx.lineTo(r*Math.cos(limit),r*Math.sin(limit));ctx.stroke();
    }
    ctx.strokeStyle='#ffbf70';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r,-noGo,noGo);ctx.stroke();
    ctx.fillStyle='#ffd091';ctx.beginPath();ctx.moveTo(r-14,0);ctx.lineTo(r+3,-4);ctx.lineTo(r+3,4);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  // True compass card rotates beneath a fixed bow index.
  const bowBearing=Math.PI/2-heading;
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<72;i++){
    const a=i*Math.PI/36-bowBearing,major=i%6===0;
    ctx.strokeStyle=major?'#d2e4e8':'#77949c';ctx.lineWidth=major?1.5:1;
    ctx.beginPath();ctx.moveTo((r-1)*Math.sin(a),-(r-1)*Math.cos(a));
    ctx.lineTo((r-(major?7:3))*Math.sin(a),-(r-(major?7:3))*Math.cos(a));ctx.stroke();
    if(major){
      ctx.fillStyle=i===0?'#ffc46e':'#e2eff0';
      ctx.font='bold 10px monospace';
      const cardinal={0:'N',18:'E',36:'S',54:'W'}[i];
      ctx.fillText(cardinal||String(i*5),(r-15)*Math.sin(a),-(r-15)*Math.cos(a));
    }
  }
  ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-r+2);
  ctx.lineTo(-4,-r-7);ctx.lineTo(4,-r-7);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(0,-21);ctx.quadraticCurveTo(11,-7,7,15);ctx.lineTo(-7,15);ctx.quadraticCurveTo(-11,-7,0,-21);
  ctx.fillStyle=inside?'#ffb6a4':'#f0f8f6';ctx.fill();
  ctx.restore();
  function label(msg,y,color,size,bold=false){
    ctx.font=(bold?'bold ':'')+size+'px system-ui,sans-serif';ctx.fillStyle=color;ctx.fillText(msg,141,y);
  }
  label('TRUE HEADING',15,'#c1d5da',10,true);
  label(compass(heading)+'T',42,'#fff',26,true);
  label(hasWind?(inside?'IN NO-GO ZONE':'TRUE WIND FROM'):'CALM',63,inside?'#ffae96':'#c1d5da',11,true);
  label(hasWind?angle+'° '+(angle===0||angle===180?'':side):'—',81,'#fff',15,true);
  label(wind.toFixed(1)+' m/s · No-go ±'+Math.round(noGo*180/Math.PI)+'°',101,'#ffbd97',11);
  label('Set '+(currentSpeed>.005?compass(Math.atan2(current[1],current[0])):'—')+' · '+currentSpeed.toFixed(2)+' m/s',120,'#84d9df',11);
  canvas.setAttribute('aria-label','Bow-up sailing dial. '+(hasWind?'True wind from '+angle+' degrees'+(angle===0||angle===180?'':' '+side)+'. '+(inside?'Inside':'Outside')+' the no-go sector.':'Calm.')+' Heading '+compass(heading)+'.');
}
